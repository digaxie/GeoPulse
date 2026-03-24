import { backendClient } from '@/lib/backend'
import { cn } from '@/lib/utils'

type ModeBadgeProps = {
  className?: string
}

export function ModeBadge({ className }: ModeBadgeProps) {
  return (
    <span
      className={cn(
        'mode-badge',
        backendClient.mode === 'mock' ? 'mode-badge-mock' : 'mode-badge-live',
        className,
      )}
    >
      {backendClient.mode === 'mock' ? 'Demo senkron' : 'Supabase canlı'}
    </span>
  )
}
