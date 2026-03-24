import { createClient } from '@supabase/supabase-js'

const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-@]+$/
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+'
const ALL_PASSWORD_CHARS = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return value
}

function parseUsername() {
  const usernameFlagIndex = process.argv.findIndex((argument) => argument === '--username')
  const username = usernameFlagIndex >= 0 ? process.argv[usernameFlagIndex + 1] : ''
  if (!username) {
    throw new Error('Usage: npm run bootstrap:admin -- --username <username>')
  }

  return validateManagedUsername(username)
}

function validateManagedUsername(username: string) {
  const trimmed = username.trim()
  if (!trimmed) {
    throw new Error('Username is required.')
  }

  if (trimmed.length > 50) {
    throw new Error('Username must be 50 characters or fewer.')
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Username contains invalid characters.')
  }

  return trimmed
}

function normalizeUsername(username: string) {
  return validateManagedUsername(username).toLowerCase()
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  )
}

async function createInternalUserEmail(username: string) {
  const digest = (await sha256Hex(normalizeUsername(username))).slice(0, 24)
  return `u-${digest}@users.geopulse.invalid`
}

function randomChar(source: string) {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return source[bytes[0] % source.length]
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const swapIndex = bytes[0] % (index + 1)
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }

  return items
}

function createStrongPassword(length = 24) {
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

async function main() {
  const username = parseUsername()
  const supabase = createClient(
    readRequiredEnv('SUPABASE_URL'),
    readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const { count, error: countError } = await supabase
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (countError) {
    throw countError
  }

  if ((count ?? 0) > 0) {
    throw new Error('An admin already exists. Use the admin panel to create additional admins.')
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('user_id')
    .ilike('username', username)
    .limit(1)
    .maybeSingle()

  if (existingProfileError) {
    throw existingProfileError
  }

  if (existingProfile) {
    throw new Error('This username already exists.')
  }

  const email = await createInternalUserEmail(username)
  const password = createStrongPassword()
  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
    },
  })

  if (createUserError || !createdUser.user) {
    throw createUserError ?? new Error('Auth user could not be created.')
  }

  let cleanupRequired = true

  try {
    const { error: insertProfileError } = await supabase.from('profiles').insert({
      user_id: createdUser.user.id,
      username,
      email,
      role: 'admin',
    })

    if (insertProfileError) {
      throw insertProfileError
    }

    cleanupRequired = false
    console.log(`Username: ${username}`)
    console.log(`Password: ${password}`)
    console.log(`User ID: ${createdUser.user.id}`)
    console.log('The password is shown only in this output. Store it securely.')
  } finally {
    if (cleanupRequired) {
      await supabase.auth.admin.deleteUser(createdUser.user.id).catch((cleanupError) => {
        console.error('Cleanup failed:', cleanupError)
      })
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
