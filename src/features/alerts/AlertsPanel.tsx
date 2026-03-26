import { useEffect, useMemo, useState } from 'react'

import {
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  formatAlertShelterInstruction,
  formatTimelineDualTime,
  isGroupedIncidentAlert,
  getAlertTypeLabel,
  getTimelineItemColor,
  getTimelineItemIcon,
  type AlertCityDetail,
  type TimelineItem,
} from '@/features/alerts/types'
import { FocusedAlertIncidentView } from '@/features/alerts/FocusedAlertIncidentView'
import type { EnrichedCity, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useScenarioStore } from '@/features/scenario/store'

function getFeedStatusLabel(status: string) {
  switch (status) {
    case 'connecting':
      return 'bağlanıyor'
    case 'live':
      return 'canlı'
    case 'error':
      return 'hata'
    default:
      return 'kapalı'
  }
}

const ALERT_RETENTION_OPTIONS = [
  { value: 30_000, label: '30 sn' },
  { value: 60_000, label: '1 dk' },
  { value: 120_000, label: '2 dk' },
  { value: 300_000, label: '5 dk' },
] as const

const BANNER_DISMISS_OPTIONS = [
  { value: 5, label: '5 sn' },
  { value: 10, label: '10 sn' },
  { value: 15, label: '15 sn' },
  { value: 30, label: '30 sn' },
  { value: 60, label: '1 dk' },
  { value: 120, label: '2 dk' },
] as const

function normalizeCityChip(city: AlertCityDetail | EnrichedCity) {
  if ('name' in city) {
    return { name: city.name, lat: city.lat, lon: city.lon }
  }
  return { name: city.en || city.he, lat: city.lat, lon: city.lng }
}

const CHIP_PREVIEW_LIMIT = 5

function CityChips({
  cities,
  color,
  onFocus,
}: {
  cities: (AlertCityDetail | EnrichedCity)[]
  color: string
  onFocus: (coord: { lat: number; lon: number; name: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleCities = expanded ? cities : cities.slice(0, CHIP_PREVIEW_LIMIT)
  const hasMore = cities.length > CHIP_PREVIEW_LIMIT

  return (
    <div className="alerts-city-chips">
      {visibleCities.map((city, i) => {
        const { name, lat, lon } = normalizeCityChip(city)
        const hasCoord = lat != null && lon != null && lat !== 0 && lon !== 0
        return (
          <button
            key={`${name}-${i}`}
            className={`alerts-city-chip alerts-city-chip-${color}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (hasCoord) onFocus({ lat: lat!, lon: lon!, name })
            }}
            style={hasCoord ? undefined : { cursor: 'default', opacity: 0.5 }}
          >
            {name}
          </button>
        )
      })}
      {hasMore && !expanded && (
        <button
          className="alerts-city-chip alerts-city-chip-more"
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
        >
          +{cities.length - CHIP_PREVIEW_LIMIT} daha
        </button>
      )}
    </div>
  )
}

function TimelineCard({
  item,
  now,
  active,
  onSelect,
  onSelectSystem,
  onFocusCity,
}: {
  item: TimelineItem
  now: number
  active: boolean
  onSelect: (id: string | null) => void
  onSelectSystem: (id: number | null) => void
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
}) {
  const color = getTimelineItemColor(item)
  const icon = getTimelineItemIcon(item)

  if (item.kind === 'alert') {
    const alert = item.alert
    const cities = alert.citiesDetail
    return (
      <div className="alerts-card-wrapper">
        <button
          className={`alerts-card alerts-card-${color}${active ? ' alerts-card-active' : ''}${item.isActive ? ' alerts-card-live' : ''}`}
          onClick={() => onSelect(alert.id)}
          type="button"
        >
          <div className="alerts-card-body">
            <strong className="alerts-card-title">{alert.englishName}</strong>
            <span className="alerts-card-time">{formatTimelineDualTime(alert.occurredAtMs, now)}</span>
            <span className="alerts-card-area">
              {getAlertTypeLabel(alert.alertTypeId)} · {formatAlertShelterInstruction(alert.countdownSec)}
            </span>
          </div>
          <span className="alerts-card-icon">{icon}</span>
        </button>
        {cities && cities.length > 1 && (
          <CityChips cities={cities} color={color} onFocus={onFocusCity} />
        )}
      </div>
    )
  }

  const msg = item.message
  const title = msg.titleEn || msg.titleHe || 'Sistem Mesajı'
  const body = msg.bodyEn || msg.bodyHe
  const hasCities = msg.citiesEnriched && msg.citiesEnriched.length > 0

  return (
    <div className="alerts-card-wrapper">
      <button
        className={`alerts-card alerts-card-${color}${active ? ' alerts-card-active' : ''}`}
        onClick={() => hasCities ? onSelectSystem(msg.id) : undefined}
        type="button"
        style={hasCities ? undefined : { cursor: 'default' }}
      >
        <div className="alerts-card-body">
          <strong className="alerts-card-title">{title}</strong>
          <span className="alerts-card-time">{formatTimelineDualTime(msg.receivedAtMs, now)}</span>
          {body && <span className="alerts-card-area">{body}</span>}
        </div>
        <span className="alerts-card-icon">{icon}</span>
      </button>
      {hasCities && (
        <CityChips cities={msg.citiesEnriched!} color={color} onFocus={onFocusCity} />
      )}
    </div>
  )
}

type AlertsPanelProps = {
  canToggle?: boolean
}

export function AlertsPanel({ canToggle = true }: AlertsPanelProps) {
  const alerts = useAlertStore((state) => state.alerts)
  const historyAlerts = useAlertStore((state) => state.historyAlerts)
  const systemMessages = useAlertStore((state) => state.systemMessages)
  const feedStatus = useAlertStore((state) => state.feedStatus)
  const selectedAlertId = useAlertStore((state) => state.selectedAlertId)
  const setSelectedAlertId = useAlertStore((state) => state.setSelectedAlertId)
  const focusedSystemMessageId = useAlertStore((state) => state.focusedSystemMessageId)
  const setFocusedSystemMessageId = useAlertStore((state) => state.setFocusedSystemMessageId)
  const focusedIncidentAlertId = useAlertStore((state) => state.focusedIncidentAlertId)
  const pendingIncidentQueue = useAlertStore((state) => state.pendingIncidentQueue)
  const focusIncident = useAlertStore((state) => state.focusIncident)
  const promotePendingIncident = useAlertStore((state) => state.promotePendingIncident)
  const clearFocusedIncident = useAlertStore((state) => state.clearFocusedIncident)
  const retentionMs = useAlertStore((state) => state.retentionMs)
  const setRetentionMs = useAlertStore((state) => state.setRetentionMs)
  const dismissCurrentAlerts = useAlertStore((state) => state.dismissCurrentAlerts)
  const setFocusCoordinate = useAlertStore((state) => state.setFocusCoordinate)
  const alertSettings = useScenarioStore((state) => state.document.alerts ?? DEFAULT_SCENARIO_ALERT_SETTINGS)
  const setAlertsEnabled = useScenarioStore((state) => state.setAlertsEnabled)
  const setAlertAutoZoomEnabled = useScenarioStore((state) => state.setAlertAutoZoomEnabled)
  const setEditorAlertSoundEnabled = useScenarioStore((state) => state.setEditorAlertSoundEnabled)
  const setEditorAlertVolume = useScenarioStore((state) => state.setEditorAlertVolume)
  const setPresentationAlertSoundEnabled = useScenarioStore((state) => state.setPresentationAlertSoundEnabled)
  const setPresentationAlertVolume = useScenarioStore((state) => state.setPresentationAlertVolume)
  const setBannerAutoDismissSec = useScenarioStore((state) => state.setBannerAutoDismissSec)
  const [now, setNow] = useState(() => Date.now())
  const enabled = alertSettings.enabled

  useEffect(() => {
    if (!enabled && alerts.length === 0 && historyAlerts.length === 0) {
      return
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [alerts.length, enabled, historyAlerts.length])

  const timeline = useMemo(() => {
    const activeIds = new Set(alerts.map((a) => a.id))
    const items: TimelineItem[] = []

    for (const alert of historyAlerts) {
      items.push({
        kind: 'alert',
        alert,
        timestampMs: alert.occurredAtMs,
        isActive: activeIds.has(alert.id),
      })
    }

    for (const msg of systemMessages) {
      items.push({ kind: 'system', message: msg as TzevaadomSystemMessage, timestampMs: msg.receivedAtMs })
    }

    items.sort((a, b) => b.timestampMs - a.timestampMs)
    return items.slice(0, 300)
  }, [historyAlerts, systemMessages, alerts])

  const alertsById = useMemo(() => {
    const next = new Map<string, (typeof historyAlerts)[number]>()
    for (const alert of historyAlerts) {
      next.set(alert.id, alert)
    }
    for (const alert of alerts) {
      next.set(alert.id, alert)
    }
    return next
  }, [alerts, historyAlerts])

  const focusedIncidentAlert = useMemo(() => {
    if (!focusedIncidentAlertId) {
      return null
    }

    const alert = alertsById.get(focusedIncidentAlertId) ?? null
    return isGroupedIncidentAlert(alert) ? alert : null
  }, [alertsById, focusedIncidentAlertId])

  const pendingIncidentEntries = useMemo(
    () =>
      pendingIncidentQueue
        .map((item) => {
          const alert = alertsById.get(item.alertId)
          return alert && isGroupedIncidentAlert(alert) ? { ...item, alert } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [alertsById, pendingIncidentQueue],
  )

  function handleSelectAlert(alertId: string | null) {
    if (!alertId) {
      setSelectedAlertId(null)
      return
    }

    const alert = alertsById.get(alertId)
    if (alert && isGroupedIncidentAlert(alert)) {
      focusIncident(alert.id, alert.occurredAtMs)
      setFocusedSystemMessageId(null)
      return
    }

    clearFocusedIncident()
    setFocusedSystemMessageId(null)
    setSelectedAlertId(alertId)
  }

  function handleSelectSystem(id: number | null) {
    clearFocusedIncident()
    setSelectedAlertId(null)
    setFocusedSystemMessageId(id)
  }

  const statusLabel = getFeedStatusLabel(feedStatus)

  return (
    <div className="alerts-panel">
      <div className="version-panel-header alerts-panel-header">
        <div>
          <p className="eyebrow">Canlı feed</p>
          <h3>Tzeva Adom</h3>
        </div>
        <button
          className={`secondary-button alerts-toggle-button${enabled ? ' secondary-button-active' : ''}`}
          disabled={!canToggle}
          onClick={() => setAlertsEnabled(!enabled)}
          type="button"
        >
          {enabled ? 'Açık' : 'Kapalı'}
        </button>
      </div>

      <div className="alerts-status-row">
        <span className={`alerts-status-chip alerts-status-chip-${feedStatus}`}>{statusLabel}</span>
        <span className="alerts-count-badge">{alerts.length} aktif</span>
        <span className="alerts-count-badge">{timeline.length} kayıt</span>
      </div>

      {focusedIncidentAlert ? (
        <FocusedAlertIncidentView
          alert={focusedIncidentAlert}
          onFocusCity={setFocusCoordinate}
          onSelectQueue={promotePendingIncident}
          queueItems={pendingIncidentEntries}
          variant="sidebar"
        />
      ) : null}

      <div className="alerts-audio-controls">
        <label className="alerts-audio-toggle alerts-inline-toggle">
          <input
            checked={alertSettings.autoZoomEnabled}
            disabled={!canToggle || !enabled}
            onChange={(event) => setAlertAutoZoomEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Yeni alarmda oto odak</span>
        </label>

        <div className="alerts-audio-group">
          <strong>Editör sesi</strong>
          <label className="alerts-audio-toggle">
            <input
              checked={alertSettings.editorSoundEnabled}
              disabled={!canToggle || !enabled}
              onChange={(event) => setEditorAlertSoundEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>Açık</span>
          </label>
          <label className="alerts-volume-control">
            <span>Ses {Math.round(alertSettings.editorVolume * 100)}%</span>
            <input
              disabled={!canToggle || !enabled || !alertSettings.editorSoundEnabled}
              max={100}
              min={0}
              onChange={(event) => setEditorAlertVolume(Number(event.target.value) / 100)}
              step={5}
              type="range"
              value={Math.round(alertSettings.editorVolume * 100)}
            />
          </label>
        </div>

        <div className="alerts-audio-group">
          <strong>Sunum sesi</strong>
          <label className="alerts-audio-toggle">
            <input
              checked={alertSettings.presentationSoundEnabled}
              disabled={!canToggle || !enabled}
              onChange={(event) => setPresentationAlertSoundEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>Açık</span>
          </label>
          <label className="alerts-volume-control">
            <span>Ses {Math.round(alertSettings.presentationVolume * 100)}%</span>
            <input
              disabled={!canToggle || !enabled || !alertSettings.presentationSoundEnabled}
              max={100}
              min={0}
              onChange={(event) => setPresentationAlertVolume(Number(event.target.value) / 100)}
              step={5}
              type="range"
              value={Math.round(alertSettings.presentationVolume * 100)}
            />
          </label>
        </div>

        <p className="alerts-audio-note">Sunum sekmesinde ilk alarm sesi için bir kez dokunmak gerekir.</p>

        <label className="alerts-volume-control">
          <span>
            Bildirimler{' '}
            {BANNER_DISMISS_OPTIONS.find((o) => o.value === alertSettings.bannerAutoDismissSec)?.label ??
              `${alertSettings.bannerAutoDismissSec} sn`}{' '}
            sonra kapanır
          </span>
          <select
            className="panel-input panel-select"
            disabled={!canToggle || !enabled}
            onChange={(event) => setBannerAutoDismissSec(Number(event.target.value))}
            value={alertSettings.bannerAutoDismissSec}
          >
            {BANNER_DISMISS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="alerts-volume-control">
          <span>
            Noktalar ekranda{' '}
            {ALERT_RETENTION_OPTIONS.find((o) => o.value === retentionMs)?.label ??
              `${Math.round(retentionMs / 1000)} sn`}{' '}
            kalır
          </span>
          <select
            className="panel-input panel-select"
            disabled={!canToggle || !enabled}
            onChange={(event) => setRetentionMs(Number(event.target.value))}
            value={retentionMs}
          >
            {ALERT_RETENTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className="secondary-button alerts-clear-button"
          disabled={!enabled || alerts.length === 0}
          onClick={() => dismissCurrentAlerts(Date.now())}
          type="button"
        >
          Aktifleri temizle
        </button>
      </div>

      {!enabled ? (
        <p className="panel-empty">Canlı alarmları görmek için feed&apos;i aç.</p>
      ) : (
        <section className="alerts-section">
          <div className="alerts-section-header">
            <h4>Son 24 Saat</h4>
            <span>{timeline.length}</span>
          </div>
          {timeline.length === 0 ? (
            <p className="panel-empty">Henüz kayıt yok.</p>
          ) : (
            <div className="alerts-list alerts-timeline-list">
              {timeline.map((item) => {
                const key = item.kind === 'alert' ? item.alert.id : `sys-${item.message.id}-${item.message.type}`
                const isSelected = item.kind === 'alert'
                  ? selectedAlertId === item.alert.id
                  : focusedSystemMessageId === item.message.id
                return (
                  <TimelineCard
                    key={key}
                    item={item}
                    now={now}
                    active={isSelected}
                    onFocusCity={setFocusCoordinate}
                    onSelect={handleSelectAlert}
                    onSelectSystem={handleSelectSystem}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
