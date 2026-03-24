import { Component, type PropsWithChildren, type ReactNode } from 'react'

import { createLogger } from '@/lib/logger'

const log = createLogger('MapErrorBoundary')

type MapErrorBoundaryState = {
  hasError: boolean
}

export class MapErrorBoundary extends Component<PropsWithChildren, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    log.error('Harita hatasi yakalandi', {
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
      <div className="workspace-alert">
        Harita yüklenirken bir hata oluştu.{' '}
        <button
          className="ghost-button"
          onClick={() => this.setState({ hasError: false })}
          type="button"
        >
          Tekrar dene
        </button>
      </div>
    )
  }
}
