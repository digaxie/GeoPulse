import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_WINDOW_MS,
  DEFAULT_ALERT_RETENTION_MS,
} from '@/features/alerts/types'
import {
  buildAlertHistoryQueryWindow,
  createAlertFeed,
  fetchRocketAlertHistory,
  flattenAlertPayload,
  mergeAlertHistory,
  mergeAlerts,
  parseRealtimeAlertEventData,
  parseRocketAlertTimestamp,
} from '@/features/alerts/alertService'

function createResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function setDocumentHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => value,
  })
}

class FakeEventSource {
  static instances: FakeEventSource[] = []

  url: string
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>)
  }

  emitError() {
    this.onerror?.(new Event('error'))
  }

  static reset() {
    FakeEventSource.instances = []
  }
}

describe('alertService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T04:20:00.000Z'))
    setDocumentHidden(false)
    FakeEventSource.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parses upstream timestamps as Israel local time', () => {
    expect(parseRocketAlertTimestamp('2026-03-22 06:19:23')).toBe(
      Date.parse('2026-03-22T04:19:23.000Z'),
    )
  })

  it('flattens grouped upstream payload into normalized alerts', () => {
    const fetchedAtMs = Date.parse('2026-03-22T04:20:00.000Z')
    const alerts = flattenAlertPayload(
      [
        {
          alerts: [
            {
              name: '×ž×œ×›×™×”',
              englishName: 'Malkia',
              lat: 33.0986,
              lon: 35.5096,
              taCityId: 1608,
              alertTypeId: 2,
              countdownSec: 0,
              areaNameEn: 'Confrontation Line',
              timeStamp: '2026-03-22 06:19:23',
            },
          ],
        },
      ],
      fetchedAtMs,
    )

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.id).toBe('Malkia:2026-03-22 06:19:23:2:33.0986:35.5096:0:1608')
    expect(alerts[0]?.occurredAtMs).toBe(Date.parse('2026-03-22T04:19:23.000Z'))
  })

  it('builds the 24 hour history query in Jerusalem wall-clock time', () => {
    const query = buildAlertHistoryQueryWindow(Date.parse('2026-03-22T04:20:00.000Z'))

    expect(query).toEqual({
      from: '2026-03-21 06:20:00',
      to: '2026-03-22 06:20:00',
      alertTypeId: '0',
    })
  })

  it('ignores KEEP_ALIVE realtime events', () => {
    const fetchedAtMs = Date.parse('2026-03-22T04:20:00.000Z')
    const alerts = parseRealtimeAlertEventData(
      JSON.stringify({
        alerts: [
          {
            name: 'KEEP_ALIVE',
          },
        ],
      }),
      fetchedAtMs,
    )

    expect(alerts).toEqual([])
  })

  it('dedupes repeated alerts and drops entries older than ttl', () => {
    const now = DEFAULT_ALERT_RETENTION_MS + 10_000
    const existingAlerts = [
      {
        id: 'same',
        name: 'A',
        englishName: 'A',
        lat: 1,
        lon: 1,
        alertTypeId: 1 as const,
        countdownSec: 60,
        areaNameEn: 'Area',
        timeStampRaw: '2026-03-22 10:00:00',
        occurredAtMs: 10_000,
        fetchedAtMs: now,
        taCityId: 1,
      },
      {
        id: 'expired',
        name: 'Old',
        englishName: 'Old',
        lat: 2,
        lon: 2,
        alertTypeId: 2 as const,
        countdownSec: 0,
        areaNameEn: 'Area',
        timeStampRaw: '2026-03-22 09:00:00',
        occurredAtMs: 0,
        fetchedAtMs: now,
        taCityId: 2,
      },
    ]
    const incomingAlerts = [
      {
        ...existingAlerts[0],
        occurredAtMs: 20_000,
        fetchedAtMs: now,
      },
      {
        id: 'new',
        name: 'New',
        englishName: 'New',
        lat: 3,
        lon: 3,
        alertTypeId: 1 as const,
        countdownSec: 45,
        areaNameEn: 'Area',
        timeStampRaw: '2026-03-22 10:01:00',
        occurredAtMs: 20_000,
        fetchedAtMs: now,
        taCityId: 3,
      },
    ]

    const merged = mergeAlerts(existingAlerts, incomingAlerts, now, DEFAULT_ALERT_RETENTION_MS)

    expect(merged).toHaveLength(2)
    expect(merged.some((alert) => alert.id === 'expired')).toBe(false)
    expect(merged.find((alert) => alert.id === 'same')?.occurredAtMs).toBe(10_000)
    expect(merged.find((alert) => alert.id === 'new')).toBeTruthy()
  })

  it('merges and caps 24 hour alert history independently from retention alerts', () => {
    const now = Date.parse('2026-03-22T04:20:00.000Z')
    const merged = mergeAlertHistory(
      [
        {
          id: 'expired',
          name: 'Old',
          englishName: 'Old',
          lat: 1,
          lon: 1,
          alertTypeId: 1,
          countdownSec: 0,
          areaNameEn: '',
          timeStampRaw: '2026-03-21 01:00:00',
          occurredAtMs: now - ALERT_HISTORY_WINDOW_MS - 1,
          fetchedAtMs: now,
          taCityId: null,
        },
      ],
      Array.from({ length: ALERT_HISTORY_LIMIT + 5 }, (_, index) => ({
        id: `history-${index}`,
        name: `N${index}`,
        englishName: `N${index}`,
        lat: 30 + index,
        lon: 35 + index,
        alertTypeId: 1 as const,
        countdownSec: 0,
        areaNameEn: '',
        timeStampRaw: `2026-03-22 06:19:${String(index % 60).padStart(2, '0')}`,
        occurredAtMs: now - index * 1_000,
        fetchedAtMs: now,
        taCityId: null,
      })),
      now,
    )

    expect(merged).toHaveLength(ALERT_HISTORY_LIMIT)
    expect(merged.some((alert) => alert.id === 'expired')).toBe(false)
  })

  it('fetches and normalizes 24 hour history payloads from details endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createResponse({
        success: true,
        error: null,
        payload: [
          {
            date: '2026-03-22',
            alerts: [
              {
                name: 'אביבים',
                englishName: 'Avivim',
                lat: 33.0874,
                lon: 35.4672,
                taCityId: 1610,
                alertTypeId: 1,
                countdownSec: null,
                areaNameEn: null,
                timeStamp: '2026-03-22 06:19:50',
              },
            ],
          },
        ],
      }),
    )

    const result = await fetchRocketAlertHistory(undefined, fetchMock, Date.parse('2026-03-22T04:20:00.000Z'))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://agg.rocketalert.live/api/v1/alerts/details?'),
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.alerts).toEqual([
      expect.objectContaining({
        englishName: 'Avivim',
        countdownSec: 0,
        areaNameEn: '',
      }),
    ])
  })

  it('bootstraps from snapshot, then applies realtime deltas and ignores keepalive frames', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createResponse({
        success: true,
        error: null,
        payload: [
          {
            alerts: [
              {
                name: '×ž×œ×›×™×”',
                englishName: 'Malkia',
                lat: 33.0986,
                lon: 35.5096,
                taCityId: 1608,
                alertTypeId: 2,
                countdownSec: 0,
                areaNameEn: 'Confrontation Line',
                timeStamp: '2026-03-22 06:19:23',
              },
            ],
          },
        ],
      }),
    )

    const onAlerts = vi.fn()
    const onStatusChange = vi.fn()
    const onTransportChange = vi.fn()
    const feed = createAlertFeed({
      retentionMs: DEFAULT_ALERT_RETENTION_MS,
      fetchImpl: fetchMock,
      eventSourceFactory: (url) => new FakeEventSource(url),
      onAlerts,
      onStatusChange,
      onTransportChange,
      visibilityDocument: document,
    })

    feed.start()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith('connecting')
    expect(onAlerts).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ englishName: 'Malkia' })]),
      expect.objectContaining({ reason: 'snapshot', newAlerts: expect.arrayContaining([expect.objectContaining({ englishName: 'Malkia' })]) }),
    )

    const stream = FakeEventSource.instances[0]
    expect(stream?.url).toBe('https://agg.rocketalert.live/api/v2/alerts/real-time')
    stream?.emitOpen()

    expect(onTransportChange).toHaveBeenCalledWith('stream')
    expect(onStatusChange).toHaveBeenCalledWith('live')

    const callCountBeforeKeepAlive = onAlerts.mock.calls.length
    stream?.emitMessage(JSON.stringify({ alerts: [{ name: 'KEEP_ALIVE' }] }))
    expect(onAlerts).toHaveBeenCalledTimes(callCountBeforeKeepAlive)

    stream?.emitMessage(
      JSON.stringify({
        alerts: [
          {
            name: '××‘×™×‘×™×',
            englishName: 'Avivim',
            lat: 33.0874,
            lon: 35.4672,
            taCityId: 1610,
            alertTypeId: 1,
            countdownSec: 15,
            areaNameEn: 'Confrontation Line',
            timeStamp: '2026-03-22 06:19:50',
          },
        ],
      }),
    )

    expect(onAlerts).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ englishName: 'Malkia' }),
        expect.objectContaining({ englishName: 'Avivim' }),
      ]),
      expect.objectContaining({
        reason: 'stream',
        newAlerts: expect.arrayContaining([expect.objectContaining({ englishName: 'Avivim' })]),
      }),
    )

    feed.stop()
  })

  it('falls back to polling after three visible stream failures and retries stream upgrades', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createResponse({
          success: true,
          error: null,
          payload: [],
        }),
      )
      .mockResolvedValue(
        createResponse({
          success: true,
          error: null,
          payload: [],
        }),
      )

    const onAlerts = vi.fn()
    const onStatusChange = vi.fn()
    const onTransportChange = vi.fn()
    const feed = createAlertFeed({
      retentionMs: DEFAULT_ALERT_RETENTION_MS,
      fetchImpl: fetchMock,
      eventSourceFactory: (url) => new FakeEventSource(url),
      onAlerts,
      onStatusChange,
      onTransportChange,
      visibilityDocument: document,
    })

    feed.start()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(0)

    FakeEventSource.instances[0]?.emitError()
    await vi.advanceTimersByTimeAsync(3_000)
    FakeEventSource.instances[1]?.emitError()
    await vi.advanceTimersByTimeAsync(3_000)
    FakeEventSource.instances[2]?.emitError()
    await vi.advanceTimersByTimeAsync(0)

    expect(onTransportChange).toHaveBeenCalledWith('polling')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(4)

    feed.stop()
  })

  it('resyncs when the tab becomes visible again without escalating hidden stream errors into polling', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createResponse({
          success: true,
          error: null,
          payload: [],
        }),
      )

    const onAlerts = vi.fn()
    const onStatusChange = vi.fn()
    const onTransportChange = vi.fn()
    const feed = createAlertFeed({
      retentionMs: DEFAULT_ALERT_RETENTION_MS,
      fetchImpl: fetchMock,
      eventSourceFactory: (url) => new FakeEventSource(url),
      onAlerts,
      onStatusChange,
      onTransportChange,
      visibilityDocument: document,
    })

    feed.start()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(0)

    setDocumentHidden(true)
    FakeEventSource.instances[0]?.emitError()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(onTransportChange).not.toHaveBeenCalledWith('polling')

    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(300)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(2)

    feed.stop()
  })
})
