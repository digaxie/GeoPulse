export type HubModuleStatus = 'active' | 'coming-soon'
export type HubModuleVisibility = 'always' | 'local'
export type HubModuleEntryKind = 'internal' | 'external' | 'disabled'
export type HubModuleAccent = 'blue' | 'rose' | 'gold'

export type HubModuleDefinition = {
  id: string
  title: string
  description: string
  status: HubModuleStatus
  href: string | null
  ctaLabel: string
  visibleIn: HubModuleVisibility
  entryKind: HubModuleEntryKind
  accent: HubModuleAccent
  badge: string
  helperText?: string
  healthCheckUrl?: string
}

type CreateHubModulesOptions = {
  enableLocalHub: boolean
  deckLocalUrl: string
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, '')
}

function shouldUseHealthCheck(deckUrl: string, enableLocalHub: boolean) {
  if (!enableLocalHub || !deckUrl) {
    return false
  }

  try {
    const parsed = new URL(deckUrl)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

export function createHubModules({
  enableLocalHub,
  deckLocalUrl,
}: CreateHubModulesOptions): HubModuleDefinition[] {
  const normalizedDeckUrl = trimTrailingSlash(deckLocalUrl.trim())
  const healthCheckEnabled = shouldUseHealthCheck(normalizedDeckUrl, enableLocalHub)

  const modules: HubModuleDefinition[] = [
    {
      id: 'scenarios',
      title: 'Senaryolar',
      description:
        'Canli briefing, editor ve viewer akisini yonettigin senaryo kutuphanesi.',
      status: 'active',
      href: '/app/scenarios',
      ctaLabel: 'Kutuphane',
      visibleIn: 'always',
      entryKind: 'internal',
      accent: 'blue',
      badge: 'Core',
      helperText: 'Mevcut senaryo akisi aynen korunur.',
    },
    {
      id: 'deck',
      title: 'Deck',
      description:
        'X listeleri ve canli akislari izlemek icin GeoPulse Deck.',
      status: 'active',
      href: normalizedDeckUrl || null,
      ctaLabel: 'Decki ac',
      visibleIn: 'always',
      entryKind: 'external',
      accent: 'rose',
      badge: 'Deck',
      helperText: 'Deck hubdan ayrilmadan yeni sekmede acilir.',
      healthCheckUrl: healthCheckEnabled
        ? `${normalizedDeckUrl}/api/health`
        : undefined,
    },
    {
      id: 'tv',
      title: 'GeoPulse TV',
      description:
        'Tek sayfada coklu TV izleme deneyimi. Yasal ve acik erisimli public yayinlar.',
      status: 'active',
      href: '/app/tv',
      ctaLabel: 'TV Ac',
      visibleIn: 'always',
      entryKind: 'internal',
      accent: 'gold',
      badge: 'TV',
      helperText: 'M3U/IPTV kanallarini grid gorunumunde izleyin.',
    },
    {
      id: 'hungary',
      title: 'GeoPulse - Hungary',
      description:
        '12 Nisan 2026 Macaristan secimi icin resmi NVI veri akisi, 106 cevre haritasi ve canli oy takibi.',
      status: 'active',
      href: '/app/hungary',
      ctaLabel: 'Secim Gecesini Ac',
      visibleIn: 'always',
      entryKind: 'internal',
      accent: 'rose',
      badge: 'HU',
      helperText: 'Katilim ve sonuc modu config.json ile otomatik degisir.',
    },
    {
      id: 'notes',
      title: 'Intel Notes',
      description:
        'Gelecekte kisa briefing notlari ve editor disi hizli bilgi bloklari icin.',
      status: 'coming-soon',
      href: null,
      ctaLabel: 'Yakinda',
      visibleIn: 'always',
      entryKind: 'disabled',
      accent: 'gold',
      badge: 'Soon',
      helperText: 'Bu kart sistemin moduler buyume yonunu gostermek icin yer tutar.',
    },
  ]

  return modules.filter((module) => {
    if (module.visibleIn === 'always') {
      return true
    }

    return enableLocalHub && Boolean(module.href)
  })
}
