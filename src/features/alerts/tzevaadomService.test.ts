import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchTzevaadomHistory,
  getTzevaadomAlertInstanceId,
  type TzevaadomAlert,
  type TzevaadomEventRow,
} from '@/features/alerts/tzevaadomService'

function createAlert(overrides: Partial<TzevaadomAlert> = {}): TzevaadomAlert {
  return {
    notificationId: 'notif-1',
    time: 1_711_111_111,
    threat: 0,
    isDrill: false,
    cities: ['Ashkelon'],
    citiesEnriched: [
      {
        he: 'אשקלון',
        en: 'Ashkelon',
        lat: 31.501,
        lng: 34.594,
        zone_en: 'Lachish',
        countdown: 30,
      },
    ],
    ...overrides,
  }
}

function createHistoryRow(index: number, receivedAtIso: string): TzevaadomEventRow {
  return {
    id: index + 1,
    event_type: 'ALERT',
    received_at: receivedAtIso,
    payload: {
      notificationId: `notif-${index + 1}`,
      time: Math.floor(Date.parse(receivedAtIso) / 1000),
      threat: 0,
      isDrill: false,
      cities: [`City ${index + 1}`],
      citiesEnriched: [
        {
          he: '',
          en: `City ${index + 1}`,
          lat: 32 + index / 1000,
          lng: 35 + index / 1000,
          zone_en: 'Zone',
          countdown: 90,
        },
      ],
    },
  }
}

function createSupabaseHistoryClient(rows: TzevaadomEventRow[]) {
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    }),
  )
  const order = vi.fn(() => ({ range }))
  const gte = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ gte }))
  const from = vi.fn(() => ({ select }))

  return {
    client: { from },
    range,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('getTzevaadomAlertInstanceId', () => {
  it('returns the same id for the same alert payload', () => {
    const alert = createAlert()

    expect(getTzevaadomAlertInstanceId(alert)).toBe(getTzevaadomAlertInstanceId(alert))
  })

  it('returns different ids for different city sets under the same upstream notification id', () => {
    const first = createAlert({
      cities: ['Ashkelon'],
      citiesEnriched: [
        {
          he: 'אשקלון',
          en: 'Ashkelon',
          lat: 31.501,
          lng: 34.594,
          zone_en: 'Lachish',
          countdown: 30,
        },
      ],
    })
    const second = createAlert({
      cities: ['Sderot'],
      citiesEnriched: [
        {
          he: 'שדרות',
          en: 'Sderot',
          lat: 31.525,
          lng: 34.596,
          zone_en: 'Western Negev',
          countdown: 15,
        },
      ],
    })

    expect(getTzevaadomAlertInstanceId(first)).not.toBe(getTzevaadomAlertInstanceId(second))
  })

  it('normalizes city ordering so replayed batches keep the same id', () => {
    const first = createAlert({
      cities: ['Ashkelon', 'Sderot'],
      citiesEnriched: [
        {
          he: 'אשקלון',
          en: 'Ashkelon',
          lat: 31.501,
          lng: 34.594,
          zone_en: 'Lachish',
          countdown: 30,
        },
        {
          he: 'שדרות',
          en: 'Sderot',
          lat: 31.525,
          lng: 34.596,
          zone_en: 'Western Negev',
          countdown: 15,
        },
      ],
    })
    const second = createAlert({
      cities: ['Sderot', 'Ashkelon'],
      citiesEnriched: [
        {
          he: 'שדרות',
          en: 'Sderot',
          lat: 31.525,
          lng: 34.596,
          zone_en: 'Western Negev',
          countdown: 15,
        },
        {
          he: 'אשקלון',
          en: 'Ashkelon',
          lat: 31.501,
          lng: 34.594,
          zone_en: 'Lachish',
          countdown: 30,
        },
      ],
    })

    expect(getTzevaadomAlertInstanceId(first)).toBe(getTzevaadomAlertInstanceId(second))
  })
})

describe('fetchTzevaadomHistory', () => {
  it('loads multiple history pages with range-based pagination', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00.000Z'))

    const rows = Array.from({ length: 220 }, (_, index) =>
      createHistoryRow(index, new Date(Date.now() - index * 60_000).toISOString()),
    )
    const { client, range } = createSupabaseHistoryClient(rows)

    const result = await fetchTzevaadomHistory(client, 24)

    expect(result.alerts).toHaveLength(220)
    expect(result.truncated).toBe(false)
    expect(range).toHaveBeenNthCalledWith(1, 0, 199)
    expect(range).toHaveBeenNthCalledWith(2, 200, 399)
  })

  it('marks history as truncated once the 1000 row cap is reached', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00.000Z'))

    const rows = Array.from({ length: 1005 }, (_, index) =>
      createHistoryRow(index, new Date(Date.now() - index * 30_000).toISOString()),
    )
    const { client } = createSupabaseHistoryClient(rows)

    const result = await fetchTzevaadomHistory(client, 24)

    expect(result.alerts).toHaveLength(1000)
    expect(result.truncated).toBe(true)
  })
})
