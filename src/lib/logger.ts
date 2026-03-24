import { captureSentryLog } from '@/lib/sentry'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogContext = {
  component?: string
  action?: string
  report?: boolean
  error?: unknown
  [key: string]: unknown
}

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LOG_STYLES: Record<LogLevel, string> = {
  debug: 'color:#6b87a8',
  info: 'color:#1a6ef5',
  warn: 'color:#e89200',
  error: 'color:#e02d5a;font-weight:bold',
}

const isDev = import.meta.env.DEV
const minLevel: LogLevel = isDev ? 'debug' : 'warn'

export function shouldEmitLog(level: LogLevel, minimumLevel: LogLevel = minLevel) {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[minimumLevel]
}

export function shouldForwardToSentry(
  level: LogLevel,
  context: LogContext,
  devMode = isDev,
) {
  return !devMode && (level === 'error' || (level === 'warn' && context.report === true))
}

function emit(level: LogLevel, message: string, context: LogContext) {
  if (!shouldEmitLog(level)) return

  if (shouldForwardToSentry(level, context)) {
    captureSentryLog(level === 'error' ? 'error' : 'warn', message, context)
  }

  const time = new Date().toISOString().slice(11, 19)
  const prefix = `[${level.toUpperCase()}]`
  const scope = context.component
    ? ` (${context.component}${context.action ? ':' + context.action : ''})`
    : ''

  const method =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

  if (isDev) {
    const hasExtra = Object.keys(context).some((k) => k !== 'component' && k !== 'action')
    method(
      `%c${prefix}%c ${time}${scope} ${message}`,
      LOG_STYLES[level],
      'color:inherit',
      ...(hasExtra ? [context] : []),
    )
  } else {
    method(JSON.stringify({ level, time, message, ...context }))
  }
}

function makeLevel(level: LogLevel) {
  return (message: string, context: LogContext = {}) => emit(level, message, context)
}

export const logger = {
  debug: makeLevel('debug'),
  info: makeLevel('info'),
  warn: makeLevel('warn'),
  error: makeLevel('error'),
}

export function createLogger(component: string) {
  return {
    debug: (msg: string, ctx: LogContext = {}) => logger.debug(msg, { ...ctx, component }),
    info: (msg: string, ctx: LogContext = {}) => logger.info(msg, { ...ctx, component }),
    warn: (msg: string, ctx: LogContext = {}) => logger.warn(msg, { ...ctx, component }),
    error: (msg: string, ctx: LogContext = {}) => logger.error(msg, { ...ctx, component }),
  }
}
