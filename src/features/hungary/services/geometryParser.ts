import type { HungaryGeometryRecord } from '../types'

export type HungarySvgGeometryFeature = {
  id: string
  path: string
}

export type HungarySvgGeometryBundle = {
  version: string
  width: number
  height: number
  features: HungarySvgGeometryFeature[]
}

type GeometryWorkerPayload = {
  version: string
  records: HungaryGeometryRecord[]
}

const memoryCache = new Map<string, HungarySvgGeometryBundle>()
const STORAGE_KEY_PREFIX = 'hungary-svg-geometry:'

function createAbortError() {
  return new DOMException('Geometry preparation aborted', 'AbortError')
}

function isGeometryBundle(value: unknown): value is HungarySvgGeometryBundle {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.version === 'string'
    && typeof candidate.width === 'number'
    && typeof candidate.height === 'number'
    && Array.isArray(candidate.features)
  )
}

function readStoredBundle(version: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${version}`)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown

    if (!isGeometryBundle(parsed)) {
      window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${version}`)
      return null
    }

    memoryCache.set(version, parsed)
    return parsed
  } catch {
    return null
  }
}

function storeBundle(bundle: HungarySvgGeometryBundle) {
  memoryCache.set(bundle.version, bundle)

  if (typeof window === 'undefined') {
    return bundle
  }

  try {
    window.sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${bundle.version}`, JSON.stringify(bundle))
  } catch {
    // Ignore quota / privacy mode failures; memory cache still helps this session.
  }

  return bundle
}

export function getCachedHungarySvgGeometry(version: string) {
  return memoryCache.get(version) ?? readStoredBundle(version)
}

export async function prepareHungarySvgGeometry(
  version: string,
  records: HungaryGeometryRecord[],
  options: { signal?: AbortSignal } = {},
): Promise<HungarySvgGeometryBundle> {
  if (options.signal?.aborted) {
    throw createAbortError()
  }

  const cached = getCachedHungarySvgGeometry(version)

  if (cached) {
    return cached
  }

  if (typeof Worker === 'undefined') {
    throw new Error('Web Worker destegi bu tarayicida kullanilamiyor.')
  }

  return await new Promise<HungarySvgGeometryBundle>((resolve, reject) => {
    const worker = new Worker(new URL('./geometryWorker.ts', import.meta.url), { type: 'module' })

    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      options.signal?.removeEventListener('abort', abortHandler)
      worker.terminate()
    }

    const abortHandler = () => {
      cleanup()
      reject(createAbortError())
    }

    worker.onmessage = (event: MessageEvent<HungarySvgGeometryBundle>) => {
      cleanup()

      if (!isGeometryBundle(event.data)) {
        reject(new Error('Hungary geometry worker invalid response produced.'))
        return
      }

      resolve(storeBundle(event.data))
    }

    worker.onerror = () => {
      cleanup()
      reject(new Error('Hungary geometry worker failed.'))
    }

    options.signal?.addEventListener('abort', abortHandler, { once: true })

    const payload: GeometryWorkerPayload = {
      version,
      records,
    }

    worker.postMessage(payload)
  })
}
