import { appEnv } from '@/lib/env'
import { mockBackend } from '@/lib/backend/mockBackend'
import { getSupabaseAccessToken, supabaseBackend } from '@/lib/backend/supabaseBackend'

export const backendClient = appEnv.useSupabase ? supabaseBackend : mockBackend

export async function getDeckLaunchAccessToken() {
  if (!appEnv.useSupabase) {
    return null
  }

  return getSupabaseAccessToken()
}
