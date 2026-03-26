import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { getMockBackendSeedCredentials, mockBackend } from '@/lib/backend/mockBackend'

function createTextDocument(text: string, revision: number) {
  return {
    ...createDefaultScenarioDocument(),
    revision,
    elements: [
      {
        id: 'text-1',
        kind: 'text' as const,
        position: [35, 39] as [number, number],
        text,
        fontSize: 24,
        fontWeight: 700,
        align: 'center' as const,
        rotation: 0,
        scale: 1,
        zIndex: 1,
        locked: false,
        meta: {},
        style: {
          strokeColor: '#12213f',
          fillColor: 'rgba(0, 0, 0, 0)',
          textColor: '#12213f',
          lineWidth: 3,
          opacity: 1,
          lineDash: [],
          endArrow: false,
        },
      },
    ],
  }
}

describe('mockBackend', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await mockBackend.logout()
  })

  it('creates managed users and allows login with the generated password', async () => {
    const seedCredentials = getMockBackendSeedCredentials()
    await mockBackend.login(seedCredentials.username, seedCredentials.password)

    const result = await mockBackend.createUser({ username: 'analist' })

    expect(result.user.username).toBe('analist')
    expect(result.user.role).toBe('user')
    expect(result.password).toHaveLength(24)

    await mockBackend.logout()
    const session = await mockBackend.login('analist', result.password)

    expect(session.username).toBe('analist')
    expect(session.role).toBe('user')
  })

  it('prevents a second editor from taking an active lock', async () => {
    const seedCredentials = getMockBackendSeedCredentials()
    const firstSession = await mockBackend.login(seedCredentials.username, seedCredentials.password)
    const secondUser = await mockBackend.createUser({ username: 'ikinci' })
    const scenario = await mockBackend.createScenario({ title: 'Kilit Testi' })
    await mockBackend.claimEditorLock(scenario.id, firstSession)

    await mockBackend.logout()
    const secondSession = await mockBackend.login('ikinci', secondUser.password)

    await expect(mockBackend.claimEditorLock(scenario.id, secondSession)).rejects.toThrow(/editor/i)
  })

  it('prevents demoting the last admin', async () => {
    const seedCredentials = getMockBackendSeedCredentials()
    const adminSession = await mockBackend.login(seedCredentials.username, seedCredentials.password)

    await expect(mockBackend.updateUserRole(adminSession.id, 'user')).rejects.toThrow(/son admin/i)
  })

  it('creates and restores snapshots with an active editor lock', async () => {
    const seedCredentials = getMockBackendSeedCredentials()
    const adminSession = await mockBackend.login(seedCredentials.username, seedCredentials.password)
    const scenario = await mockBackend.createScenario({ title: 'Snapshot Testi' })
    await mockBackend.claimEditorLock(scenario.id, adminSession)

    const firstDocument = createTextDocument('ilk durum', 2)
    await mockBackend.saveScenario(scenario.id, firstDocument)

    const snapshot = await mockBackend.createSnapshot(scenario.id)
    expect(snapshot.revision).toBe(2)

    const secondDocument = createTextDocument('ikinci durum', 3)
    await mockBackend.saveScenario(scenario.id, secondDocument)

    const restored = await mockBackend.restoreSnapshot(snapshot.id)

    expect(restored.document.elements).toHaveLength(1)
    expect(restored.document.elements[0]?.kind).toBe('text')
    expect(restored.document.elements[0] && 'text' in restored.document.elements[0]
      ? restored.document.elements[0].text
      : null).toBe('ilk durum')
    expect(restored.revision).toBe(4)

    const snapshots = await mockBackend.listSnapshots(scenario.id)
    expect(snapshots).toHaveLength(1)
  })
})
