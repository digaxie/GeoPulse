const env = import.meta.env

export const appEnv = {
  supabaseUrl: env.VITE_SUPABASE_URL?.trim(),
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim(),
  hgmAtlasApiKey: env.VITE_HGM_ATLAS_API_KEY?.trim(),
  sentryDsn: env.VITE_SENTRY_DSN?.trim(),
  sentryEnv: env.VITE_SENTRY_ENV?.trim(),
  appRelease: env.VITE_APP_RELEASE?.trim(),

  enableSceneSystem: env.VITE_ENABLE_SCENES?.trim() === 'true',
  demoUsername: env.VITE_DEMO_USERNAME?.trim() ?? '',
  demoPassword: env.VITE_DEMO_PASSWORD?.trim() ?? '',
  useSupabase:
    Boolean(env.VITE_SUPABASE_URL?.trim()) &&
    Boolean(env.VITE_SUPABASE_ANON_KEY?.trim()),
  useHgmAtlas: Boolean(env.VITE_HGM_ATLAS_API_KEY?.trim()),
} as const

export type AppEnv = typeof appEnv
