import type {
  HubModuleConfigRecord,
  HubModuleControlState,
  UpdateHubModuleConfigInput,
} from '@/lib/backend/types'

export type HubModuleStatus = 'active' | 'coming-soon' | 'inactive'
export type HubModuleVisibility = 'always' | 'local'
export type HubModuleEntryKind = 'internal' | 'external' | 'disabled'
export type HubModuleAccent = 'blue' | 'rose' | 'gold'

type HubModuleSeedDefinition = {
  id: string
  title: string
  description?: string
  status: 'active' | 'coming-soon'
  href: string | null
  ctaLabel: string
  secondaryCtaLabel?: string
  visibleIn: HubModuleVisibility
  entryKind: HubModuleEntryKind
  accent: HubModuleAccent
  badge: string
  helperText?: string
  warningText?: string
  healthCheckUrl?: string
  defaultControlState?: HubModuleControlState
}

export type HubModuleDefinition = Omit<HubModuleSeedDefinition, 'status' | 'visibleIn'> & {
  controlState: HubModuleControlState
  status: HubModuleStatus
  statusLabel: string
}

type CreateHubModulesOptions = {
  enableLocalHub: boolean
  deckLocalUrl: string
  configs?: HubModuleConfigRecord[]
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

function normalizeRequiredText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function normalizeOptionalText(value: string | undefined, fallback = '') {
  if (value === undefined) {
    return fallback
  }

  return value.trim()
}

function getDefaultControlState(module: HubModuleSeedDefinition): HubModuleControlState {
  return module.defaultControlState ?? (module.entryKind === 'disabled' ? 'disabled' : 'enabled')
}

function getDefaultStatusLabel(
  module: HubModuleSeedDefinition,
  controlState: HubModuleControlState,
) {
  if (controlState === 'disabled' && module.entryKind !== 'disabled') {
    return 'Pasif'
  }

  return module.status === 'active' ? 'Aktif' : 'Beklemede'
}

function getDisplayStatus(
  module: HubModuleSeedDefinition,
  controlState: HubModuleControlState,
): HubModuleStatus {
  if (controlState === 'disabled' && module.entryKind !== 'disabled') {
    return 'inactive'
  }

  return module.status
}

function createBaseHubModules({
  enableLocalHub,
  deckLocalUrl,
}: Omit<CreateHubModulesOptions, 'configs'>): HubModuleSeedDefinition[] {
  const normalizedDeckUrl = trimTrailingSlash(deckLocalUrl.trim())
  const healthCheckEnabled = shouldUseHealthCheck(normalizedDeckUrl, enableLocalHub)

  const modules: HubModuleSeedDefinition[] = [
    {
      id: 'scenarios',
      title: 'Senaryolar',
      description: 'Canli briefing, editor ve viewer akislarini yonettigin senaryo kutuphanesi.',
      status: 'active',
      href: '/app/scenarios',
      ctaLabel: 'Kutuphane',
      secondaryCtaLabel: '+ Yeni senaryo',
      visibleIn: 'always',
      entryKind: 'internal',
      accent: 'blue',
      badge: 'Core',
      helperText: 'Mevcut senaryo akisi aynen korunur.',
    },
    {
      id: 'deck',
      title: 'Deck',
      description: 'X listeleri ve canli akislari izlemek icin GeoPulse Deck.',
      status: 'active',
      href: normalizedDeckUrl || null,
      ctaLabel: 'Decki ac',
      visibleIn: 'always',
      entryKind: 'external',
      accent: 'rose',
      badge: 'Deck',
      helperText: 'Deck hubdan ayrilmadan yeni sekmede acilir.',
      warningText: 'Test asamasindadir',
      healthCheckUrl: healthCheckEnabled ? `${normalizedDeckUrl}/api/health` : undefined,
    },
    {
      id: 'tv',
      title: 'GeoPulse TV',
      description: 'Tek sayfada coklu TV izleme deneyimi. Yasal ve acik erisimli public yayinlar.',
      status: 'active',
      href: '/app/tv',
      ctaLabel: 'TV Ac',
      visibleIn: 'always',
      entryKind: 'internal',
      accent: 'gold',
      badge: 'TV',
      helperText: 'M3U/IPTV kanallarini grid gorunumunde izleyin.',
      warningText: 'Test asamasindadir',
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
      accent: 'gold',
      badge: 'HU',
      helperText: 'Katilim ve sonuc modu config.json ile otomatik degisir.',
      warningText: 'Resmi NVI/VTR verisi',
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
      defaultControlState: 'disabled',
    },
  ]

  return modules.filter((module) => {
    if (module.visibleIn === 'always') {
      return true
    }

    return enableLocalHub && Boolean(module.href)
  })
}

export function createDefaultHubModuleConfigs({
  enableLocalHub,
  deckLocalUrl,
}: Omit<CreateHubModulesOptions, 'configs'>): UpdateHubModuleConfigInput[] {
  return createBaseHubModules({ enableLocalHub, deckLocalUrl }).map((module) => {
    const controlState = getDefaultControlState(module)

    return {
      id: module.id,
      controlState,
      title: module.title,
      description: module.description ?? '',
      ctaLabel: module.ctaLabel,
      secondaryCtaLabel: module.secondaryCtaLabel ?? '',
      badge: module.badge,
      helperText: module.helperText ?? '',
      warningText: module.warningText ?? '',
      statusLabel: getDefaultStatusLabel(module, controlState),
    }
  })
}

export function createHubModules({
  enableLocalHub,
  deckLocalUrl,
  configs = [],
}: CreateHubModulesOptions): HubModuleDefinition[] {
  const baseModules = createBaseHubModules({ enableLocalHub, deckLocalUrl })
  const configMap = new Map(configs.map((config) => [config.id, config]))

  return baseModules.flatMap((module) => {
    const config = configMap.get(module.id)
    const controlState = config?.controlState ?? getDefaultControlState(module)

    if (controlState === 'hidden') {
      return []
    }

    return [
      {
        id: module.id,
        title: normalizeRequiredText(config?.title, module.title),
        description: normalizeOptionalText(config?.description, module.description ?? ''),
        status: getDisplayStatus(module, controlState),
        statusLabel: normalizeRequiredText(
          config?.statusLabel,
          getDefaultStatusLabel(module, controlState),
        ),
        href: module.href,
        ctaLabel: normalizeRequiredText(config?.ctaLabel, module.ctaLabel),
        secondaryCtaLabel: normalizeOptionalText(
          config?.secondaryCtaLabel,
          module.secondaryCtaLabel ?? '',
        ),
        entryKind: controlState === 'disabled' ? 'disabled' : module.entryKind,
        controlState,
        accent: module.accent,
        badge: normalizeOptionalText(config?.badge, module.badge),
        helperText: normalizeOptionalText(config?.helperText, module.helperText ?? ''),
        warningText: normalizeOptionalText(config?.warningText, module.warningText ?? ''),
        healthCheckUrl: module.healthCheckUrl,
      },
    ]
  })
}
