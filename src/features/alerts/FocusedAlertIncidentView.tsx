import {
  formatAlertTimeOnlyTr,
  getAlertCityCount,
  getAlertTypeLabel,
  getAlertZoneCount,
  groupAlertCitiesByZone,
  type AlertIncidentQueueItem,
  type RocketAlert,
} from '@/features/alerts/types'

type ResolvedIncidentQueueItem = AlertIncidentQueueItem & {
  alert: RocketAlert
}

type FocusedAlertIncidentViewProps = {
  alert: RocketAlert
  queueItems: ResolvedIncidentQueueItem[]
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
  onSelectQueue: (alertId: string) => void
  onDismiss: () => void
  variant: 'overlay' | 'sidebar'
}

export function FocusedAlertIncidentView({
  alert,
  queueItems,
  onFocusCity,
  onSelectQueue,
  onDismiss,
  variant,
}: FocusedAlertIncidentViewProps) {
  const cityGroups = groupAlertCitiesByZone(alert)
  const cityCount = getAlertCityCount(alert)
  const zoneCount = getAlertZoneCount(alert)
  const summary = [
    formatAlertTimeOnlyTr(alert.occurredAtMs),
    getAlertTypeLabel(alert.alertTypeId),
    `${cityCount} sehir`,
    zoneCount > 1 ? `${zoneCount} bolge` : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <section className={`incident-focus-panel incident-focus-panel-${variant}`}>
      <div className="incident-focus-panel-header">
        <div>
          <p className="incident-focus-panel-eyebrow">Incelenen alarm</p>
          <h3>{summary}</h3>
        </div>
        <button
          aria-label="Incelenen alarm panelini kapat"
          className="incident-focus-panel-dismiss"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="incident-focus-groups">
        {cityGroups.map((group) => (
          <section className="incident-focus-group" key={group.zone}>
            <h4>{group.zone}</h4>
            <div className="incident-focus-city-chips">
              {group.cities.map((city, index) => (
                <button
                  key={`${group.zone}-${city.name}-${index}`}
                  className="incident-focus-city-chip"
                  onClick={() => onFocusCity({ lat: city.lat, lon: city.lon, name: city.name })}
                  type="button"
                >
                  {city.name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {queueItems.length > 0 ? (
        <section className="incident-focus-queue">
          <div className="incident-focus-queue-header">
            <h4>Bu sirada gelenler</h4>
            <span>{queueItems.length}</span>
          </div>
          <div className="incident-focus-queue-list">
            {queueItems.map((item) => {
              const queueCityCount = getAlertCityCount(item.alert)
              const queueZoneCount = getAlertZoneCount(item.alert)
              const queueSummary = [
                formatAlertTimeOnlyTr(item.receivedAtMs),
                getAlertTypeLabel(item.alert.alertTypeId),
                `${queueCityCount} sehir`,
                queueZoneCount > 1 ? `${queueZoneCount} bolge` : null,
              ]
                .filter(Boolean)
                .join(' • ')

              return (
                <button
                  key={`${item.alertId}-${item.receivedAtMs}`}
                  className="incident-focus-queue-item"
                  onClick={() => onSelectQueue(item.alertId)}
                  type="button"
                >
                  {queueSummary}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
    </section>
  )
}
