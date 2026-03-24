import { createContext } from 'react'

import { backendClient } from '@/lib/backend'
import type { AuthSession } from '@/lib/backend/types'

export type AuthContextValue = {
  session: AuthSession | null
  isLoading: boolean
  backendMode: typeof backendClient.mode
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
