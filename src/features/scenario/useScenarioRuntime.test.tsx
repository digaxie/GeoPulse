import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'

import { AuthContext, type AuthContextValue } from '@/features/auth/authContext'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { useScenarioRuntime } from '@/features/scenario/useScenarioRuntime'
import { useScenarioStore } from '@/features/scenario/store'
import type { AuthSession, ScenarioDetailRecord, ScenarioLock } from '@/lib/backend/types'

const backendMocks = vi.hoisted(() => {
  return {
    backendClient: {
      mode: 'supabase',
      getScenarioById: vi.fn(),
      getScenarioByViewerSlug: vi.fn(),
      claimEditorLock: vi.fn(),
      releaseEditorLock: vi.fn(),
      refreshEditorLock: vi.fn(),
      subscribeToScenario: vi.fn(),
      saveScenario: vi.fn(),
      updateTitle: vi.fn(),
    },
  }
})

vi.mock('@/lib/backend', () => ({
  backendClient: backendMocks.backendClient,
}))

function createRecord(): ScenarioDetailRecord {
  return {
    id: 'scenario-1',
    title: 'Test Senaryosu',
    viewerSlug: 'test-viewer',
    document: createDefaultScenarioDocument(),
    updatedAt: new Date('2026-03-21T10:00:00.000Z').toISOString(),
    revision: 1,
    lock: null,
  }
}

function createLock(session: AuthSession): ScenarioLock {
  return {
    holderId: session.id,
    holderUsername: session.username,
    expiresAt: new Date('2026-03-21T10:05:00.000Z').toISOString(),
  }
}

function createAuthValue(session: AuthSession | null): AuthContextValue {
  return {
    session,
    isLoading: false,
    backendMode: 'supabase',
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  }
}

describe('useScenarioRuntime', () => {
  let originalReset: ReturnType<typeof useScenarioStore.getState>['reset']
  let subscriptionHandler: ((record: ScenarioDetailRecord) => void) | null

  beforeEach(() => {
    vi.clearAllMocks()
    useScenarioStore.getState().reset()
    originalReset = useScenarioStore.getState().reset
    subscriptionHandler = null

    backendMocks.backendClient.getScenarioById.mockResolvedValue(createRecord())
    backendMocks.backendClient.getScenarioByViewerSlug.mockResolvedValue(createRecord())
    backendMocks.backendClient.releaseEditorLock.mockResolvedValue(undefined)
    backendMocks.backendClient.refreshEditorLock.mockResolvedValue(null)
    backendMocks.backendClient.saveScenario.mockResolvedValue(createRecord())
    backendMocks.backendClient.updateTitle.mockResolvedValue(undefined)
    backendMocks.backendClient.subscribeToScenario.mockImplementation((_target, callback) => {
      subscriptionHandler = callback
      return () => undefined
    })
  })

  afterEach(() => {
    useScenarioStore.setState({ reset: originalReset } as Partial<ReturnType<typeof useScenarioStore.getState>>)
    useScenarioStore.getState().reset()
  })

  it('does not reload when the session object changes for the same user', async () => {
    const initialSession: AuthSession = {
      id: 'user-1',
      username: 'admin',
      role: 'admin',
    }
    let currentSession = initialSession

    const resetSpy = vi.fn(() => originalReset())
    useScenarioStore.setState({ reset: resetSpy } as Partial<ReturnType<typeof useScenarioStore.getState>>)

    backendMocks.backendClient.claimEditorLock.mockImplementation(async (_scenarioId, session: AuthSession) =>
      createLock(session),
    )

    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthContext.Provider value={createAuthValue(currentSession)}>{children}</AuthContext.Provider>
    )

    const { result, rerender } = renderHook(
      () => useScenarioRuntime({ mode: 'editor', scenarioId: 'scenario-1' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    const initialResetCalls = resetSpy.mock.calls.length
    const initialGetScenarioCalls = backendMocks.backendClient.getScenarioById.mock.calls.length
    const initialClaimLockCalls = backendMocks.backendClient.claimEditorLock.mock.calls.length

    currentSession = {
      ...initialSession,
      email: 'admin@example.com',
    }

    await act(async () => {
      rerender()
    })

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledTimes(initialResetCalls)
      expect(backendMocks.backendClient.getScenarioById).toHaveBeenCalledTimes(initialGetScenarioCalls)
      expect(backendMocks.backendClient.claimEditorLock).toHaveBeenCalledTimes(initialClaimLockCalls)
    })
  })

  it('applies same-revision metadata updates without reloading the editor document', async () => {
    const currentSession: AuthSession = {
      id: 'user-1',
      username: 'admin',
      role: 'admin',
    }

    backendMocks.backendClient.claimEditorLock.mockImplementation(async (_scenarioId, session: AuthSession) =>
      createLock(session),
    )

    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthContext.Provider value={createAuthValue(currentSession)}>{children}</AuthContext.Provider>
    )

    const { result } = renderHook(
      () => useScenarioRuntime({ mode: 'editor', scenarioId: 'scenario-1' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    const initialLoadCalls = backendMocks.backendClient.getScenarioById.mock.calls.length

    act(() => {
      subscriptionHandler?.({
        ...createRecord(),
        title: 'Uzaktan Guncellenen Baslik',
        viewerSlug: 'updated-viewer-slug',
        updatedAt: new Date('2026-03-21T10:10:00.000Z').toISOString(),
        lock: createLock(currentSession),
      })
    })

    await waitFor(() => {
      const nextState = useScenarioStore.getState()
      expect(nextState.title).toBe('Uzaktan Guncellenen Baslik')
      expect(nextState.viewerSlug).toBe('updated-viewer-slug')
      expect(nextState.updatedAt).toBe(new Date('2026-03-21T10:10:00.000Z').toISOString())
      expect(nextState.lock).toEqual(createLock(currentSession))
      expect(backendMocks.backendClient.getScenarioById).toHaveBeenCalledTimes(initialLoadCalls)
    })
  })

  it('reloads when the authenticated user actually changes', async () => {
    let currentSession: AuthSession | null = {
      id: 'user-a',
      username: 'alpha',
      role: 'admin',
    }

    const resetSpy = vi.fn(() => originalReset())
    useScenarioStore.setState({ reset: resetSpy } as Partial<ReturnType<typeof useScenarioStore.getState>>)

    backendMocks.backendClient.claimEditorLock.mockImplementation(async (_scenarioId, session: AuthSession) =>
      createLock(session),
    )

    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthContext.Provider value={createAuthValue(currentSession)}>{children}</AuthContext.Provider>
    )

    const { result, rerender } = renderHook(
      () => useScenarioRuntime({ mode: 'editor', scenarioId: 'scenario-1' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    const initialResetCalls = resetSpy.mock.calls.length
    const initialGetScenarioCalls = backendMocks.backendClient.getScenarioById.mock.calls.length
    const initialClaimLockCalls = backendMocks.backendClient.claimEditorLock.mock.calls.length

    currentSession = {
      id: 'user-b',
      username: 'bravo',
      role: 'admin',
    }

    await act(async () => {
      rerender()
    })

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledTimes(initialResetCalls + 1)
      expect(backendMocks.backendClient.getScenarioById).toHaveBeenCalledTimes(initialGetScenarioCalls + 1)
      expect(backendMocks.backendClient.claimEditorLock).toHaveBeenCalledTimes(initialClaimLockCalls + 1)
    })
  })
})
