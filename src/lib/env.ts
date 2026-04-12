const env = import.meta.env

/** Strip BOM, carriage returns, and whitespace that can leak from env vars. */
function clean(value: string | undefined): string | undefined {
  return value
    ?.replace(/^[\uFEFF]+/u, '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim()
}

export const appEnv = {
  supabaseUrl: clean(env.VITE_SUPABASE_URL),
  supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
  hgmAtlasApiKey: clean(env.VITE_HGM_ATLAS_API_KEY),
  sentryDsn: clean(env.VITE_SENTRY_DSN),
  sentryEnv: clean(env.VITE_SENTRY_ENV),
  appRelease: clean(env.VITE_APP_RELEASE),

  enableSceneSystem: clean(env.VITE_ENABLE_SCENES) === 'true',
  demoUsername: clean(env.VITE_DEMO_USERNAME) ?? '',
  demoPassword: clean(env.VITE_DEMO_PASSWORD) ?? '',
  useSupabase:
    Boolean(clean(env.VITE_SUPABASE_URL)) &&
    Boolean(clean(env.VITE_SUPABASE_ANON_KEY)),
  useHgmAtlas: Boolean(clean(env.VITE_HGM_ATLAS_API_KEY)),
  tzevaadomRelayUrl: clean(env.VITE_TZEVAADOM_RELAY_URL),
  enableLocalHub: clean(env.VITE_ENABLE_LOCAL_HUB) === 'true',
  deckLocalUrl: clean(env.VITE_DECK_LOCAL_URL) || 'http://127.0.0.1:3211',
} as const

export type AppEnv = typeof appEnv
