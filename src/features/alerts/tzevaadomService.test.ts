import { describe, expect, it } from 'vitest'

import { getTzevaadomAlertInstanceId, type TzevaadomAlert } from '@/features/alerts/tzevaadomService'

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
