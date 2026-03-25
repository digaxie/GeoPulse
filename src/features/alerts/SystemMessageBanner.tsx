import { useEffect, useRef } from 'react'

import { DEFAULT_SCENARIO_ALERT_SETTINGS } from '@/features/alerts/types'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import type { TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'
import { useScenarioStore } from '@/features/scenario/store'

function getMessageStyle(type: string) {
  switch (type) {
    case 'alert':
      return { className: 'system-message-banner system-message-alert', icon: '\uD83D\uDEA8' }
    case 'early_warning':
      return { className: 'system-message-banner system-message-early-warning', icon: '\u26A0' }
    case 'incident_ended':
      return { className: 'system-message-banner system-message-incident-ended', icon: '\u2714' }
    default:
      return { className: 'system-message-banner system-message-unknown', icon: '\u2139' }
  }
}

function MessageItem({ message, onDismiss }: { message: TzevaadomSystemMessage; onDismiss: () => void }) {
  const { className, icon } = getMessageStyle(message.type)
  const title = message.titleEn || message.titleHe
  const body = message.bodyEn || message.bodyHe

  return (
    <div className={className}>
      <span className="system-message-icon">{icon}</span>
      <div className="system-message-content">
        <strong className="system-message-title">{title}</strong>
        <span className="system-message-body">{body}</span>
      </div>
      <button className="system-message-dismiss" onClick={onDismiss} title="Kapat">{'\u2715'}</button>
    </div>
  )
}

export function SystemMessageBanner() {
  const systemMessages = useAlertStore((s) => s.systemMessages)
  const dismissSystemMessage = useAlertStore((s) => s.dismissSystemMessage)
  const bannerAutoDismissSec = useScenarioStore(
    (s) => s.document.alerts?.bannerAutoDismissSec ?? DEFAULT_SCENARIO_ALERT_SETTINGS.bannerAutoDismissSec,
  )
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = timersRef.current
    const dismissMs = bannerAutoDismissSec * 1000

    for (const msg of systemMessages) {
      const key = `${msg.id}-${msg.type}-${msg.receivedAtMs}`
      if (timers.has(key)) continue

      const remaining = dismissMs - (Date.now() - msg.receivedAtMs)
      if (remaining <= 0) {
        dismissSystemMessage(msg.id)
        continue
      }

      const timerId = setTimeout(() => {
        timers.delete(key)
        dismissSystemMessage(msg.id)
      }, remaining)
      timers.set(key, timerId)
    }

    // Cleanup timers for messages that were manually dismissed
    for (const [key, timerId] of timers) {
      const stillExists = systemMessages.some(
        (m) => `${m.id}-${m.type}-${m.receivedAtMs}` === key,
      )
      if (!stillExists) {
        clearTimeout(timerId)
        timers.delete(key)
      }
    }

    return () => {
      for (const timerId of timers.values()) {
        clearTimeout(timerId)
      }
      timers.clear()
    }
  }, [systemMessages, bannerAutoDismissSec, dismissSystemMessage])

  if (systemMessages.length === 0) return null

  return (
    <div className="system-message-banner-container">
      {systemMessages.map((msg) => (
        <MessageItem
          key={`${msg.id}-${msg.type}-${msg.receivedAtMs}`}
          message={msg}
          onDismiss={() => dismissSystemMessage(msg.id)}
        />
      ))}
    </div>
  )
}
