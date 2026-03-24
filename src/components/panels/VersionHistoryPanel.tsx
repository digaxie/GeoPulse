import type { ScenarioSnapshotRecord } from '@/lib/backend/types'
import { formatRelativeDate } from '@/lib/utils'

type VersionHistoryPanelProps = {
  snapshots: ScenarioSnapshotRecord[]
  isLoading: boolean
  error: string | null
  canEdit: boolean
  busySnapshotId?: string | null
  onCreateSnapshot: () => Promise<void> | void
  onRestoreSnapshot: (snapshotId: string) => Promise<void> | void
}

export function VersionHistoryPanel({
  snapshots,
  isLoading,
  error,
  canEdit,
  busySnapshotId = null,
  onCreateSnapshot,
  onRestoreSnapshot,
}: VersionHistoryPanelProps) {
  return (
    <div className="version-panel">
      <div className="version-panel-header">
        <div>
          <p className="eyebrow">Geçmiş</p>
          <h3>Kayıt Noktaları</h3>
        </div>
        <button
          className="primary-button"
          disabled={!canEdit || isLoading || busySnapshotId !== null}
          onClick={() => void onCreateSnapshot()}
          type="button"
        >
          Kayıt Oluştur
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? <p className="panel-empty">Anlık görüntüler yükleniyor...</p> : null}

      {!isLoading && snapshots.length === 0 ? (
        <p className="panel-empty">Henüz kaydedilmiş bir kayıt noktası yok.</p>
      ) : null}

      {!isLoading ? (
        <div className="version-list">
          {snapshots.map((snapshot) => {
            const isBusy = busySnapshotId === snapshot.id
            return (
              <article className="version-item" key={snapshot.id}>
                <div>
                  <p className="version-item-title">Revizyon {snapshot.revision}</p>
                  <p className="panel-empty">{formatRelativeDate(snapshot.createdAt)}</p>
                </div>
                <button
                  className="secondary-button"
                  disabled={!canEdit || busySnapshotId !== null}
                  onClick={() => void onRestoreSnapshot(snapshot.id)}
                  type="button"
                >
                  {isBusy ? 'Yükleniyor...' : 'Geri Yükle'}
                </button>
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
