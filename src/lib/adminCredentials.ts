import type { UserRole } from '@/lib/backend/types'

const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-@]+$/
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+'
const ALL_PASSWORD_CHARS = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export function validateManagedUsername(username: string) {
  const trimmed = username.trim()

  if (!trimmed) {
    throw new Error('Kullanici adi gerekli.')
  }

  if (trimmed.length > 50) {
    throw new Error('Kullanici adi en fazla 50 karakter olabilir.')
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Kullanici adi gecersiz karakter iceriyor.')
  }

  return trimmed
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  )
}

export async function createInternalUserEmail(username: string) {
  const normalized = normalizeUsername(validateManagedUsername(username))
  const digest = (await sha256Hex(normalized)).slice(0, 24)
  return `u-${digest}@users.geopulse.invalid`
}

function randomChar(source: string) {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return source[array[0] % source.length]
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    const swapIndex = array[0] % (index + 1)
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }

  return items
}

export function createStrongPassword(length = 24) {
  const effectiveLength = Math.max(12, length)
  const characters = [
    randomChar(UPPER),
    randomChar(LOWER),
    randomChar(DIGITS),
    randomChar(SYMBOLS),
  ]

  while (characters.length < effectiveLength) {
    characters.push(randomChar(ALL_PASSWORD_CHARS))
  }

  return shuffle(characters).join('')
}

export function isAdminRole(role: UserRole) {
  return role === 'admin'
}
