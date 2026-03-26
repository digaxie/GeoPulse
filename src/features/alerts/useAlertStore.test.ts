import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const groupedAlert: RocketAlert = {
  ...sampleAlert,
  id: 'grouped-alert-1',
  englishName: 'Dan',
  areaNameEn: 'Dan',
  citiesDetail: [
    { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818, zone: 'Dan', countdown: 90 },
    { name: 'Holon', lat: 32.0158, lon: 34.7874, zone: 'Dan', countdown: 90 },
    { name: 'Bat Yam', lat: 32.0238, lon: 34.7519, zone: 'Dan', countdown: 90 },
  ],
}

const groupedAlertTwo: RocketAlert = {
  ...groupedAlert,
  id: 'grouped-alert-2',
  englishName: 'Sharon',
  areaNameEn: 'Sharon',
  occurredAtMs: groupedAlert.occurredAtMs + 5_000,
  citiesDetail: [
    { name: 'Raanana', lat: 32.1848, lon: 34.8713, zone: 'Sharon', countdown: 90 },
    { name: 'Rishpon', lat: 32.2045, lon: 34.8189, zone: 'Sharon', countdown: 90 },
  ],
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
      tzevaadomStatus: 'disconnected',
      systemMessages: [],
      focusedIncidentAlertId: null,
      focusedIncidentPinnedAtMs: null,
      pendingIncidentQueue: [],
      alertsPanelRevealNonce: 0,
      focusedSystemMessageId: null,
      focusCoordinate: null,
      focusTrigger: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    const now = sampleAlert.occurredAtMs + 10_000
    useAlertStore.getState().setAlerts([sampleAlert], now)
    useAlertStore.getState().setHistoryAlerts([sampleAlert], now)
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
      now + 5_000,
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

  it('prunes active alerts once they exceed the configured retention window', () => {
    const now = sampleAlert.occurredAtMs + 31_000
    useAlertStore.getState().setRetentionMs(30_000)
    useAlertStore.getState().setAlerts([sampleAlert], sampleAlert.fetchedAtMs)

    useAlertStore.getState().pruneActiveAlerts(now)

    expect(useAlertStore.getState().alerts).toEqual([])
  })

  it('immediately drops active alerts when retention is shortened below their age', () => {
    const now = sampleAlert.occurredAtMs + 45_000
    useAlertStore.getState().setAlerts([sampleAlert], now)

    vi.spyOn(Date, 'now').mockReturnValue(now)
    useAlertStore.getState().setRetentionMs(30_000)

    expect(useAlertStore.getState().alerts).toEqual([])
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

  it('focuses a grouped incident and queues later grouped incidents without duplicates', () => {
    const now = groupedAlertTwo.occurredAtMs + 1_000
    useAlertStore.getState().setAlerts([groupedAlert, groupedAlertTwo], now)
    useAlertStore.getState().setHistoryAlerts([groupedAlert, groupedAlertTwo], now)

    useAlertStore.getState().focusIncident(groupedAlert.id, groupedAlert.occurredAtMs)
    useAlertStore.getState().enqueuePendingIncident(groupedAlertTwo.id, groupedAlertTwo.occurredAtMs)
    useAlertStore.getState().enqueuePendingIncident(groupedAlertTwo.id, groupedAlertTwo.occurredAtMs)

    expect(useAlertStore.getState().focusedIncidentAlertId).toBe(groupedAlert.id)
    expect(useAlertStore.getState().selectedAlertId).toBe(groupedAlert.id)
    expect(useAlertStore.getState().pendingIncidentQueue).toEqual([
      {
        alertId: groupedAlertTwo.id,
        receivedAtMs: groupedAlertTwo.occurredAtMs,
      },
    ])
  })

  it('promotes a queued grouped incident and removes it from the queue', () => {
    const now = groupedAlertTwo.occurredAtMs + 1_000
    useAlertStore.getState().setAlerts([groupedAlert, groupedAlertTwo], now)
    useAlertStore.getState().setHistoryAlerts([groupedAlert, groupedAlertTwo], now)
    useAlertStore.getState().focusIncident(groupedAlert.id, groupedAlert.occurredAtMs)
    useAlertStore.getState().enqueuePendingIncident(groupedAlertTwo.id, groupedAlertTwo.occurredAtMs)

    useAlertStore.getState().promotePendingIncident(groupedAlertTwo.id)

    expect(useAlertStore.getState().focusedIncidentAlertId).toBe(groupedAlertTwo.id)
    expect(useAlertStore.getState().selectedAlertId).toBe(groupedAlertTwo.id)
    expect(useAlertStore.getState().pendingIncidentQueue).toEqual([])
  })
})
