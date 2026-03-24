import * as Sentry from '@sentry/react'

import { appEnv } from '@/lib/env'

type SentryContext = Record<string, unknown>
type ScopeLike = {
  setTag: (key: string, value: string) => void
  setExtra: (key: string, value: unknown) => void
}

let sentryInitialized = false

function withScopeContext(scope: ScopeLike, context: SentryContext) {
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) {
      continue
    }

    if (key === 'component' || key === 'action') {
      scope.setTag(key, String(value))
      continue
    }

    if (key === 'error' && value instanceof Error) {
      continue
    }

    scope.setExtra(key, value)
  }
}

export function initSentry() {
  if (sentryInitialized || !appEnv.sentryDsn || typeof window === 'undefined') {
    return
  }

  Sentry.init({
    dsn: appEnv.sentryDsn,
    environment: appEnv.sentryEnv || import.meta.env.MODE,
    release: appEnv.appRelease || undefined,
    enabled: import.meta.env.PROD,
    sendDefaultPii: false,
    integrations: [],
  })

  sentryInitialized = true
}

export function captureSentryLog(
  level: 'warn' | 'error',
  message: string,
  context: SentryContext,
) {
  if (!appEnv.sentryDsn || !import.meta.env.PROD) {
    return
  }

  Sentry.withScope((scope) => {
    withScopeContext(scope, context)

    const error = context.error
    if (error instanceof Error) {
      Sentry.captureException(error)
      return
    }

    Sentry.captureMessage(message, level === 'warn' ? 'warning' : 'error')
  })
}
