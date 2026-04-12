import { Component, type PropsWithChildren, type ReactNode } from 'react'

import { createLogger } from '@/lib/logger'
import { withBasePath } from '@/lib/paths'

const log = createLogger('HungaryErrorBoundary')

type HungaryErrorBoundaryState = {
  hasError: boolean
  message: string | null
}

export class HungaryErrorBoundary extends Component<
  PropsWithChildren,
  HungaryErrorBoundaryState
> {
  state: HungaryErrorBoundaryState = {
    hasError: false,
    message: null,
  }

  static getDerivedStateFromError(error: Error): HungaryErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  componentDidCatch(error: Error) {
    log.error('Hungary module boundary caught an error', {
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
      <main className="hungary-page">
        <section className="hungary-page-shell">
          <div className="hungary-panel hungary-error-panel">
            <p className="hungary-panel-kicker">Hungary module</p>
            <h1>Secim gecesi panosu yeniden yuklenmeli.</h1>
            <p className="hungary-panel-text">
              {this.state.message ?? 'Modul beklenmeyen bir hatayla karsilasti.'}
            </p>
            <div className="hungary-error-actions">
              <button className="hungary-chip-button hungary-chip-button--solid" onClick={() => window.location.reload()} type="button">
                Sayfayi yenile
              </button>
              <a className="hungary-chip-button" href={withBasePath('/app')}>
                Huba don
              </a>
            </div>
          </div>
        </section>
      </main>
    )
  }
}
