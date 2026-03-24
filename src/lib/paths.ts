const rawBaseUrl =
  (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'

export const appBasePath =
  rawBaseUrl === '/' ? '' : rawBaseUrl.replace(/\/$/, '')

export const routerBaseName = appBasePath || '/'

export function withBasePath(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${appBasePath}${normalizedPath}` || normalizedPath
}
