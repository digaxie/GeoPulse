import type { HubModuleConfigRecord } from '@/lib/backend/types'
import { safeJsonParse } from '@/lib/utils'

const HUB_MODULE_CONFIG_CACHE_KEY = 'geopulse:hub-module-configs'

export function readCachedHubModuleConfigs(): HubModuleConfigRecord[] | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(HUB_MODULE_CONFIG_CACHE_KEY)
  if (!rawValue) {
    return null
  }

  const parsed = safeJsonParse<HubModuleConfigRecord[] | null>(rawValue, null)
  return Array.isArray(parsed) ? parsed : null
}

export function writeCachedHubModuleConfigs(configs: HubModuleConfigRecord[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(HUB_MODULE_CONFIG_CACHE_KEY, JSON.stringify(configs))
}
