import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import type { AssetDefinition, AssetKind } from '@/lib/backend/types'

type AssetFilter = AssetKind
type SymbolFamily = 'all' | 'general' | 'nato'

type AssetLibraryPanelProps = {
  assets: AssetDefinition[]
  activeAssetId: string | null
  canEdit: boolean
  isLoading: boolean
  error: string | null
  requestedFilter?: AssetFilter | null
  onPickAsset: (assetId: string) => void
  onDropAsset: (input: { assetId: string; clientX: number; clientY: number }) => void
  onUploadAsset: (input: {
    file: File
    kind: AssetKind
    label: string
    tags: string[]
  }) => Promise<void>
}

const FALLBACK_ICON = "/seed-assets/general/custom-pin.svg"

const filters: Array<{ value: AssetFilter; label: string }> = [
  { value: 'flag', label: 'Bayrak' },
  { value: 'air', label: 'Hava' },
  { value: 'ground', label: 'Kara' },
  { value: 'sea', label: 'Deniz' },
  { value: 'explosion', label: 'Patlama' },
  { value: 'danger', label: 'Tehlike' },
  { value: 'custom', label: 'Özel' },
]

const symbolFamilies: Array<{ value: SymbolFamily; label: string }> = [
  { value: 'general', label: 'Genel' },
  { value: 'nato', label: 'NATO' },
  { value: 'all', label: 'Tümü' },
]

type FlagRegion = 'europe' | 'asia' | 'middle_east' | 'africa' | 'north' | 'south' | 'oceania'

const flagRegions: Array<{ value: FlagRegion; label: string; tag: string }> = [
  { value: 'europe', label: 'Avrupa', tag: 'europe' },
  { value: 'middle_east', label: 'Ortadoğu', tag: 'middle_east' },
  { value: 'asia', label: 'Asya', tag: 'asia' },
  { value: 'africa', label: 'Afrika', tag: 'africa' },
  { value: 'north', label: 'K. Amerika', tag: 'north' },
  { value: 'south', label: 'G. Amerika', tag: 'south' },
  { value: 'oceania', label: 'Okyanusya', tag: 'oceania' },
]

type FlagAlphaGroup = 'all' | string

const flagAlphaGroups: Array<{ value: FlagAlphaGroup; label: string; letters: string[] }> = [
  { value: 'all', label: 'Tüm', letters: [] },
  { value: 'A-B', label: 'A-B', letters: ['A', 'B'] },
  { value: 'C-E', label: 'C-E', letters: ['C', 'Ç', 'D', 'E'] },
  { value: 'F-H', label: 'F-H', letters: ['F', 'G', 'H'] },
  { value: 'I-K', label: 'I-K', letters: ['I', 'İ', 'J', 'K'] },
  { value: 'L-N', label: 'L-N', letters: ['L', 'M', 'N'] },
  { value: 'O-R', label: 'O-R', letters: ['O', 'Ö', 'P', 'R'] },
  { value: 'S-T', label: 'S-T', letters: ['S', 'Ş', 'T'] },
  { value: 'U-Z', label: 'U-Z', letters: ['U', 'Ü', 'V', 'W', 'Y', 'Z'] },
]

function safeImage(src?: string | null) {
  if (!src) return FALLBACK_ICON
  return src
}

function isNatoAsset(asset: AssetDefinition) {
  return asset.tags?.includes('nato') || asset.storagePath?.includes('/nato/')
}

function isGeneralAsset(asset: AssetDefinition) {
  if (asset.sourceType === 'upload') return true
  return asset.tags?.includes('general') || asset.storagePath?.includes('/general/')
}

export function AssetLibraryPanel({
  assets,
  activeAssetId,
  canEdit,
  isLoading,
  error,
  requestedFilter,
  onPickAsset,
  onDropAsset,
  onUploadAsset,
}: AssetLibraryPanelProps) {

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetFilter>('flag')
  const [symbolFamily, setSymbolFamily] = useState<SymbolFamily>('general')
  const [flagAlphaGroup, setFlagAlphaGroup] = useState<FlagAlphaGroup>('all')
  const [activeRegions, setActiveRegions] = useState<Set<FlagRegion>>(new Set())
  const [label, setLabel] = useState('')
  const [tags, setTags] = useState('')
  const [kind, setKind] = useState<AssetKind>('custom')
  const [submitting, setSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const deferredQuery = useDeferredValue(query)

  const dragRef = useRef<{ asset: AssetDefinition; startX: number; startY: number; dragging?: boolean } | null>(null)
  const ghostRef = useRef<HTMLImageElement | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  function removeGhost() {
    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
  }

  useEffect(() => {
    if (requestedFilter) {
      setFilter(requestedFilter)
      if (requestedFilter !== 'flag') {
        setFlagAlphaGroup('all')
        setActiveRegions(new Set())
      }
    }
  }, [requestedFilter])

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
      removeGhost()
      dragRef.current = null
    }
  }, [])

  const showSymbolFamily = filter !== 'flag'
  const showFlagAlpha = filter === 'flag'

  const flagsHiddenByDefault =
    showFlagAlpha && activeRegions.size === 0 && flagAlphaGroup === 'all' && !deferredQuery.trim()

  const filteredAssets = useMemo(() => {

    const normalizedQuery = deferredQuery.trim().toLowerCase()

    if (flagsHiddenByDefault) return []

    return assets.filter(asset => {

      const matchesFilter = asset.kind === filter

      const matchesFamily =
        !showSymbolFamily
          ? true
          : symbolFamily === 'all'
            ? true
            : symbolFamily === 'nato'
              ? isNatoAsset(asset)
              : isGeneralAsset(asset)

      const matchesAlpha =
        !showFlagAlpha || flagAlphaGroup === 'all'
          ? true
          : (() => {
              const group = flagAlphaGroups.find(g => g.value === flagAlphaGroup)
              if (!group || group.letters.length === 0) return true
              const firstChar = asset.label.charAt(0).toLocaleUpperCase('tr')
              return group.letters.includes(firstChar)
            })()

      const matchesRegion =
        !showFlagAlpha || activeRegions.size === 0
          ? true
          : Array.from(activeRegions).some(region => asset.tags?.includes(region))

      const haystack = [asset.label, ...(asset.tags ?? [])].join(' ').toLowerCase()

      const matchesQuery =
        normalizedQuery
          ? haystack.includes(normalizedQuery)
          : true

      return matchesFilter && matchesFamily && matchesAlpha && matchesRegion && matchesQuery

    })

  }, [activeRegions, assets, deferredQuery, filter, flagAlphaGroup, flagsHiddenByDefault, showFlagAlpha, showSymbolFamily, symbolFamily])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {

    const file = event.target.files?.[0]
    if (!file) return

    setUploadError(null)

    if (!['image/svg+xml','image/png','image/jpeg','image/webp'].includes(file.type)) {
      setUploadError('Yalnızca SVG, PNG, JPG veya WEBP dosyaları yüklenebilir.')
      return
    }

    if (file.size > 2_500_000) {
      setUploadError('Dosya 2.5MB sınırını aşamaz.')
      return
    }

    setSubmitting(true)

    try {

      await onUploadAsset({
        file,
        kind,
        label,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean)
      })

      setLabel('')
      setTags('')

    } catch (err) {

      setUploadError(err instanceof Error ? err.message : 'Yükleme başarısız.')

    } finally {

      setSubmitting(false)

    }
  }

  function handleAssetClick(assetId: string) {
    onPickAsset(assetId)
  }

  function handlePointerDown(asset: AssetDefinition, e: React.PointerEvent) {

    if (!canEdit) return

    dragCleanupRef.current?.()

    dragRef.current = {
      asset,
      startX: e.clientX,
      startY: e.clientY
    }

    function move(ev: PointerEvent) {

      const drag = dragRef.current
      if (!drag) return

      const dx = ev.clientX - drag.startX
      const dy = ev.clientY - drag.startY
      const distance = Math.hypot(dx, dy)

      if (distance < 10) return

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dragRef.current) dragRef.current.dragging = true
      }

      if (drag.dragging) {
        if (!ghostRef.current) {
          const ghost = document.createElement('img')
          ghost.src = safeImage(drag.asset.thumbnailPath)
          ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;width:48px;height:48px;object-fit:contain;opacity:0.85;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));transform:translate(-50%,-50%)'
          document.body.appendChild(ghost)
          ghostRef.current = ghost
        }
        ghostRef.current.style.left = ev.clientX + 'px'
        ghostRef.current.style.top = ev.clientY + 'px'
      }

    }

    function up(ev: PointerEvent) {

      const drag = dragRef.current
      if (!drag) return

      if (drag.dragging) {

        onDropAsset({
          assetId: drag.asset.id,
          clientX: ev.clientX,
          clientY: ev.clientY
        })

      }

      removeGhost()
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      dragCleanupRef.current = null

    }

    function cleanup() {
      removeGhost()
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      dragCleanupRef.current = null
    }

    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cleanup)

  }

  return (

    <section className="panel-card">

      <div className="panel-header">
        <div>
          <p className="eyebrow">Varlık Kütüphanesi</p>
          <h3>Bayraklar ve semboller</h3>
        </div>
      </div>

      <input
        className="panel-input"
        value={query}
        onChange={(e)=>setQuery(e.target.value)}
        placeholder="Bayrak veya sembol ara"
      />

      <div className="filter-row">
        {filters.map(item => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'filter-pill active':'filter-pill'}
            onClick={() => {
              setFilter(item.value)
              if (item.value !== 'flag') {
                setFlagAlphaGroup('all')
                setActiveRegions(new Set())
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {showSymbolFamily && (
        <div className="filter-row">
          {symbolFamilies.map(item=>(
            <button
              key={item.value}
              className={symbolFamily === item.value ? 'filter-pill active':'filter-pill'}
              onClick={()=>setSymbolFamily(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {showFlagAlpha && (
        <div className="region-checkboxes">
          {flagRegions.map(region => (
            <label key={region.value} className="region-checkbox">
              <input
                type="checkbox"
                checked={activeRegions.has(region.value)}
                onChange={() => {
                  setActiveRegions(prev => {
                    const next = new Set(prev)
                    if (next.has(region.value)) {
                      next.delete(region.value)
                    } else {
                      next.add(region.value)
                    }
                    return next
                  })
                }}
              />
              <span>{region.label}</span>
            </label>
          ))}
        </div>
      )}

      {showFlagAlpha && (
        <div className="filter-row">
          {flagAlphaGroups.map(item => (
            <button
              key={item.value}
              type="button"
              className={flagAlphaGroup === item.value ? 'filter-pill active' : 'filter-pill'}
              onClick={() => setFlagAlphaGroup(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {isLoading && (
        <p className="panel-empty">Yükleniyor...</p>
      )}

      {flagsHiddenByDefault && (
        <p className="panel-empty">Bayrakları görmek için bir bölge veya harf filtresi seçin.</p>
      )}

      <div className={`asset-grid${showFlagAlpha && !flagsHiddenByDefault ? ' asset-grid--compact' : ''}`}>

        {filteredAssets.map(asset=>{

          const src = safeImage(asset.thumbnailPath)

          return (

            <button
              key={asset.id}
              type="button"
              disabled={!canEdit}
              onClick={()=>handleAssetClick(asset.id)}
              onPointerDown={(e)=>handlePointerDown(asset,e)}
              className={activeAssetId === asset.id ? 'asset-card active':'asset-card'}
            >

              <img
                alt={asset.label}
                draggable={false}
                src={src}
                onError={(e)=>{(e.currentTarget as HTMLImageElement).src = FALLBACK_ICON}}
              />

              <span>{asset.label}</span>

            </button>

          )

        })}

      </div>

      <div className="upload-card">

        <select
          className="panel-input"
          value={kind}
          onChange={(e)=>setKind(e.target.value as AssetKind)}
        >
          <option value="custom">Özel sembol</option>
          <option value="flag">Bayrak</option>
          <option value="air">Hava</option>
          <option value="ground">Kara</option>
          <option value="sea">Deniz</option>
          <option value="explosion">Patlama</option>
          <option value="danger">Tehlike</option>
        </select>

        <input
          className="panel-input"
          value={label}
          onChange={(e)=>setLabel(e.target.value)}
          placeholder="Etiket"
        />

        <input
          className="panel-input"
          value={tags}
          onChange={(e)=>setTags(e.target.value)}
          placeholder="Etiketler (virgül)"
        />

        <label className="upload-button">

          <span>{submitting ? 'Yükleniyor...' : 'SVG/PNG yükle'}</span>

          <input
            hidden
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp"
            onChange={(e)=>void handleFileChange(e)}
          />

        </label>

        {uploadError ? <p className="form-error">{uploadError}</p> : null}

      </div>

    </section>

  )
}
