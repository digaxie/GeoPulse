import {
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import { AuthContext, type AuthContextValue } from '@/features/auth/authContext'
import { backendClient } from '@/lib/backend'
import type { AuthSession } from '@/lib/backend/types'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const nextSession = await backendClient.getSession()
        if (!cancelled) {
          setSession(nextSession)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void init()
    const unsubscribe = backendClient.onSessionChange((nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      backendMode: backendClient.mode,
      async login(username, password) {
        const nextSession = await backendClient.login(username, password)
        setSession(nextSession)
        setIsLoading(false)
      },
      async logout() {
        await backendClient.logout()
        setSession(null)
        setIsLoading(false)
      },
    }),
    [isLoading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
