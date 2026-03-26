import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RocketAlert } from '@/features/alerts/types'
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

describe('FocusedAlertIncidentView', () => {
  it('renders grouped city chips without the long non-clickable city string and promotes queued incidents', async () => {
    const user = userEvent.setup()
    const onFocusCity = vi.fn()
    const onSelectQueue = vi.fn()

    render(
      <FocusedAlertIncidentView
        alert={focusedAlert}
        onFocusCity={onFocusCity}
        onSelectQueue={onSelectQueue}
        queueItems={[
          {
            alertId: queuedAlert.id,
            receivedAtMs: queuedAlert.occurredAtMs,
            alert: queuedAlert,
          },
        ]}
        variant="overlay"
      />,
    )

    expect(screen.queryByText(focusedAlert.englishName)).not.toBeInTheDocument()
    expect(screen.getByText('Dan')).toBeInTheDocument()
    expect(screen.getByText('Shfela')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tel Aviv' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Holon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rishon LeZion' })).toBeInTheDocument()
    expect(screen.getByText('Bu sirada gelenler')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Holon' }))
    expect(onFocusCity).toHaveBeenCalledWith({
      lat: 32.0158,
      lon: 34.7874,
      name: 'Holon',
    })

    await user.click(screen.getByRole('button', { name: /Roket/i }))
    expect(onSelectQueue).toHaveBeenCalledWith(queuedAlert.id)
  })
})
