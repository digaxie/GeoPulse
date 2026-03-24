import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_ALERT_RETENTION_MS, type RocketAlert } from '@/features/alerts/types'
import { useAlertStore } from '@/features/alerts/useAlertStore'

const sampleAlert: RocketAlert = {
  id: 'alert-1',
  name: 'מלכיה',
  englishName: 'Malkia',
  lat: 33.0986,
  lon: 35.5096,
  alertTypeId: 2,
  countdownSec: 0,
  areaNameEn: 'Confrontation Line',
  timeStampRaw: '2026-03-22 06:15:23',
  occurredAtMs: 1_699_999_700_000,
  fetchedAtMs: 1_700_000_000_000,
  taCityId: 1608,
}

describe('useAlertStore', () => {
  beforeEach(() => {
    useAlertStore.setState({
      alerts: [],
      historyAlerts: [],
      feedStatus: 'disconnected',
      feedTransport: 'none',
      lastFetchedAt: null,
      selectedAlertId: null,
      dismissedBeforeMs: null,
      retentionMs: DEFAULT_ALERT_RETENTION_MS,
    })
  })

  it('keeps selected alert only while it still exists in the feed', () => {
    useAlertStore.getState().setAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().setSelectedAlertId(sampleAlert.id)

    useAlertStore.getState().setAlerts([], sampleAlert.fetchedAtMs + 10_000)

    expect(useAlertStore.getState().selectedAlertId).toBeNull()
  })

  it('preserves lastFetchedAt when alerts are updated from an error path', () => {
    useAlertStore.getState().setAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().setAlerts([sampleAlert], null)

    expect(useAlertStore.getState().lastFetchedAt).toBe(sampleAlert.fetchedAtMs)
  })

  it('can dismiss current alerts until newer ones arrive', () => {
    useAlertStore.getState().setAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().setHistoryAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().dismissCurrentAlerts(sampleAlert.occurredAtMs)
    useAlertStore.getState().setAlerts(
      [
        sampleAlert,
        {
          ...sampleAlert,
          id: 'alert-2',
          englishName: 'Avivim',
          occurredAtMs: sampleAlert.occurredAtMs + 1,
        },
      ],
      sampleAlert.fetchedAtMs + 5000,
    )

    expect(useAlertStore.getState().alerts.map((alert) => alert.id)).toEqual(['alert-2'])
    expect(useAlertStore.getState().historyAlerts.map((alert) => alert.id)).toEqual(['alert-1'])
  })

  it('stores feed transport and local retention without touching shared scenario state', () => {
    useAlertStore.getState().setFeedTransport('stream')
    useAlertStore.getState().setRetentionMs(30_000)

    expect(useAlertStore.getState().feedTransport).toBe('stream')
    expect(useAlertStore.getState().retentionMs).toBe(30_000)
  })

  it('keeps selected history alerts after active alerts are dismissed', () => {
    useAlertStore.getState().setAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().setHistoryAlerts([sampleAlert], sampleAlert.fetchedAtMs)
    useAlertStore.getState().setSelectedAlertId(sampleAlert.id)

    useAlertStore.getState().dismissCurrentAlerts(sampleAlert.occurredAtMs)

    expect(useAlertStore.getState().alerts).toEqual([])
    expect(useAlertStore.getState().selectedAlertId).toBe(sampleAlert.id)
  })

  it('prunes and caps 24 hour history independently from active alerts', () => {
    const now = sampleAlert.fetchedAtMs
    useAlertStore.getState().setHistoryAlerts(
      [
        ...Array.from({ length: 255 }, (_, index) => ({
          ...sampleAlert,
          id: `history-${index}`,
          englishName: `Alert ${index}`,
          occurredAtMs: now - index * 1_000,
        })),
        {
          ...sampleAlert,
          id: 'expired-history',
          occurredAtMs: now - 25 * 60 * 60 * 1000,
        },
      ],
      now,
    )

    expect(useAlertStore.getState().historyAlerts).toHaveLength(250)
    expect(useAlertStore.getState().historyAlerts.some((alert) => alert.id === 'expired-history')).toBe(false)
  })
})
