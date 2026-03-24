import { appEnv } from '@/lib/env'
import { mockBackend } from '@/lib/backend/mockBackend'
import { supabaseBackend } from '@/lib/backend/supabaseBackend'

export const backendClient = appEnv.useSupabase ? supabaseBackend : mockBackend