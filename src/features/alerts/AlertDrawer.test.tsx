import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AlertDrawer } from '@/features/alerts/AlertDrawer'
import { buildDrawerCardViewModels, type DrawerCardItem } from '@/features/alerts/alertDrawerModel'
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
const viewItems = buildDrawerCardViewModels(items)
const groupedRocketItems = buildDrawerCardViewModels([
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
    timestampMs: groupedAlert.occurredAtMs - 30_000,
    isLive: false,
    alert: {
      ...singleCityAlert,
      occurredAtMs: groupedAlert.occurredAtMs - 30_000,
      fetchedAtMs: groupedAlert.fetchedAtMs - 30_000,
    },
  },
])

function formatExpectedDrawerClock(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestampMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'hour' | 'minute' | 'second', string>>

  return `${values.hour ?? '00'}:${values.minute ?? '00'}:${values.second ?? '00'}`
}

function formatExpectedDrawerDate(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).formatToParts(timestampMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'weekday' | 'year' | 'month' | 'day', string>>

  const weekday = values.weekday
    ? `${values.weekday.charAt(0).toLocaleUpperCase('tr-TR')}${values.weekday.slice(1)}`
    : ''

  return `${values.day ?? '0'} ${values.month ?? ''} ${values.year ?? ''} ${weekday}`.trim()
}

function createAlertItem(index: number): DrawerCardItem {
  const occurredAtMs = Date.UTC(2026, 2, 26, 15, 0, 0) - index * 61_000
  return {
    key: `alert:bulk-${index}`,
    kind: 'alert',
    timestampMs: occurredAtMs,
    isLive: index < 2,
    alert: {
      ...singleCityAlert,
      id: `bulk-${index}`,
      englishName: `City ${index}`,
      name: `City ${index}`,
      areaNameEn: `Zone ${index}`,
      occurredAtMs,
      fetchedAtMs: occurredAtMs,
      citiesDetail: [
        {
          name: `City ${index}`,
          lat: 33 + index / 1000,
          lon: 35 + index / 1000,
          zone: `Zone ${index}`,
          countdown: 90,
        },
      ],
    },
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AlertDrawer', () => {
  it('renders Turkish header clock and date', () => {
    const fixedNow = Date.UTC(2026, 2, 26, 20, 8, 39)
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)

    render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={viewItems}
        onFocusCity={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleCollapsed={vi.fn()}
        selectedKey={null}
      />,
    )

    expect(screen.getByText(formatExpectedDrawerClock(fixedNow))).toBeInTheDocument()
    expect(screen.getByText(formatExpectedDrawerDate(fixedNow))).toBeInTheDocument()
  })

  it('selects and expands the newest card by default', () => {
    render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={viewItems}
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
        items={viewItems}
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
        items={viewItems}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={onToggleCollapsed}
        selectedKey={`alert:${singleCityAlert.id}`}
      />,
    )

    expect(screen.getByText('Son 24 Saat (kısmi)')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Malkia' }).length).toBeGreaterThan(0)

    rerender(
      <AlertDrawer
        collapsed
        enabled
        historyTruncated={false}
        items={viewItems}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={onToggleCollapsed}
        selectedKey={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: "Alarm drawer'ini ac" }))
    expect(onToggleCollapsed).toHaveBeenCalled()
  })

  it('clears selection when the selected card is clicked again', async () => {
    const user = userEvent.setup()
    const onSelectItem = vi.fn()

    const { container } = render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={viewItems}
        onFocusCity={vi.fn()}
        onSelectItem={onSelectItem}
        onToggleCollapsed={vi.fn()}
        selectedKey={null}
      />,
    )

    const activeBefore = container.querySelectorAll('.alerts-card-active')
    expect(activeBefore).toHaveLength(1)

    const activeCard = container.querySelector('.alerts-card-active')
    expect(activeCard).toBeTruthy()
    await user.click(activeCard as HTMLElement)

    expect(onSelectItem).toHaveBeenCalledWith(null)
    expect(container.querySelectorAll('.alerts-card-active')).toHaveLength(0)
  })

  it('renders 60 cards initially, loads more, and keeps selected card visible', async () => {
    const user = userEvent.setup()
    const bulkItems = buildDrawerCardViewModels(Array.from({ length: 70 }, (_, index) => createAlertItem(index)))
    const selectedKey = bulkItems[64]!.key

    const { container } = render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={bulkItems}
        onFocusCity={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleCollapsed={vi.fn()}
        selectedKey={selectedKey}
      />,
    )

    expect(container.querySelectorAll('.alert-drawer-timeline-card')).toHaveLength(65)
    expect(screen.getByRole('button', { name: '60 daha yukle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alarm olayi: Zone 64' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '60 daha yukle' }))
    expect(container.querySelectorAll('.alert-drawer-timeline-card')).toHaveLength(70)
  }, 15000)

  it('filters items with debounced full-text search and shows empty state when no result matches', async () => {
    render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={viewItems}
        onFocusCity={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleCollapsed={vi.fn()}
        selectedKey={`alert:${groupedAlert.id}`}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Alarm olaylarını ara' })

    fireEvent.change(input, { target: { value: 'nahariya' } })
    await new Promise((resolve) => window.setTimeout(resolve, 250))

    expect(screen.getByRole('button', { name: 'Alarm olayi: Home Front Command - Early Warning' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nahariya' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alarm olayi: Confrontation Line' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'zzzzz' } })
    await new Promise((resolve) => window.setTimeout(resolve, 250))

    expect(screen.getByText('Arama ile eşleşen olay bulunamadı.')).toBeInTheDocument()
  }, 15000)

  it('renders grouped cards and expands group members newest-first', () => {
    render(
      <AlertDrawer
        collapsed={false}
        enabled
        historyTruncated={false}
        items={groupedRocketItems}
        onFocusCity={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleCollapsed={vi.fn()}
        selectedKey={groupedRocketItems[0]?.key ?? null}
      />,
    )

    expect(screen.getByRole('button', { name: /Alarm olayi:/i })).toBeInTheDocument()
    expect(screen.getByText(/2 olay/i)).toBeInTheDocument()

    expect(screen.getAllByText('Confrontation Line').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Upper Galilee').length).toBeGreaterThan(0)
  })
})
