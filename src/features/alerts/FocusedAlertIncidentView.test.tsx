import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AlertIncidentDockItem, RocketAlert } from '@/features/alerts/types'
import type { TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'
import { FocusedAlertIncidentView } from '@/features/alerts/FocusedAlertIncidentView'

const focusedAlert: RocketAlert = {
  id: 'incident-1',
  name: 'Roket',
  englishName: 'Tel Aviv, Holon, Bat Yam',
  lat: 32.0853,
  lon: 34.7818,
  alertTypeId: 1,
  countdownSec: 90,
  areaNameEn: 'Dan',
  timeStampRaw: '2026-03-26T12:00:00.000Z',
  occurredAtMs: Date.UTC(2026, 2, 26, 12, 0, 0),
  fetchedAtMs: Date.UTC(2026, 2, 26, 12, 0, 1),
  taCityId: null,
  citiesDetail: [
    { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818, zone: 'Dan', countdown: 90 },
    { name: 'Holon', lat: 32.0158, lon: 34.7874, zone: 'Dan', countdown: 90 },
    { name: 'Rishon LeZion', lat: 31.973, lon: 34.7925, zone: 'Shfela', countdown: 90 },
  ],
}

const queuedAlert: RocketAlert = {
  ...focusedAlert,
  id: 'incident-2',
  englishName: 'Raanana, Rishpon',
  areaNameEn: 'Sharon',
  occurredAtMs: Date.UTC(2026, 2, 26, 12, 0, 15),
  citiesDetail: [
    { name: 'Raanana', lat: 32.1848, lon: 34.8713, zone: 'Sharon', countdown: 90 },
    { name: 'Rishpon', lat: 32.2045, lon: 34.8189, zone: 'Sharon', countdown: 90 },
  ],
}

const endedMessage: TzevaadomSystemMessage = {
  id: 101,
  time: '12:00:25',
  type: 'incident_ended',
  titleEn: 'Home Front Command - Incident Ended',
  titleHe: '',
  bodyEn: 'The incident has ended.',
  bodyHe: '',
  bodyAr: '',
  receivedAtMs: Date.UTC(2026, 2, 26, 12, 0, 25),
  citiesEnriched: [
    {
      en: 'Bika',
      he: '',
      lat: 32.11,
      lng: 35.41,
      zone_en: 'Samaria',
      countdown: 0,
    },
  ],
}

const focusedItem: AlertIncidentDockItem = {
  key: `alert:${focusedAlert.id}`,
  kind: 'alert',
  receivedAtMs: focusedAlert.occurredAtMs,
  expiresAtMs: focusedAlert.occurredAtMs + 120_000,
  isLive: true,
  alert: focusedAlert,
}

const streamItems: AlertIncidentDockItem[] = [
  focusedItem,
  {
    key: `alert:${queuedAlert.id}`,
    kind: 'alert',
    receivedAtMs: queuedAlert.occurredAtMs,
    expiresAtMs: queuedAlert.occurredAtMs + 120_000,
    isLive: true,
    alert: queuedAlert,
  },
  {
    key: 'system:101:incident_ended:1774526425000',
    kind: 'system',
    receivedAtMs: endedMessage.receivedAtMs,
    expiresAtMs: endedMessage.receivedAtMs + 120_000,
    isLive: true,
    message: endedMessage,
  },
]

describe('FocusedAlertIncidentView', () => {
  it('renders grouped city chips without the long non-clickable city string and shows a headless live stream', async () => {
    const user = userEvent.setup()
    const onFocusCity = vi.fn()
    const onSelectStreamItem = vi.fn()
    const onDismiss = vi.fn()

    render(
      <FocusedAlertIncidentView
        focusedItem={focusedItem}
        onDismiss={onDismiss}
        onFocusCity={onFocusCity}
        onSelectStreamItem={onSelectStreamItem}
        streamItems={streamItems}
        variant="overlay"
      />,
    )

    expect(screen.queryByText(focusedAlert.englishName)).not.toBeInTheDocument()
    expect(screen.queryByText('Bu sirada gelenler')).not.toBeInTheDocument()
    expect(screen.getByText('Dan')).toBeInTheDocument()
    expect(screen.getByText('Shfela')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tel Aviv' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Holon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rishon LeZion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /15:00:15 • Roket • 2 sehir/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /15:00:25 • Olay sonu • 1 sehir/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Holon' }))
    expect(onFocusCity).toHaveBeenCalledWith({
      lat: 32.0158,
      lon: 34.7874,
      name: 'Holon',
    })

    await user.click(screen.getByRole('button', { name: /15:00:15 • Roket • 2 sehir/i }))
    expect(onSelectStreamItem).toHaveBeenCalledWith(`alert:${queuedAlert.id}`)

    await user.click(screen.getByRole('button', { name: 'Incident panelini kapat' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
