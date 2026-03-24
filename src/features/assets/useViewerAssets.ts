import { useEffect, useMemo, useState } from 'react'

import { collectLegacyUploadedAssetIds } from '@/features/assets/assetSnapshots'
import { mergeViewerAssets } from '@/features/assets/viewerAssets'
import { useScenarioStore } from '@/features/scenario/store'
import { backendClient } from '@/lib/backend'
import type { AssetDefinition } from '@/lib/backend/types'

export function useViewerAssets(viewerSlug: string) {
  const document = useScenarioStore((state) => state.document)
  const [legacyAssets, setLegacyAssets] = useState<AssetDefinition[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unresolvedLegacyIds = useMemo(
    () => collectLegacyUploadedAssetIds(document).sort(),
    [document],
  )
  const unresolvedKey = unresolvedLegacyIds.join(',')

  useEffect(() => {
    if (!viewerSlug || unresolvedLegacyIds.length === 0) {
      return
    }

    let active = true
    queueMicrotask(() => {
      if (!active) {
        return
      }

      setIsLoading(true)
      setError(null)
    })

    void backendClient
      .listLegacyViewerAssets(viewerSlug)
      .then((assets) => {
        if (active) {
          setLegacyAssets(assets)
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Legacy varliklar yuklenemedi.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [unresolvedKey, unresolvedLegacyIds.length, viewerSlug])

  const assets = useMemo(
    () => mergeViewerAssets(document, unresolvedLegacyIds.length === 0 ? [] : legacyAssets),
    [document, legacyAssets, unresolvedLegacyIds.length],
  )

  return {
    assets,
    isLoading: unresolvedLegacyIds.length === 0 ? false : isLoading,
    error: unresolvedLegacyIds.length === 0 ? null : error,
  }
}
