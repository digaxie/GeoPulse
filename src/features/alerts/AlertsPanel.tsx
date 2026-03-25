import { useEffect, useMemo, useState } from 'react'

import {
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  type AlertFeedStatus,
  type AlertFeedTransport,
  formatAlertOccurredAtTr,
  formatAlertShelterInstruction,
  getAlertAgeMinutes,
  getAlertTypeLabel,
  type RocketAlert,
} from '@/features/alerts/types'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useScenarioStore } from '@/features/scenario/store'

function getFeedStatusLabel(status: AlertFeedStatus) {
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

function getFeedTransportLabel(transport: AlertFeedTransport) {
  switch (transport) {
    case 'stream':
      return 'canlı akış'
    case 'polling':
      return 'yedek polling'
    default:
      return 'hazır'
  }
}

type AlertsPanelProps = {
  canToggle?: boolean
}

function AlertListItem({
  alert,
  now,
  active,
  onSelect,
}: {
  alert: RocketAlert
  now: number
  active: boolean
  onSelect: (alertId: string) => void
}) {
  return (
    <button
      className={`alerts-item${active ? ' alerts-item-active' : ''}`}
      onClick={() => onSelect(alert.id)}
      type="button"
    >
      <div className="alerts-item-title">
        <strong>{alert.englishName}</strong>
        <span>{getAlertTypeLabel(alert.alertTypeId)}</span>
      </div>
      <div className="alerts-item-meta">
        <span>{alert.areaNameEn || 'Bölge bilgisi yok'}</span>
        <span>{formatAlertShelterInstruction(alert.countdownSec)}</span>
      </div>
      <div className="alerts-item-meta">
        <span>{getAlertAgeMinutes(alert, now)} dk önce</span>
        <span>{formatAlertOccurredAtTr(alert)}</span>
      </div>
    </button>
  )
}

export function AlertsPanel({ canToggle = true }: AlertsPanelProps) {
  const alerts = useAlertStore((state) => state.alerts)
  const historyAlerts = useAlertStore((state) => state.historyAlerts)
  const feedStatus = useAlertStore((state) => state.feedStatus)
  const feedTransport = useAlertStore((state) => state.feedTransport)
  const lastFetchedAt = useAlertStore((state) => state.lastFetchedAt)
  const selectedAlertId = useAlertStore((state) => state.selectedAlertId)
  const retentionMs = useAlertStore((state) => state.retentionMs)
  const setSelectedAlertId = useAlertStore((state) => state.setSelectedAlertId)
  const setRetentionMs = useAlertStore((state) => state.setRetentionMs)
  const dismissCurrentAlerts = useAlertStore((state) => state.dismissCurrentAlerts)
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

  const orderedAlerts = useMemo(() => alerts.slice(0, 12), [alerts])
  const orderedHistoryAlerts = useMemo(() => historyAlerts.slice(0, 250), [historyAlerts])
  const statusLabel = getFeedStatusLabel(feedStatus)
  const lastFetchedText = useMemo(() => {
    if (!lastFetchedAt) {
      return 'Son veri henüz yok'
    }

    const seconds = Math.max(0, Math.round((now - lastFetchedAt) / 1000))
    return `Son güncelleme ${seconds} sn önce`
  }, [lastFetchedAt, now])

  return (
    <div className="alerts-panel">
      <div className="version-panel-header alerts-panel-header">
        <div>
          <p className="eyebrow">Canlı feed</p>
          <h3>İsrail Alarmları</h3>
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
        {enabled ? <span className="alerts-transport-badge">{getFeedTransportLabel(feedTransport)}</span> : null}
        <span className="alerts-count-badge">{alerts.length} alarm</span>
      </div>

      <p className="alerts-status-note">{lastFetchedText}</p>

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
            Noktalar ekranda{' '}
            {ALERT_RETENTION_OPTIONS.find((option) => option.value === retentionMs)?.label ??
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
        <>
          <section className="alerts-section">
            <div className="alerts-section-header">
              <h4>Aktif alarmlar</h4>
              <span>{alerts.length}</span>
            </div>
            {orderedAlerts.length === 0 ? (
              <p className="panel-empty">
                {feedStatus === 'error'
                  ? 'Feed hatada. Son veri bekleniyor.'
                  : 'Şu anda aktif alarm görünmüyor.'}
              </p>
            ) : (
              <div className="alerts-list">
                {orderedAlerts.map((alert) => (
                  <AlertListItem
                    active={selectedAlertId === alert.id}
                    alert={alert}
                    key={alert.id}
                    now={now}
                    onSelect={setSelectedAlertId}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="alerts-section">
            <div className="alerts-section-header">
              <h4>Son 24 Saat</h4>
              <span>{orderedHistoryAlerts.length}</span>
            </div>
            {orderedHistoryAlerts.length === 0 ? (
              <p className="panel-empty">Son 24 saate ait alarm geçmişi henüz yüklenmedi.</p>
            ) : (
              <div className="alerts-list alerts-history-list">
                {orderedHistoryAlerts.map((alert) => (
                  <AlertListItem
                    active={selectedAlertId === alert.id}
                    alert={alert}
                    key={alert.id}
                    now={now}
                    onSelect={setSelectedAlertId}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
