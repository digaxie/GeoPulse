import { useEffect, useRef, useState } from 'react'

import { backendClient } from '@/lib/backend'
import { withBasePath } from '@/lib/paths'
import { copyText } from '@/lib/utils'

type SharePanelProps = {
  scenarioId: string | null
  viewerSlug: string | null
  canEdit: boolean
  onRotateViewerSlug: () => Promise<void>
}

export function SharePanel({
  scenarioId,
  viewerSlug,
  canEdit,
  onRotateViewerSlug,
}: SharePanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const viewerPath = viewerSlug ? withBasePath(`/view/${viewerSlug}`) : null
  const viewerUrl =
    viewerPath && typeof window !== 'undefined'
      ? new URL(viewerPath, window.location.origin).toString()
      : viewerPath

  async function handleCopyViewerLink() {
    if (!viewerUrl) {
      return
    }

    try {
      await copyText(viewerUrl)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    } finally {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Sunum</p>
          <h3>Sunum baglantisi</h3>
        </div>
      </div>

      <div className="share-box">
        <p className="share-box-label">Viewer baglantisi</p>
        <a
          className="inline-link"
          href={viewerUrl ?? '#'}
          rel="noreferrer"
          target="_blank"
        >
          {viewerUrl ?? 'Baglanti hazir degil'}
        </a>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={!viewerUrl}
            onClick={() => void handleCopyViewerLink()}
            type="button"
          >
            Baglantiyi kopyala
          </button>
          <button
            className="secondary-button"
            disabled={!canEdit || !scenarioId}
            onClick={() => void onRotateViewerSlug()}
            type="button"
          >
            Sunum baglantisini yenile
          </button>
        </div>
        {copyState === 'copied' ? (
          <p className="share-box-note">Sunum baglantisi panoya kopyalandi.</p>
        ) : null}
        {copyState === 'error' ? (
          <p className="share-box-note">Baglanti kopyalanamadi.</p>
        ) : null}
        {backendClient.mode === 'mock' ? (
          <p className="share-box-note">
            Mock modda ayni cihazdaki sekmeler arasi canli guncelleme aciktir.
          </p>
        ) : null}
      </div>
    </section>
  )
}
