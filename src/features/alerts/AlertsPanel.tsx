import {
  type AlertEventSoundFamily,
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  type AlertFeedStatus,
} from '@/features/alerts/types'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useScenarioStore } from '@/features/scenario/store'

function getFeedStatusLabel(status: AlertFeedStatus) {
  switch (status) {
    case 'connecting':
      return 'baglaniyor'
    case 'live':
      return 'canli'
    case 'error':
      return 'hata'
    default:
      return 'kapali'
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

const EVENT_SOUND_DURATION_OPTIONS = [
  { value: 'full', label: 'Tamami' },
  ...Array.from({ length: 30 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} sn`,
  })),
] as const

const EVENT_SOUND_ROWS: ReadonlyArray<{
  family: AlertEventSoundFamily
  label: string
}> = [
  { family: 'rocket', label: 'Roket' },
  { family: 'drone', label: 'IHA' },
  { family: 'earlyWarning', label: 'Early warning' },
  { family: 'incidentEnded', label: 'Incident ended' },
]

type AlertsPanelProps = {
  canToggle?: boolean
}

export function AlertsPanel({ canToggle = true }: AlertsPanelProps) {
  const alerts = useAlertStore((state) => state.alerts)
  const feedStatus = useAlertStore((state) => state.feedStatus)
  const retentionMs = useAlertStore((state) => state.retentionMs)
  const setRetentionMs = useAlertStore((state) => state.setRetentionMs)
  const dismissCurrentAlerts = useAlertStore((state) => state.dismissCurrentAlerts)
  const historyAlerts = useAlertStore((state) => state.historyAlerts)
  const systemMessages = useAlertStore((state) => state.systemMessages)

  const alertSettings = useScenarioStore((state) => state.document.alerts ?? DEFAULT_SCENARIO_ALERT_SETTINGS)
  const setAlertsEnabled = useScenarioStore((state) => state.setAlertsEnabled)
  const setAlertAutoZoomEnabled = useScenarioStore((state) => state.setAlertAutoZoomEnabled)
  const setEditorAlertSoundEnabled = useScenarioStore((state) => state.setEditorAlertSoundEnabled)
  const setEditorAlertVolume = useScenarioStore((state) => state.setEditorAlertVolume)
  const setPresentationAlertSoundEnabled = useScenarioStore((state) => state.setPresentationAlertSoundEnabled)
  const setPresentationAlertVolume = useScenarioStore((state) => state.setPresentationAlertVolume)
  const setAlertEventSoundEnabled = useScenarioStore((state) => state.setAlertEventSoundEnabled)
  const setAlertEventSoundMaxPlaySeconds = useScenarioStore(
    (state) => state.setAlertEventSoundMaxPlaySeconds,
  )
  const setBannerAutoDismissSec = useScenarioStore((state) => state.setBannerAutoDismissSec)

  const enabled = alertSettings.enabled
  const statusLabel = getFeedStatusLabel(feedStatus)
  const historyCount = historyAlerts.length + systemMessages.length

  return (
    <div className="alerts-panel">
      <div className="version-panel-header alerts-panel-header">
        <div>
          <p className="eyebrow">Alarm ayarlari</p>
          <h3>Tzeva Adom</h3>
        </div>
        <button
          className={`secondary-button alerts-toggle-button${enabled ? ' secondary-button-active' : ''}`}
          disabled={!canToggle}
          onClick={() => setAlertsEnabled(!enabled)}
          type="button"
        >
          {enabled ? 'Acik' : 'Kapali'}
        </button>
      </div>

      <div className="alerts-status-row">
        <span className={`alerts-status-chip alerts-status-chip-${feedStatus}`}>{statusLabel}</span>
        <span className="alerts-count-badge">{alerts.length} aktif</span>
        <span className="alerts-count-badge">{historyCount} kayit</span>
      </div>

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
          <strong>Editor sesi</strong>
          <label className="alerts-audio-toggle">
            <input
              checked={alertSettings.editorSoundEnabled}
              disabled={!canToggle || !enabled}
              onChange={(event) => setEditorAlertSoundEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>Acik</span>
          </label>
          <label className="alerts-volume-control">
            <span>Ses {Math.round(alertSettings.editorVolume * 100)}%</span>
            <input
              disabled={!canToggle || !enabled || !alertSettings.editorSoundEnabled}
              max={100}
              min={0}
              onChange={(event) => setEditorAlertVolume(Number(event.target.value) / 100)}
              step={1}
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
            <span>Acik</span>
          </label>
          <label className="alerts-volume-control">
            <span>Ses {Math.round(alertSettings.presentationVolume * 100)}%</span>
            <input
              disabled={!canToggle || !enabled || !alertSettings.presentationSoundEnabled}
              max={100}
              min={0}
              onChange={(event) => setPresentationAlertVolume(Number(event.target.value) / 100)}
              step={1}
              type="range"
              value={Math.round(alertSettings.presentationVolume * 100)}
            />
          </label>
        </div>

        <div className="alerts-audio-group">
          <strong>Olay sesleri</strong>
          <div className="alerts-event-sound-list">
            {EVENT_SOUND_ROWS.map((row) => {
              const eventSound = alertSettings.eventSounds[row.family]
              return (
                <div className="alerts-event-sound-row" key={row.family}>
                  <label className="alerts-audio-toggle">
                    <input
                      checked={eventSound.enabled}
                      disabled={!canToggle || !enabled}
                      onChange={(event) => setAlertEventSoundEnabled(row.family, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{row.label}</span>
                  </label>
                  <label className="alerts-event-sound-duration">
                    <span>Sure</span>
                    <select
                      className="panel-input panel-select"
                      disabled={!canToggle || !enabled || !eventSound.enabled}
                      onChange={(event) =>
                        setAlertEventSoundMaxPlaySeconds(
                          row.family,
                          event.target.value === 'full' ? null : Number(event.target.value),
                        )
                      }
                      value={eventSound.maxPlaySeconds === null ? 'full' : String(eventSound.maxPlaySeconds)}
                    >
                      {EVENT_SOUND_DURATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )
            })}
          </div>
        </div>

        <p className="alerts-audio-note">Sunum sekmesinde ilk alarm sesi icin bir kez dokunmak gerekir.</p>

        <label className="alerts-volume-control">
          <span>
            Bildirimler{' '}
            {BANNER_DISMISS_OPTIONS.find((option) => option.value === alertSettings.bannerAutoDismissSec)?.label ??
              `${alertSettings.bannerAutoDismissSec} sn`}{' '}
            sonra kapanir
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
            {ALERT_RETENTION_OPTIONS.find((option) => option.value === retentionMs)?.label ??
              `${Math.round(retentionMs / 1000)} sn`}{' '}
            kalir
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
        <p className="panel-empty">Canli alarmlari gormek icin feed'i ac.</p>
      ) : (
        <p className="alerts-settings-note">
          Canli olaylar ve son 24 saat kartlari soldaki harita drawer'inda gosterilir.
        </p>
      )}
    </div>
  )
}
