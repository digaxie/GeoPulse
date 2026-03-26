import { useEffect, useRef, useState, type WheelEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { ConflictMap } from '@/components/map/ConflictMap'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'
import { AssetLibraryPanel } from '@/components/panels/AssetLibraryPanel'
import { BriefingPanel } from '@/components/panels/BriefingPanel'
import { InspectorPanel } from '@/components/panels/InspectorPanel'
import { TextControls } from '@/components/panels/TextControls'
import { ToolDock } from '@/components/panels/ToolDock'
import { VersionHistoryPanel } from '@/components/panels/VersionHistoryPanel'
import { AlertsPanel } from '@/features/alerts/AlertsPanel'
import { SystemMessageBanner } from '@/features/alerts/SystemMessageBanner'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useAssets } from '@/features/assets/useAssets'
import { useAuth } from '@/features/auth/useAuth'
import { MissilePanel } from '@/features/missiles/MissilePanel'
import {
  getActiveBriefingSlide,
  getVisibleElementIdsForActiveSlide,
  isElementVisibleOnSlide,
} from '@/features/scenario/briefing'
import { useScenarioStore } from '@/features/scenario/store'
import { serializeScenarioTransfer } from '@/features/scenario/transfer'
import { useScenarioRuntime } from '@/features/scenario/useScenarioRuntime'
import { backendClient } from '@/lib/backend'
import type { ScenarioSnapshotRecord } from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { downloadTextFile, formatRelativeDate, slugifyFileName } from '@/lib/utils'

type PanelKey = 'tools' | 'text' | 'assets' | 'missiles' | 'alerts' | 'briefing' | 'history' | 'settings' | 'share'

const PANELS: { key: PanelKey; label: string }[] = [
  { key: 'tools', label: 'Araclar' },
  { key: 'text', label: 'Metin' },
  { key: 'assets', label: 'Varliklar' },
  { key: 'missiles', label: 'Fuzeler' },
  { key: 'alerts', label: 'Alarmlar' },
  { key: 'briefing', label: 'Briefing' },
  { key: 'history', label: 'Gecmis' },
  { key: 'settings', label: 'Ayarlar' },
  { key: 'share', label: 'Sunum' },
]

type PanelGlyphProps = {
  name: PanelKey
}

function PanelGlyph({ name }: PanelGlyphProps) {
  const commonProps = {
    className: 'sidebar-icon-glyph',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'tools':
      return (
        <svg {...commonProps}>
          <path d="M14.5 5.5a3.5 3.5 0 0 0 4 4l-7.25 7.25a2 2 0 1 1-2.83-2.83L15.67 6.67a3.5 3.5 0 0 1-1.17-1.17Z" />
          <path d="m6 18 1.5-1.5" />
        </svg>
      )
    case 'text':
      return (
        <svg {...commonProps}>
          <path d="M5 6h14" />
          <path d="M12 6v12" />
          <path d="M8 18h8" />
        </svg>
      )
    case 'assets':
      return (
        <svg {...commonProps}>
          <rect x="4.5" y="5" width="15" height="14" rx="2.5" />
          <path d="M9 9.5h6" />
          <path d="M9 13h6" />
          <path d="M9 16.5h3.5" />
        </svg>
      )
    case 'missiles':
      return (
        <svg {...commonProps}>
          <path d="M14.5 4.5c2.6 1.1 5 3.5 6 6-2.3.7-4.8 2.2-6.8 4.2s-3.5 4.5-4.2 6.8c-2.5-1-4.9-3.4-6-6 2.3-.7 4.8-2.2 6.8-4.2s3.5-4.5 4.2-6.8Z" />
          <path d="M9 9 5 5" />
          <path d="M15 15 19 19" />
        </svg>
      )
    case 'alerts':
      return (
        <svg {...commonProps}>
          <path d="m12 4 8 14H4L12 4Z" />
          <path d="M12 9v4" />
          <circle cx="12" cy="16.25" r=".75" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'briefing':
      return (
        <svg {...commonProps}>
          <rect x="5" y="4.5" width="14" height="15" rx="2.5" />
          <path d="M9 9h6" />
          <path d="M9 12.5h6" />
          <path d="M9 16h4" />
        </svg>
      )
    case 'history':
      return (
        <svg {...commonProps}>
          <path d="M4.5 12A7.5 7.5 0 1 0 7 6.4" />
          <path d="M4.5 5v4h4" />
          <path d="M12 8.5V12l2.5 1.5" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 4.5v1.8" />
          <path d="M12 17.7v1.8" />
          <path d="m6.7 6.7 1.3 1.3" />
          <path d="m16 16 1.3 1.3" />
          <path d="M4.5 12h1.8" />
          <path d="M17.7 12h1.8" />
          <path d="m6.7 17.3 1.3-1.3" />
          <path d="m16 8 1.3-1.3" />
        </svg>
      )
    case 'share':
      return (
        <svg {...commonProps}>
          <path d="M8 8.5 16.5 12 8 15.5V8.5Z" />
          <path d="M5 6.5v11" />
        </svg>
      )
    default:
      return null
  }
}

export function ScenarioPage() {
  const params = useParams<{ scenarioId: string }>()
  const scenarioId = params.scenarioId ?? ''
  const hasScenarioId = Boolean(params.scenarioId)
  const { session, isLoading } = useAuth()
  const sessionUserId = session?.id ?? null
  const title = useScenarioStore((state) => state.title)
  const setTitle = useScenarioStore((state) => state.setTitle)
  const viewerSlug = useScenarioStore((state) => state.viewerSlug)
  const document = useScenarioStore((state) => state.document)
  const selectedElementId = useScenarioStore((state) => state.selectedElementId)
  const activeAssetId = useScenarioStore((state) => state.activeAssetId)
  const lock = useScenarioStore((state) => state.lock)
  const saveState = useScenarioStore((state) => state.saveState)
  const lastSavedRevision = useScenarioStore((state) => state.lastSavedRevision)
  const penColor = useScenarioStore((state) => state.penColor)
  const setPenColor = useScenarioStore((state) => state.setPenColor)
  const eraserSize = useScenarioStore((state) => state.eraserSize)
  const setEraserSize = useScenarioStore((state) => state.setEraserSize)
  const setTool = useScenarioStore((state) => state.setTool)
  const setActiveAssetId = useScenarioStore((state) => state.setActiveAssetId)
  const textDefaults = useScenarioStore((state) => state.textDefaults)
  const setTextDefault = useScenarioStore((state) => state.setTextDefault)
  const setBasemapPreset = useScenarioStore((state) => state.setBasemapPreset)
  const setLabelOption = useScenarioStore((state) => state.setLabelOption)
  const setStylePref = useScenarioStore((state) => state.setStylePref)
  const createSlideFromCurrentView = useScenarioStore((state) => state.createSlideFromCurrentView)
  const duplicateSlide = useScenarioStore((state) => state.duplicateSlide)
  const deleteSlide = useScenarioStore((state) => state.deleteSlide)
  const moveSlideUp = useScenarioStore((state) => state.moveSlideUp)
  const moveSlideDown = useScenarioStore((state) => state.moveSlideDown)
  const setActiveSlide = useScenarioStore((state) => state.setActiveSlide)
  const renameSlide = useScenarioStore((state) => state.renameSlide)
  const updateSlideNotes = useScenarioStore((state) => state.updateSlideNotes)
  const setElementVisibilityOnSlide = useScenarioStore((state) => state.setElementVisibilityOnSlide)
  const setViewerSlug = useScenarioStore((state) => state.setViewerSlug)
  const updateSelectedElementStyle = useScenarioStore((state) => state.updateSelectedElementStyle)
  const updateSelectedElementNumeric = useScenarioStore((state) => state.updateSelectedElementNumeric)
  const updateElement = useScenarioStore((state) => state.updateElement)
  const removeSelectedElement = useScenarioStore((state) => state.removeSelectedElement)
  const clearAllElements = useScenarioStore((state) => state.clearAllElements)
  const toggleSelectedLock = useScenarioStore((state) => state.toggleSelectedLock)
  const bringSelectedForward = useScenarioStore((state) => state.bringSelectedForward)
  const sendSelectedBackward = useScenarioStore((state) => state.sendSelectedBackward)
  const undo = useScenarioStore((state) => state.undo)
  const redo = useScenarioStore((state) => state.redo)
  const backfillAssetSnapshots = useScenarioStore((state) => state.backfillUploadedAssetSnapshots)
  const initializeScenario = useScenarioStore((state) => state.initialize)
  const undoCount = useScenarioStore((state) => state.history.length)
  const redoCount = useScenarioStore((state) => state.future.length)
  const { assets, isLoading: loadingAssets, error: assetsError, uploadAsset } = useAssets()

  const runtime = useScenarioRuntime({ mode: 'editor', scenarioId })
  const shareSectionRef = useRef<HTMLDivElement | null>(null)
  const sidebarIconBarRef = useRef<HTMLElement | null>(null)

  const [activePanel, setActivePanel] = useState<PanelKey | null>('tools')
  const alertsPanelRevealNonce = useAlertStore((state) => state.alertsPanelRevealNonce)
  const [sidebarCanScrollLeft, setSidebarCanScrollLeft] = useState(false)
  const [sidebarCanScrollRight, setSidebarCanScrollRight] = useState(false)
  const [assetDropRequest, setAssetDropRequest] = useState<{
    nonce: number
    assetId: string
    clientX: number
    clientY: number
  } | null>(null)
  const [snapshots, setSnapshots] = useState<ScenarioSnapshotRecord[]>([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null)
  const [busySnapshotId, setBusySnapshotId] = useState<string | null>(null)
  const processedAlertsPanelRevealNonceRef = useRef(0)

  useEffect(() => {
    if (
      alertsPanelRevealNonce <= 0 ||
      alertsPanelRevealNonce === processedAlertsPanelRevealNonceRef.current
    ) {
      return
    }

    processedAlertsPanelRevealNonceRef.current = alertsPanelRevealNonce
    setActivePanel('alerts')
  }, [alertsPanelRevealNonce])

  useEffect(() => {
    if (!activeAssetId && assets.length > 0) {
      const preferredAsset =
        assets.find((asset) => asset.id === 'flag-tr') ??
        assets.find((asset) => asset.kind === 'flag') ??
        assets[0]

      setActiveAssetId(preferredAsset.id)
    }
  }, [activeAssetId, assets, setActiveAssetId])

  useEffect(() => {
    const iconBar = sidebarIconBarRef.current
    if (!iconBar) {
      return
    }

    let frameId = 0

    const syncSidebarOverflow = () => {
      frameId = 0
      const maxScrollLeft = Math.max(0, iconBar.scrollWidth - iconBar.clientWidth)
      const nextCanScrollLeft = iconBar.scrollLeft > 8
      const nextCanScrollRight = iconBar.scrollLeft < maxScrollLeft - 8

      setSidebarCanScrollLeft((current) => (current === nextCanScrollLeft ? current : nextCanScrollLeft))
      setSidebarCanScrollRight((current) => (current === nextCanScrollRight ? current : nextCanScrollRight))
    }

    const scheduleSync = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(syncSidebarOverflow)
    }

    scheduleSync()

    iconBar.addEventListener('scroll', scheduleSync, { passive: true })
    window.addEventListener('resize', scheduleSync)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleSync)
      resizeObserver.observe(iconBar)
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      iconBar.removeEventListener('scroll', scheduleSync)
      window.removeEventListener('resize', scheduleSync)
      resizeObserver?.disconnect()
    }
  }, [activePanel])

  useEffect(() => {
    if (runtime.access !== 'editor' || loadingAssets || assets.length === 0) {
      return
    }

    backfillAssetSnapshots(assets)
  }, [assets, backfillAssetSnapshots, document.revision, loadingAssets, runtime.access])

  useEffect(() => {
    if (!session || !scenarioId) {
      setSnapshots([])
      return
    }

    let active = true
    setLoadingSnapshots(true)
    setSnapshotsError(null)

    void backendClient
      .listSnapshots(scenarioId)
      .then((records) => {
        if (active) {
          setSnapshots(records)
        }
      })
      .catch((error) => {
        if (active) {
          setSnapshotsError(
            error instanceof Error ? error.message : 'Anlik goruntuler yuklenemedi.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSnapshots(false)
        }
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot refetch should track user identity, not token refreshes
  }, [scenarioId, sessionUserId])

  if (!hasScenarioId) {
    return <Navigate to="/app" replace />
  }

  if (!isLoading && !session) {
    return <Navigate to="/login" replace />
  }

  const selectedElement = document.elements.find((element) => element.id === selectedElementId) ?? null
  const activeBriefingSlide = getActiveBriefingSlide(document)
  const activeVisibleElementIds = getVisibleElementIdsForActiveSlide(document)
  const selectedElementVisibleOnActiveSlide =
    activeBriefingSlide && selectedElementId
      ? isElementVisibleOnSlide(document, activeBriefingSlide.id, selectedElementId)
      : null
  const isReadOnly = runtime.access !== 'editor'
  const presenterPath = `/present/${scenarioId}`

  async function reloadSnapshots() {
    const records = await backendClient.listSnapshots(scenarioId)
    setSnapshots(records)
  }

  async function handleRotateViewerSlug() {
    const nextViewerSlug = await backendClient.rotateViewerSlug(scenarioId)
    setViewerSlug(nextViewerSlug)
  }

  function handleExportScenario() {
    const filename = `${slugifyFileName(title)}.json`
    downloadTextFile(filename, serializeScenarioTransfer({ title, document }))
  }

  function togglePanel(key: PanelKey) {
    setActivePanel((current) => (current === key ? null : key))
  }

  function handleSidebarIconBarWheel(event: WheelEvent<HTMLElement>) {
    const iconBar = event.currentTarget
    if (iconBar.scrollWidth <= iconBar.clientWidth) {
      return
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    const maxScrollLeft = Math.max(0, iconBar.scrollWidth - iconBar.clientWidth)
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, iconBar.scrollLeft + event.deltaY))
    if (Math.abs(nextScrollLeft - iconBar.scrollLeft) < 1) {
      return
    }

    event.preventDefault()
    iconBar.scrollLeft = nextScrollLeft
  }

  async function handleCreateSnapshot() {
    if (!session || runtime.access !== 'editor') {
      return
    }

    setBusySnapshotId('create')
    setSnapshotsError(null)

    try {
      await runtime.refreshLockNow()
      if (document.revision !== lastSavedRevision) {
        await runtime.saveNow()
      }

      await backendClient.createSnapshot(scenarioId)
      await reloadSnapshots()
    } catch (error) {
      setSnapshotsError(
        error instanceof Error ? error.message : 'Anlik goruntu kaydedilemedi.',
      )
    } finally {
      setBusySnapshotId(null)
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!session || runtime.access !== 'editor') {
      return
    }

    setBusySnapshotId(snapshotId)
    setSnapshotsError(null)

    try {
      await runtime.refreshLockNow()
      const restoredScenario = await backendClient.restoreSnapshot(snapshotId)
      initializeScenario(restoredScenario, 'editor')
      await reloadSnapshots()
    } catch (error) {
      setSnapshotsError(
        error instanceof Error ? error.message : 'Anlik goruntu geri yuklenemedi.',
      )
    } finally {
      setBusySnapshotId(null)
    }
  }

  const saveBadgeLabel =
    saveState === 'saving'
      ? '-> Kaydediliyor'
      : saveState === 'saved'
        ? 'OK Kaydedildi'
        : saveState === 'error'
          ? 'X Hata'
          : '- Bekliyor'

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <div className="workspace-topbar-info">
          <p className="eyebrow">GeoPulse Editor</p>
          <h1>
            <input
              className="title-edit-input"
              disabled={isReadOnly}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senaryo adi..."
              value={title}
            />
          </h1>
          <p className="lede">
            {isReadOnly ? 'Bu senaryo su an salt okunur durumda.' : 'Canli editor kilidi sizde.'}
          </p>
        </div>

        <div className="workspace-topbar-meta">
          <span className={`save-badge save-${saveState}`}>{saveBadgeLabel}</span>
          {lock ? (
            <span className="lock-pill">
              Kilit {lock.holderUsername} · {formatRelativeDate(lock.expiresAt)}
            </span>
          ) : null}
          <button className="secondary-button" onClick={handleExportScenario} type="button">
            JSON indir
          </button>
          <Link className="secondary-button" to="/app">
            Senaryolar
          </Link>
        </div>
      </header>

      {runtime.error ? <div className="workspace-alert">Uyari: {runtime.error}</div> : null}
      {runtime.status === 'loading' ? (
        <div className="workspace-alert workspace-alert-info">Yukleniyor...</div>
      ) : null}
      {backendClient.mode === 'mock' ? (
        <div className="workspace-alert workspace-alert-warning">Demo mod</div>
      ) : null}

      <div className="workspace-shell">
        <section className="workspace-map-panel">
          <MapErrorBoundary>
            <ConflictMap
              assetDropRequest={assetDropRequest}
              alertAudioRole="editor"
              assets={assets}
              readOnly={isReadOnly}
              visibleElementIds={activeVisibleElementIds}
            />
          </MapErrorBoundary>
          <SystemMessageBanner />
        </section>

        <div className="workspace-sidebar-container">
          <nav
            aria-label="Editor panelleri"
            className={`sidebar-icon-bar${sidebarCanScrollLeft ? ' sidebar-icon-bar--scroll-left' : ''}${sidebarCanScrollRight ? ' sidebar-icon-bar--scroll-right' : ''}`}
            onWheel={handleSidebarIconBarWheel}
            ref={sidebarIconBarRef}
          >
            {PANELS.map(({ key, label }) => (
              <button
                key={key}
                className={`sidebar-icon-btn${activePanel === key ? ' sidebar-icon-btn--active' : ''}`}
                onClick={() => togglePanel(key)}
                title={label}
                type="button"
              >
                <span className="sidebar-icon-btn-icon">
                  <PanelGlyph name={key} />
                </span>
                <span className="sidebar-icon-btn-label">{label}</span>
              </button>
            ))}
            <div className="sidebar-icon-bar-spacer" />
            <SiteCredit className="sidebar-credit" />
          </nav>

          <div
            className={`sidebar-panel${activePanel === 'briefing' ? ' sidebar-panel--briefing' : ''}${activePanel === 'missiles' ? ' sidebar-panel--missiles' : ''}${activePanel === 'alerts' ? ' sidebar-panel--alerts' : ''}`}
            style={activePanel === null ? { display: 'none' } : undefined}
          >
            {activePanel === 'tools' ? (
              <div className="sidebar-panel-inner">
                <p className="sidebar-panel-title">Araclar</p>
                <ToolDock
                  activeTool={document.selectedTool}
                  canEdit={!isReadOnly}
                  eraserSize={eraserSize}
                  onClearAll={() => {
                    if (document.elements.length === 0) {
                      return
                    }

                    if (window.confirm('Haritadaki tum ogeleri silmek istiyor musunuz?')) {
                      clearAllElements()
                    }
                  }}
                  onDelete={removeSelectedElement}
                  onEraserSizeChange={setEraserSize}
                  onPenColorChange={setPenColor}
                  onRedo={redo}
                  onSelectTool={setTool}
                  onUndo={undo}
                  penColor={penColor}
                  redoCount={redoCount}
                  undoCount={undoCount}
                />
              </div>
            ) : null}

            {activePanel === 'text' ? (
              <div className="sidebar-panel-inner">
                <p className="sidebar-panel-title">Metin</p>
                {selectedElement?.kind === 'text' ? (
                  <>
                    <p className="sidebar-panel-desc">Secili metni duzenle.</p>
                    <textarea
                      className="panel-input panel-textarea"
                      disabled={isReadOnly}
                      onChange={(event) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, text: event.target.value } : element,
                        )
                      }}
                      placeholder="Metin yaz..."
                      value={selectedElement.text}
                    />
                    <TextControls
                      align={selectedElement.align}
                      disabled={isReadOnly}
                      fontSize={selectedElement.fontSize}
                      fontWeight={selectedElement.fontWeight}
                      onChangeAlign={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, align: value } : element,
                        )
                      }}
                      onChangeFontSize={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, fontSize: value } : element,
                        )
                      }}
                      onChangeFontWeight={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, fontWeight: value } : element,
                        )
                      }}
                      onChangeTextColor={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateSelectedElementStyle('textColor', value)
                      }}
                      textColor={selectedElement.style.textColor}
                    />
                  </>
                ) : (
                  <>
                    <p className="sidebar-panel-desc">
                      Araclardan Metin&apos;i sec, haritada bir yere tikla ve yaz.
                    </p>
                    <TextControls
                      align={textDefaults.align}
                      disabled={isReadOnly}
                      fontSize={textDefaults.fontSize}
                      fontWeight={textDefaults.fontWeight}
                      onChangeAlign={(value) => setTextDefault('align', value)}
                      onChangeFontSize={(value) => setTextDefault('fontSize', value)}
                      onChangeFontWeight={(value) => setTextDefault('fontWeight', value)}
                      onChangeTextColor={(value) => setTextDefault('textColor', value)}
                      textColor={textDefaults.textColor}
                    />
                  </>
                )}
              </div>
            ) : null}

            <div
              className="sidebar-panel-inner sidebar-panel-inner--flush"
              style={activePanel !== 'assets' ? { display: 'none' } : undefined}
            >
              <AssetLibraryPanel
                activeAssetId={activeAssetId}
                assets={assets}
                canEdit={!isReadOnly}
                error={assetsError}
                isLoading={loadingAssets}
                onDropAsset={(drop) => {
                  setActiveAssetId(drop.assetId)
                  setAssetDropRequest({ ...drop, nonce: Date.now() })
                }}
                onPickAsset={(assetId) => {
                  setActiveAssetId(assetId)
                  setTool('asset')
                }}
                onUploadAsset={async (input) => {
                  const nextAsset = await uploadAsset(input)
                  setActiveAssetId(nextAsset.id)
                  setTool('asset')
                }}
                requestedFilter={null}
              />
            </div>

            {activePanel === 'missiles' ? (
              <div className="sidebar-panel-inner">
                <MissilePanel canEdit={!isReadOnly} />
              </div>
            ) : null}

            {activePanel === 'alerts' ? (
              <div className="sidebar-panel-inner">
                <AlertsPanel canToggle={!isReadOnly} />
              </div>
            ) : null}

            {activePanel === 'briefing' ? (
              <div className="sidebar-panel-inner">
                <BriefingPanel
                  activeSlideId={document.briefing?.activeSlideId ?? null}
                  canEdit={!isReadOnly}
                  onCreateSlide={createSlideFromCurrentView}
                  onDeleteSlide={deleteSlide}
                  onDuplicateSlide={duplicateSlide}
                  onMoveSlideDown={moveSlideDown}
                  onMoveSlideUp={moveSlideUp}
                  onRenameSlide={renameSlide}
                  onSetActiveSlide={setActiveSlide}
                  onUpdateSlideNotes={updateSlideNotes}
                  presenterPath={presenterPath}
                  slides={document.briefing?.slides ?? []}
                />
              </div>
            ) : null}

            {activePanel === 'history' ? (
              <div className="sidebar-panel-inner">
                <VersionHistoryPanel
                  busySnapshotId={busySnapshotId}
                  canEdit={!isReadOnly}
                  error={snapshotsError}
                  isLoading={loadingSnapshots}
                  onCreateSnapshot={handleCreateSnapshot}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  snapshots={snapshots}
                />
              </div>
            ) : null}

            {activePanel === 'settings' || activePanel === 'share' ? (
              <div className="sidebar-panel-inner sidebar-panel-inner--flush">
                <InspectorPanel
                  activeSlideTitle={activeBriefingSlide?.title ?? null}
                  basemap={document.basemap}
                  canEdit={!isReadOnly}
                  hasHgmAtlas={appEnv.useHgmAtlas}
                  labelOptions={document.labelOptions}
                  onBringForward={bringSelectedForward}
                  onRotateViewerSlug={handleRotateViewerSlug}
                  onSendBackward={sendSelectedBackward}
                  onSetBasemapPreset={setBasemapPreset}
                  onSetSelectedElementVisibleOnActiveSlide={(visible) => {
                    if (!activeBriefingSlide || !selectedElementId) {
                      return
                    }

                    setElementVisibilityOnSlide(activeBriefingSlide.id, selectedElementId, visible)
                  }}
                  onSetStylePref={setStylePref}
                  onToggleLabelOption={setLabelOption}
                  onToggleLock={toggleSelectedLock}
                  onUpdateNumeric={updateSelectedElementNumeric}
                  onUpdateStyle={updateSelectedElementStyle}
                  onUpdateText={(value) => {
                    if (!selectedElementId) {
                      return
                    }

                    updateElement(selectedElementId, (element) =>
                      element.kind === 'text' ? { ...element, text: value } : element,
                    )
                  }}
                  onUpdateTextProperty={(field, value) => {
                    if (!selectedElementId) {
                      return
                    }

                    updateElement(selectedElementId, (element) =>
                      element.kind === 'text' ? { ...element, [field]: value } : element,
                    )
                  }}
                  scenarioId={scenarioId}
                  selectedElement={selectedElement}
                  selectedElementVisibleOnActiveSlide={selectedElementVisibleOnActiveSlide}
                  shareSectionRef={shareSectionRef}
                  stylePrefs={document.stylePrefs}
                  viewerSlug={viewerSlug}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
