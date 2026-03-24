import { useEffect, useMemo } from 'react'

import {
  formatEstimatedFlightMinutes,
  getEstimatedFlightDurationMs,
  getHostileInterceptSnapshot,
  getLaunchCommandDurationMs,
} from '@/features/missiles/flightAnimation'
import { greatCircleInterpolation, haversineDistance } from '@/features/missiles/geodesic'
import {
  DEFAULT_LAUNCH_SITE_VALUE,
  getLaunchSiteOptions,
  getSelectedLaunchSiteValue,
  resolveMissileLaunchCoord,
} from '@/features/missiles/launchSites'
import {
  getMissileById,
  getMissilesByCountry,
  MISSILE_CATEGORY_LABELS,
  MISSILE_PRESET_TARGETS,
} from '@/features/missiles/missileData'
import type { Flight, MissileDefinition } from '@/features/missiles/types'
import { useMissileStore } from '@/features/missiles/useMissileStore'
import { useScenarioStore } from '@/features/scenario/store'

type MissilePanelProps = {
  canEdit: boolean
}

type HostileFlightCandidate = {
  id: string
  definition: MissileDefinition
  flight: Flight
  distanceKm: number
  inRange: boolean
  remainingToInterceptMs: number | null
}

function formatRange(definition: MissileDefinition) {
  if (definition.rangeMinKm !== null && definition.rangeMaxKm !== null && definition.rangeMinKm !== definition.rangeMaxKm) {
    return `${definition.rangeMinKm}-${definition.rangeMaxKm} km`
  }

  if (definition.rangeMaxKm !== null) {
    return `${definition.rangeMaxKm} km`
  }

  return 'Belirsiz'
}

function isLaunchable(definition: MissileDefinition) {
  return definition.rangeMaxKm !== null
}

function formatInterceptProbability(probability: number | null) {
  if (probability === null) {
    return null
  }

  return `${Math.round(probability * 100)}% basari`
}

export function MissilePanel({ canEdit }: MissilePanelProps) {
  const missilesState = useScenarioStore((state) => state.document.missiles)
  const toggleMissileSelection = useScenarioStore((state) => state.toggleMissileSelection)
  const setActiveMissile = useScenarioStore((state) => state.setActiveMissile)
  const setMissileTarget = useScenarioStore((state) => state.setMissileTarget)
  const setMissileLaunchSite = useScenarioStore((state) => state.setMissileLaunchSite)
  const setMissilePlaybackSpeedMode = useScenarioStore((state) => state.setMissilePlaybackSpeedMode)
  const queueMissileLaunch = useScenarioStore((state) => state.queueMissileLaunch)
  const queueMissileSalvo = useScenarioStore((state) => state.queueMissileSalvo)
  const clearMissileState = useScenarioStore((state) => state.clearMissileState)
  const activeCountryTab = useMissileStore((state) => state.activeCountryTab)
  const setActiveCountryTab = useMissileStore((state) => state.setActiveCountryTab)
  const isTargetPickArmed = useMissileStore((state) => state.isTargetPickArmed)
  const armTargetPick = useMissileStore((state) => state.armTargetPick)
  const cancelTargetPick = useMissileStore((state) => state.cancelTargetPick)
  const selectedInterceptTargetId = useMissileStore((state) => state.selectedInterceptTargetId)
  const setSelectedInterceptTargetId = useMissileStore((state) => state.setSelectedInterceptTargetId)
  const runtimeFlights = useMissileStore((state) => state.activeFlights)

  const missileState = missilesState ?? {
    selectedMissileIds: [],
    activeMissileId: null,
    targetCoord: null,
    launchSiteByMissileId: {},
    playbackSpeedMode: 'fast' as const,
    recentLaunches: [],
  }

  const selectedMissileSet = useMemo(
    () => new Set(missileState.selectedMissileIds),
    [missileState.selectedMissileIds],
  )

  const activeMissile = missileState.activeMissileId ? getMissileById(missileState.activeMissileId) : null
  const activeLaunchSiteOptions = useMemo(
    () => (activeMissile ? getLaunchSiteOptions(activeMissile) : []),
    [activeMissile],
  )
  const activeLaunchSiteValue = useMemo(
    () =>
      activeMissile
        ? getSelectedLaunchSiteValue(activeMissile, missileState.launchSiteByMissileId)
        : DEFAULT_LAUNCH_SITE_VALUE,
    [activeMissile, missileState.launchSiteByMissileId],
  )
  const activeLaunchCoord = useMemo(
    () =>
      activeMissile
        ? resolveMissileLaunchCoord(activeMissile, missileState.launchSiteByMissileId)
        : null,
    [activeMissile, missileState.launchSiteByMissileId],
  )
  const showLaunchSitePicker = activeLaunchSiteOptions.length > 1

  useEffect(() => {
    if (activeMissile && activeMissile.country !== activeCountryTab) {
      setActiveCountryTab(activeMissile.country)
    }
  }, [activeCountryTab, activeMissile, setActiveCountryTab])

  const missilesByCategory = useMemo(() => {
    const grouped = new Map<string, MissileDefinition[]>()
    for (const definition of getMissilesByCountry(activeCountryTab)) {
      const bucket = grouped.get(definition.category) ?? []
      bucket.push(definition)
      grouped.set(definition.category, bucket)
    }

    return Array.from(grouped.entries())
      .map(([category, definitions]) => ({
        category,
        label: MISSILE_CATEGORY_LABELS[category as MissileDefinition['category']],
        missiles: definitions.sort((left, right) => (right.rangeMaxKm ?? -1) - (left.rangeMaxKm ?? -1)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'tr'))
  }, [activeCountryTab])

  const targetDistanceKm = useMemo(() => {
    if (!activeMissile || !activeLaunchCoord || !missileState.targetCoord) {
      return null
    }

    return Math.round(haversineDistance(activeLaunchCoord, missileState.targetCoord) / 1000)
  }, [activeLaunchCoord, activeMissile, missileState.targetCoord])

  const targetInRange = useMemo(() => {
    if (!activeMissile || !activeLaunchCoord || !missileState.targetCoord || activeMissile.rangeMaxKm === null) {
      return false
    }

    const distance = haversineDistance(activeLaunchCoord, missileState.targetCoord) / 1000
    return distance <= activeMissile.rangeMaxKm
  }, [activeLaunchCoord, activeMissile, missileState.targetCoord])

  const estimatedDurationMs = useMemo(() => {
    if (!activeMissile || !activeLaunchCoord || !missileState.targetCoord) {
      return null
    }

    return getEstimatedFlightDurationMs(
      activeMissile,
      activeLaunchCoord,
      missileState.targetCoord,
      missileState.playbackSpeedMode,
    )
  }, [activeLaunchCoord, activeMissile, missileState.playbackSpeedMode, missileState.targetCoord])

  const activeHostileFlights = useMemo(() => {
    if (
      !activeMissile ||
      !activeLaunchCoord ||
      activeMissile.rangeMaxKm === null ||
      (activeMissile.type !== 'interceptor' && activeMissile.type !== 'directed_energy')
    ) {
      return []
    }

    const interceptorRangeKm = activeMissile.rangeMaxKm

    return runtimeFlights
      .map((flight) => {
        const definition = getMissileById(flight.missileId)
        if (!definition || definition.country === activeMissile.country) {
          return null
        }
        if (definition.type === 'interceptor' || definition.type === 'directed_energy') {
          return null
        }

        const currentCoord = greatCircleInterpolation(
          flight.launchCoord,
          flight.targetCoord,
          Math.min(Math.max(flight.progress, 0), 1),
        )
        const distanceKm = Math.round(haversineDistance(activeLaunchCoord, currentCoord) / 1000)
        const hostileSnapshotTime = Math.round(flight.startTime + flight.progress * flight.duration)
        const interceptSnapshot =
          distanceKm <= interceptorRangeKm
            ? getHostileInterceptSnapshot(
                flight,
                activeMissile,
                activeLaunchCoord,
                hostileSnapshotTime,
                missileState.playbackSpeedMode,
              )
            : null

        return {
          id: flight.id,
          definition,
          flight,
          distanceKm,
          inRange: distanceKm <= interceptorRangeKm && interceptSnapshot !== null,
          remainingToInterceptMs: interceptSnapshot?.remainingToInterceptMs ?? null,
        }
      })
      .filter((flight): flight is HostileFlightCandidate => flight !== null && flight.flight.progress < 1)
  }, [activeLaunchCoord, activeMissile, missileState.playbackSpeedMode, runtimeFlights])

  const activeHostileFlightsInRange = useMemo(
    () => activeHostileFlights.filter((flight) => flight.inRange),
    [activeHostileFlights],
  )
  const hasAnyActiveHostileThreat = activeHostileFlights.length > 0
  const interceptProbabilityLabel = activeMissile
    ? formatInterceptProbability(activeMissile.interceptProbability)
    : null

  useEffect(() => {
    if (!selectedInterceptTargetId) {
      return
    }

    if (!activeHostileFlightsInRange.some((flight) => flight.id === selectedInterceptTargetId)) {
      setSelectedInterceptTargetId(null)
    }
  }, [activeHostileFlightsInRange, selectedInterceptTargetId, setSelectedInterceptTargetId])

  const selectedMissiles = useMemo(
    () => missileState.selectedMissileIds.map((id) => getMissileById(id)).filter(Boolean) as MissileDefinition[],
    [missileState.selectedMissileIds],
  )

  const selectedInterceptLaunchId = useMemo(
    () =>
      selectedInterceptTargetId &&
      activeHostileFlightsInRange.some((flight) => flight.id === selectedInterceptTargetId)
        ? selectedInterceptTargetId
        : null,
    [activeHostileFlightsInRange, selectedInterceptTargetId],
  )

  const salvoBlocked = useMemo(() => {
    if (!selectedMissiles.length) {
      return true
    }

    const hasUnknownRange = selectedMissiles.some((missile) => missile.rangeMaxKm === null)
    if (hasUnknownRange) {
      return true
    }

    const hasInterceptor = selectedMissiles.some(
      (missile) => missile.type === 'interceptor' || missile.type === 'directed_energy',
    )

    if (hasInterceptor) {
      return !selectedInterceptLaunchId
    }

    if (!missileState.targetCoord) {
      return true
    }

    return selectedMissiles.some((missile) => {
      const launchCoord = resolveMissileLaunchCoord(missile, missileState.launchSiteByMissileId)
      const distanceKm = haversineDistance(launchCoord, missileState.targetCoord as [number, number]) / 1000
      return distanceKm > (missile.rangeMaxKm ?? 0)
    })
  }, [missileState.launchSiteByMissileId, missileState.targetCoord, selectedInterceptLaunchId, selectedMissiles])

  const launchBlocked = useMemo(() => {
    if (!activeMissile || !isLaunchable(activeMissile)) {
      return true
    }

    if (activeMissile.type === 'interceptor' || activeMissile.type === 'directed_energy') {
      return !selectedInterceptLaunchId
    }

    return !missileState.targetCoord || !targetInRange
  }, [activeMissile, missileState.targetCoord, selectedInterceptLaunchId, targetInRange])

  return (
    <div className="missile-panel">
      <div className="version-panel-header missile-panel-header">
        <div>
          <p className="eyebrow">Fuze katmani</p>
          <h3>Fuze Menzil ve Ucus</h3>
        </div>
        <div className="missile-country-tabs">
          <button
            className={`secondary-button${activeCountryTab === 'iran' ? ' secondary-button-active' : ''}`}
            onClick={() => setActiveCountryTab('iran')}
            type="button"
          >
            Iran
          </button>
          <button
            className={`secondary-button${activeCountryTab === 'israel' ? ' secondary-button-active' : ''}`}
            onClick={() => setActiveCountryTab('israel')}
            type="button"
          >
            Israil
          </button>
        </div>
      </div>

      {canEdit ? (
        <div className="missile-target-box missile-mode-toggle">
          <p className="sidebar-panel-title">Oynatim hizi</p>
          <div className="missile-mode-toggle-buttons">
            <button
              className={`secondary-button${missileState.playbackSpeedMode === 'fast' ? ' secondary-button-active' : ''}`}
              onClick={() => setMissilePlaybackSpeedMode('fast')}
              type="button"
            >
              Hizli
            </button>
            <button
              className={`secondary-button${missileState.playbackSpeedMode === 'realistic' ? ' secondary-button-active' : ''}`}
              onClick={() => setMissilePlaybackSpeedMode('realistic')}
              type="button"
            >
              Gercekci
            </button>
          </div>
        </div>
      ) : null}

      <div className="missile-target-box">
        <p className="sidebar-panel-title">Hedef secimi</p>
        <div className="missile-preset-grid">
          {MISSILE_PRESET_TARGETS.slice(0, 6).map((preset) => (
            <button
              key={preset.id}
              className="secondary-button missile-preset-button"
              disabled={!canEdit}
              onClick={() => {
                cancelTargetPick()
                setMissileTarget(preset.coord)
              }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          className={`secondary-button missile-pick-button${isTargetPickArmed ? ' secondary-button-active' : ''}`}
          disabled={!canEdit}
          onClick={() => {
            if (isTargetPickArmed) {
              cancelTargetPick()
              return
            }
            armTargetPick()
          }}
          type="button"
        >
          {isTargetPickArmed ? 'Haritadan secim acik' : 'Haritadan sec'}
        </button>
        {activeMissile ? (
          <>
            <div className={`missile-target-status ${targetInRange ? 'missile-target-status-in' : 'missile-target-status-out'}`}>
              {activeMissile.rangeMaxKm === null
                ? 'BELIRSIZ MENZIL'
                : missileState.targetCoord && targetDistanceKm !== null
                  ? targetInRange
                    ? `MENZILDE - ${targetDistanceKm} km`
                    : `MENZIL DISI - ${targetDistanceKm}/${activeMissile.rangeMaxKm} km`
                  : `${activeMissile.name} icin hedef bekleniyor`}
            </div>
            {estimatedDurationMs !== null ? (
              <p className="missile-target-detail">
                Tahmini sure: {formatEstimatedFlightMinutes(estimatedDurationMs)}
              </p>
            ) : null}
            {interceptProbabilityLabel ? (
              <p className="missile-target-detail">
                <span className="missile-probability-badge">{interceptProbabilityLabel}</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="panel-empty">Menzil kontrolu icin aktif bir fuze sec.</p>
        )}
      </div>

      {activeMissile && (activeMissile.type === 'interceptor' || activeMissile.type === 'directed_energy') ? (
        <div className="missile-target-box">
          <p className="sidebar-panel-title">Aktif tehdit secimi</p>
          {activeHostileFlightsInRange.length === 0 ? (
            <p className="panel-empty">
              {hasAnyActiveHostileThreat ? 'Menzilde aktif tehdit yok' : 'Aktif tehdit yok'}
            </p>
          ) : (
            <div className="missile-hostile-list">
              {activeHostileFlightsInRange.map((hostile) => {
                const recentLaunch =
                  missileState.recentLaunches.find((launch) => launch.id === hostile.id) ?? null
                const duration = recentLaunch
                  ? getLaunchCommandDurationMs(recentLaunch, hostile.definition)
                  : hostile.flight.duration
                const age = Math.max(0, Math.round((hostile.flight.progress * hostile.flight.duration) / 1000))

                return (
                  <button
                    key={hostile.id}
                    className={`missile-hostile-item${selectedInterceptTargetId === hostile.id ? ' missile-hostile-item-active' : ''}`}
                    onClick={() => setSelectedInterceptTargetId(hostile.id)}
                    type="button"
                  >
                    <strong>{hostile.definition.name}</strong>
                    <span>
                      Tehdit mesafesi {hostile.distanceKm} km - {hostile.flight.phase.toUpperCase()}
                    </span>
                    <span>
                      {age}s once - TTL {Math.round((duration + 2000) / 1000)}s
                      {hostile.remainingToInterceptMs !== null
                        ? ` - Onleme penceresi ${Math.max(1, Math.round(hostile.remainingToInterceptMs / 1000))}s`
                        : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeMissile && showLaunchSitePicker ? (
        <div className="missile-target-box missile-launch-site-box">
          <p className="sidebar-panel-title">Firlatma noktasi</p>
          <label className="missile-launch-site-label" htmlFor="missile-launch-site">
            Site secimi
          </label>
          <select
            className="panel-input panel-select missile-launch-site-select"
            disabled={!canEdit}
            id="missile-launch-site"
            onChange={(event) => {
              const nextValue = event.target.value
              if (nextValue === DEFAULT_LAUNCH_SITE_VALUE) {
                setMissileLaunchSite(activeMissile.id, null)
                return
              }

              const nextOption = activeLaunchSiteOptions.find((option) => option.value === nextValue)
              if (!nextOption) {
                return
              }

              setMissileLaunchSite(activeMissile.id, nextOption.coord)
            }}
            value={activeLaunchSiteValue}
          >
            {activeLaunchSiteOptions.map((option) => (
              <option key={option.key} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="missile-launch-actions">
        <button
          className="primary-button"
          disabled={!canEdit || launchBlocked}
          onClick={() => {
            if (!activeMissile) {
              return
            }
            queueMissileLaunch(activeMissile.id, selectedInterceptLaunchId)
          }}
          type="button"
        >
          FIRLAT
        </button>
        <button
          className="secondary-button"
          disabled={!canEdit || salvoBlocked}
          onClick={() => queueMissileSalvo(missileState.selectedMissileIds, selectedInterceptLaunchId)}
          type="button"
        >
          SALVO ({missileState.selectedMissileIds.length})
        </button>
        <button
          className="danger-button"
          disabled={!canEdit}
          onClick={() => {
            cancelTargetPick()
            setSelectedInterceptTargetId(null)
            clearMissileState()
          }}
          type="button"
        >
          Temizle
        </button>
      </div>

      <div className="missile-category-stack">
        {missilesByCategory.map((group) => (
          <section className="missile-category-group" key={group.category}>
            <div className="missile-category-header">
              <span>{group.label}</span>
              <span>{group.missiles.length}</span>
            </div>
            <div className="missile-list">
              {group.missiles.map((definition) => {
                const selected = selectedMissileSet.has(definition.id)
                const active = missileState.activeMissileId === definition.id

                return (
                  <article
                    className={`missile-row${selected ? ' missile-row-selected' : ''}${active ? ' missile-row-active' : ''}`}
                    key={definition.id}
                  >
                    <label className="missile-row-check">
                      <input
                        checked={selected}
                        disabled={!canEdit}
                        onChange={() => toggleMissileSelection(definition.id)}
                        type="checkbox"
                      />
                    </label>
                    <button
                      className="missile-row-main"
                      onClick={() => setActiveMissile(definition.id)}
                      type="button"
                    >
                      <div className="missile-row-title">
                        <strong>{definition.name}</strong>
                        <span>{formatRange(definition)}</span>
                      </div>
                      <div className="missile-row-meta">
                        <span>{MISSILE_CATEGORY_LABELS[definition.category]}</span>
                        <span className={`missile-row-status missile-row-status-${definition.status}`}>
                          {definition.status.replaceAll('_', ' ')}
                        </span>
                        {definition.interceptProbability !== null ? (
                          <span className="missile-probability-badge">
                            {formatInterceptProbability(definition.interceptProbability)}
                          </span>
                        ) : null}
                      </div>
                      {definition.rangeMaxKm === null ? (
                        <span className="missile-row-warning">Belirsiz menzil</span>
                      ) : null}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
