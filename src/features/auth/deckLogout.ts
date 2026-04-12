import { appEnv } from '@/lib/env'

function buildDeckLogoutUrl(baseUrl: string) {
  const target = new URL('/auth/logout', baseUrl)
  target.searchParams.set('popup', '1')
  return target.toString()
}

export function beginDeckLogout(): Window | null {
  if (!appEnv.enableLocalHub) {
    return null
  }

  const baseUrl = appEnv.deckLocalUrl.trim()
  if (!baseUrl) {
    return null
  }

  let popup: Window | null = null

  try {
    popup = window.open('', '_blank', 'popup,width=520,height=640')
    if (!popup) {
      return null
    }

    popup.location.replace(buildDeckLogoutUrl(baseUrl))
    return popup
  } catch {
    popup?.close()
    return null
  }
}
