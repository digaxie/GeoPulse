import { clsx, type ClassValue } from 'clsx'

import { logger } from '@/lib/logger'

const imageDimensionsCache = new Map<string, Promise<{ width: number; height: number }>>()

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function createViewerSlug() {
  return Math.random().toString(36).slice(2, 10)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function formatRelativeDate(isoString: string) {
  const date = new Date(isoString)
  const diff = date.getTime() - Date.now()
  const absMs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

  if (absMs < 60_000) {
    return 'az once'
  }

  if (absMs < 3_600_000) {
    return rtf.format(Math.round(diff / 60_000), 'minute')
  }

  if (absMs < 86_400_000) {
    return rtf.format(Math.round(diff / 3_600_000), 'hour')
  }

  return rtf.format(Math.round(diff / 86_400_000), 'day')
}

export function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function downloadTextFile(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function readTextFile(file: File) {
  return file.text()
}

export function slugifyFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'senaryo'
}

export async function readImageDimensions(src: string) {
  if (!src) {
    return { width: 100, height: 100 }
  }

  const cached = imageDimensionsCache.get(src)
  if (cached) {
    return cached
  }

  const nextPromise = new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: Math.max(1, image.naturalWidth || image.width || 100),
        height: Math.max(1, image.naturalHeight || image.height || 100),
      })
    }

    image.onerror = () => {
      logger.warn('Gorsel yuklenemedi', { component: 'utils', action: 'readImageDimensions', src })
      resolve({ width: 100, height: 100 })
    }

    image.src = src
  })

  imageDimensionsCache.set(src, nextPromise)
  return nextPromise
}

export async function readFileImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    return await readImageDimensions(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
