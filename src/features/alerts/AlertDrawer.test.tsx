import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AlertDrawer, type DrawerCardItem } from '@/features/alerts/AlertDrawer'
import type { RocketAlert } from '@/features/alerts/types'
import type { TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

const groupedAlert: RocketAlert = {
  id: 'alert-1',
  name: 'Roket',
  englishName: 'Even Menachem, Shtula, Zarit',
  lat: 33.08,
  lon: 35.28,
  alertTypeId: 1,
  countdownSec: 90,
  areaNameEn: 'Confrontation Line',
  timeStampRaw: '2026-03-26T17:51:07.000Z',
  occurredAtMs: Date.UTC(2026, 2, 26, 14, 51, 7),
  fetchedAtMs: Date.UTC(2026, 2, 26, 14, 51, 8),
  taCityId: null,
  citiesDetail: [
    { name: 'Even Menachem', lat: 33.07, lon: 35.27, zone: 'Confrontation Line', countdown: 90 },
    { name: 'Shtula', lat: 33.09, lon: 35.32, zone: 'Confrontation Line', countdown: 90 },
    { name: 'Zarit', lat: 33.1, lon: 35.35, zone: 'Confrontation Line', countdown: 90 },
  ],
}

const singleCityAlert: RocketAlert = {
  ...groupedAlert,
  id: 'alert-2',
  englishName: 'Malkia',
  areaNameEn: 'Upper Galilee',
  occurredAtMs: Date.UTC(2026, 2, 26, 14, 50, 0),
  citiesDetail: [{ name: 'Malkia', lat: 33.11, lon: 35.41, zone: 'Upper Galilee', countdown: 90 }],
}

const earlyWarningMessage: TzevaadomSystemMessage = {
  id: 31,
  type: 'early_warning',
  time: '17:49:30',
  titleEn: 'Home Front Command - Early Warning',
  titleHe: '',
  bodyEn: 'Possible hostile aircraft activity.',
  bodyHe: '',
  bodyAr: '',
  receivedAtMs: Date.UTC(2026, 2, 26, 14, 49, 30),
  citiesEnriched: [
    {
      en: 'Nahariya',
      he: '',
      lat: 33.005,
      lng: 35.095,
      zone_en: 'Western Galilee',
      countdown: 0,
    },
  ],
}

const items: DrawerCardItem[] = [
  {
    key: `alert:${groupedAlert.id}`,
    kind: 'alert',
    timestampMs: groupedAlert.occurredAtMs,
    isLive: true,
    alert: groupedAlert,
  },
  {
    key: `alert:${singleCityAlert.id}`,
    kind: 'alert',
    timestampMs: singleCityAlert.occurredAtMs,
    isLive: false,
    alert: singleCityAlert,
  },
  {
    key: 'system:31:early_warning:1774536570000',
    kind: 'system',
    timestampMs: earlyWarningMessage.receivedAtMs,
    isLive: false,
    message: earlyWarningMessage,
  },
]

describe('AlertDrawer', () => {
  it('selects and expands the newest card by default', () => {
    render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={items}
        onFocusCity={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleCollapsed={vi.fn()}
        selectedKey={null}
      />,
    )

    expect(screen.getByText('Son 24 Saat')).toBeInTheDocument()
    expect(screen.getAllByText('Confrontation Line').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Even Menachem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shtula' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Malkia' }).length).toBeGreaterThan(0)
  })

  it('selects another card when clicked and supports collapsed handle', async () => {
    const user = userEvent.setup()
    const onSelectItem = vi.fn()
    const onToggleCollapsed = vi.fn()

    const { container, rerender } = render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated
        items={items}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={onToggleCollapsed}
        selectedKey={null}
      />,
    )

    const cardButtons = container.querySelectorAll('.alert-drawer-timeline-card')
    expect(cardButtons[1]).toBeTruthy()
    await user.click(cardButtons[1] as HTMLElement)
    expect(onSelectItem).toHaveBeenCalledWith(`alert:${singleCityAlert.id}`)

    rerender(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated
        items={items}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={onToggleCollapsed}
        selectedKey={`alert:${singleCityAlert.id}`}
      />,
    )

    expect(screen.getByText('Son 24 Saat (kismi)')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Malkia' }).length).toBeGreaterThan(0)

    rerender(
      <AlertDrawer
        collapsed
        enabled
        historyTruncated={false}
        items={items}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={onToggleCollapsed}
        selectedKey={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: "Alarm drawer'ini ac" }))
    expect(onToggleCollapsed).toHaveBeenCalled()
  })
})
