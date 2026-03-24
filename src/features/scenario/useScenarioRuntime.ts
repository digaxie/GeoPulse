import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { useAuth } from '@/features/auth/useAuth'
import { useScenarioStore } from '@/features/scenario/store'
import { backendClient } from '@/lib/backend'
import { createLogger } from '@/lib/logger'

const log = createLogger('ScenarioRuntime')

const EDITOR_SAVE_DEBOUNCE_MS = 180
const VIEWER_FALLBACK_BACKOFF_MS = [2000, 5000, 10000, 20000, 30000] as const

type RuntimeInput =
  | {
      mode: 'editor'
      scenarioId: string
    }
  | {
      mode: 'viewer'
      viewerSlug: string
    }

type ScenarioDetailResult = NonNullable<
  Awaited<ReturnType<typeof backendClient.getScenarioById>>
>

export function useScenarioRuntime(input: RuntimeInput) {
  const mode = input.mode
  const requestedScenarioId = input.mode === 'editor' ? input.scenarioId : null
  const requestedViewerSlug = input.mode === 'viewer' ? input.viewerSlug : null
  const { session } = useAuth()
  const sessionUserId = session?.id ?? null
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runtime reload should track user identity, not token refreshes
  const stableSession = useMemo(() => session, [sessionUserId])
  const initialize = useScenarioStore((state) => state.initialize)
  const setAccess = useScenarioStore((state) => state.setAccess)
  const setLock = useScenarioStore((state) => state.setLock)
  const syncScenarioMetadata = useScenarioStore((state) => state.syncScenarioMetadata)
  const setSaveState = useScenarioStore((state) => state.setSaveState)
  const markSaved = useScenarioStore((state) => state.markSaved)
  const reset = useScenarioStore((state) => state.reset)
  const scenarioDocument = useScenarioStore((state) => state.document)
  const title = useScenarioStore((state) => state.title)
  const access = useScenarioStore((state) => state.access)
  const scenarioId = useScenarioStore((state) => state.scenarioId)
  const lastSavedRevision = useScenarioStore((state) => state.lastSavedRevision)
  const [lastSavedTitle, setLastSavedTitle] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [viewerPollingFallback, setViewerPollingFallback] = useState(false)
  const lastEditorViewportRef = useRef<{ center: [number, number]; zoom: number } | null>(null)

  const applyIncomingRecord = useEffectEvent((record: ScenarioDetailResult) => {
    if (mode === 'viewer') {
      const currentDocument = useScenarioStore.getState().document
      const currentActiveSlideId = currentDocument.briefing?.activeSlideId ?? null
      const incomingActiveSlideId = record.document.briefing?.activeSlideId ?? null
      const activeSlideChanged = currentActiveSlideId !== incomingActiveSlideId
      const incomingVp = record.document.viewport
      const lastVp = lastEditorViewportRef.current

      const editorMoved =
        !lastVp ||
        Math.abs(lastVp.center[0] - incomingVp.center[0]) > 0.001 ||
        Math.abs(lastVp.center[1] - incomingVp.center[1]) > 0.001 ||
        Math.abs(lastVp.zoom - incomingVp.zoom) > 0.05

      lastEditorViewportRef.current = {
        center: incomingVp.center,
        zoom: incomingVp.zoom,
      }

      if (editorMoved || activeSlideChanged) {
        initialize(record, 'viewer')
      } else {
        const currentViewport = useScenarioStore.getState().document.viewport
        initialize(
          { ...record, document: { ...record.document, viewport: currentViewport } },
          'viewer',
        )
      }
      return
    }

    const currentState = useScenarioStore.getState()
    if (record.revision < currentState.document.revision) {
      return
    }

    if (record.revision === currentState.document.revision) {
      syncScenarioMetadata({
        title: record.title,
        viewerSlug: record.viewerSlug,
        updatedAt: record.updatedAt,
        lock: record.lock,
      })
      setLastSavedTitle(record.title)
      return
    }

    setLastSavedTitle(record.title)
    initialize(record, currentState.access === 'editor' ? 'editor' : 'locked')
  })

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => undefined
    let releaseLock = () => Promise.resolve()

    const load = async () => {
      setStatus('loading')
      setError(null)
      setViewerPollingFallback(false)
      reset()

      try {
        if (mode === 'editor' && !stableSession) {
          throw new Error('Editor moduna girmek icin once giris yapin.')
        }

        const record =
          mode === 'editor'
            ? await backendClient.getScenarioById(requestedScenarioId ?? '')
            : await backendClient.getScenarioByViewerSlug(requestedViewerSlug ?? '')

        if (!record) {
          throw new Error('Senaryo bulunamadi.')
        }

        setLastSavedTitle(record.title)

        if (mode === 'viewer') {
          initialize(record, 'viewer')
        } else if (stableSession) {
          try {
            const lock = await backendClient.claimEditorLock(record.id, stableSession)
            initialize({ ...record, lock }, 'editor')
            releaseLock = () => backendClient.releaseEditorLock(record.id, stableSession)
          } catch (lockError) {
            initialize(record, 'locked')
            setAccess('locked')
            setError(lockError instanceof Error ? lockError.message : 'Editor kilidi alinamadi.')
          }
        }

        unsubscribe = backendClient.subscribeToScenario(
          mode === 'editor' ? { id: record.id } : { viewerSlug: record.viewerSlug },
          (nextRecord) => {
            if (!active) {
              return
            }

            applyIncomingRecord(nextRecord)
          },
          {
            onError: (subscriptionError) => {
              if (!active) {
                return
              }

              log.warn('Realtime kanal sorunu', {
                action: 'subscribe',
                mode,
                scenarioId: record.id,
                errorMessage: subscriptionError.message,
                report: true,
              })

              if (mode === 'viewer') {
                setViewerPollingFallback(true)
              }
            },
            onStatusChange: (nextStatus) => {
              if (!active || mode !== 'viewer') {
                return
              }

              if (nextStatus === 'subscribed') {
                setViewerPollingFallback(false)
                return
              }

              if (nextStatus === 'error' || nextStatus === 'closed') {
                setViewerPollingFallback(true)
              }
            },
          },
        )

        if (active) {
          setStatus('ready')
        }
      } catch (loadError) {
        if (active) {
          setStatus('error')
          setError(loadError instanceof Error ? loadError.message : 'Senaryo acilamadi.')
        }
      }
    }

    void load()

    return () => {
      active = false
      unsubscribe()
      void releaseLock()
    }
  }, [
    initialize,
    mode,
    requestedScenarioId,
    requestedViewerSlug,
    reset,
    stableSession,
    setAccess,
    syncScenarioMetadata,
  ])

  async function saveNow() {
    if (mode !== 'editor' || access !== 'editor' || !scenarioId) {
      return null
    }

      try {
        setSaveState('saving')
        const record = await backendClient.saveScenario(scenarioId, scenarioDocument)
        markSaved(record.revision)
        syncScenarioMetadata({
          title: record.title,
          viewerSlug: record.viewerSlug,
          updatedAt: record.updatedAt,
          lock: record.lock,
        })
        setLastSavedTitle(record.title)
        log.info('Senaryo kaydedildi', { action: 'save', scenarioId, revision: record.revision })
        return record
    } catch (saveError) {
      setSaveState('error')
      const message = saveError instanceof Error ? saveError.message : 'Kayit yapilamadi.'
      log.error('Kayit hatasi', { action: 'save', scenarioId, errorMessage: message })
      setError(message)
      throw saveError
    }
  }

  const saveDocument = useEffectEvent(saveNow)

  useEffect(() => {
    if (mode !== 'editor' || access !== 'editor' || !scenarioId) {
      return
    }

    if (scenarioDocument.revision === lastSavedRevision) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void saveDocument()
    }, EDITOR_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [access, lastSavedRevision, mode, scenarioDocument.revision, scenarioId])

  useEffect(() => {
    if (mode !== 'editor' || access !== 'editor' || !scenarioId) {
      return
    }

    if (title === lastSavedTitle || !title.trim()) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void backendClient
        .updateTitle(scenarioId, title)
        .then(() => {
          setLastSavedTitle(title)
          log.info('Baslik guncellendi', { action: 'updateTitle', scenarioId, title })
        })
        .catch((titleError) => {
          log.error('Baslik guncellenemedi', {
            action: 'updateTitle',
            errorMessage: String(titleError),
          })
        })
    }, 600)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [access, lastSavedTitle, mode, scenarioId, title])

  async function refreshLockNow() {
    if (mode !== 'editor' || access !== 'editor' || !scenarioId || !sessionUserId || !session) {
      return null
    }

    try {
      const nextLock = await backendClient.refreshEditorLock(scenarioId, session)
      setLock(nextLock)
      return nextLock
    } catch (lockError) {
      setAccess('locked')
      const message =
        lockError instanceof Error ? lockError.message : 'Editor kilidi dusuruldu.'
      log.warn('Editor kilidi dusuruldu', {
        action: 'refreshLock',
        scenarioId,
        errorMessage: message,
        report: true,
      })
      setError(message)
      throw lockError
    }
  }

  const refreshLock = useEffectEvent(refreshLockNow)

  useEffect(() => {
    if (mode !== 'editor' || access !== 'editor') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshLock()
    }, 25_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [access, mode])

  const pollViewer = useEffectEvent(async () => {
    if (mode !== 'viewer') {
      return
    }

    try {
      const record = await backendClient.getScenarioByViewerSlug(requestedViewerSlug ?? '')
      if (record) {
        applyIncomingRecord(record)
      }
    } catch (pollError) {
      log.warn('Viewer fallback polling basarisiz', {
        action: 'pollViewer',
        viewerSlug: requestedViewerSlug ?? '',
        errorMessage: pollError instanceof Error ? pollError.message : 'unknown',
        report: true,
      })
    }
  })

  useEffect(() => {
    if (mode !== 'viewer' || !viewerPollingFallback) {
      return
    }

    let active = true
    let timeoutId: number | null = null
    let backoffIndex = 0

    const schedule = (delay: number) => {
      timeoutId = window.setTimeout(async () => {
        if (!active) {
          return
        }

        await pollViewer()
        backoffIndex = Math.min(backoffIndex + 1, VIEWER_FALLBACK_BACKOFF_MS.length - 1)
        schedule(VIEWER_FALLBACK_BACKOFF_MS[backoffIndex])
      }, delay)
    }

    const restart = () => {
      if (!active) {
        return
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      backoffIndex = 0
      void pollViewer()
      schedule(VIEWER_FALLBACK_BACKOFF_MS[backoffIndex])
    }

    const handleOnline = () => {
      restart()
    }

    const handleVisibilityChange = () => {
      if (window.document.visibilityState === 'visible') {
        restart()
      }
    }

    schedule(VIEWER_FALLBACK_BACKOFF_MS[backoffIndex])
    window.addEventListener('online', handleOnline)
    window.document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      window.removeEventListener('online', handleOnline)
      window.document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [mode, requestedViewerSlug, viewerPollingFallback])

  return {
    status,
    error,
    access,
    saveNow,
    refreshLockNow,
  }
}
