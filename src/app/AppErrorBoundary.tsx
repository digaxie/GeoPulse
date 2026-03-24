import { Component, type PropsWithChildren, type ReactNode } from 'react'

import { createLogger } from '@/lib/logger'

const log = createLogger('AppErrorBoundary')

type AppErrorBoundaryState = {
  hasError: boolean
  message: string | null
}

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  componentDidCatch(error: Error) {
    log.error('Uygulama hatasi yakalandi', {
      action: 'componentDidCatch',
      error,
      errorMessage: error.message,
      stack: error.stack,
    })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="shell-fallback">
        <section className="shell-fallback-card error-card">
          <p className="eyebrow">Beklenmeyen Hata</p>
          <h1>Uygulama yeniden yüklenmeli.</h1>
          <p className="lede">
            {this.state.message ?? 'Arayüz bir hatayla karşılaştı. Sayfayı yenileyip tekrar deneyin.'}
          </p>
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            Sayfayı yenile
          </button>
        </section>
      </main>
    )
  }
}
