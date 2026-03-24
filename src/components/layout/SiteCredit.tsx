import { cn } from '@/lib/utils'

type SiteCreditProps = {
  className?: string
}

export function SiteCredit({ className }: SiteCreditProps) {
  return (
    <footer className={cn('site-credit', className)}>
      <span>GeoPulse, digaxie tarafından geliştirildi.</span>
      <a
        className="site-credit-link"
        href="https://github.com/digaxie"
        rel="noreferrer"
        target="_blank"
      >
        github.com/digaxie
      </a>
    </footer>
  )
}
