import { useCallback, useEffect, useState } from 'react'

import { backendClient } from '@/lib/backend'
import type { AssetDefinition, UploadAssetInput } from '@/lib/backend/types'
import { readImageDimensions } from '@/lib/utils'

async function hydrateAssetDimensions(assets: AssetDefinition[]) {
  return Promise.all(
    assets.map(async (asset) => {
      if (asset.intrinsicWidth && asset.intrinsicHeight) {
        return asset
      }

      const dimensions = await readImageDimensions(asset.storagePath || asset.thumbnailPath)
      return {
        ...asset,
        intrinsicWidth: dimensions.width,
        intrinsicHeight: dimensions.height,
      } satisfies AssetDefinition
    }),
  )
}

function orderAssets(assets: AssetDefinition[]) {
  const seedAssets = assets.filter((asset) => asset.sourceType === 'seed')
  const uploadedAssets = assets
    .filter((asset) => asset.sourceType === 'upload')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return [...seedAssets, ...uploadedAssets]
}

export function useAssets() {
  const [assets, setAssets] = useState<AssetDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const nextAssets = await backendClient.listAssets()
      const hydratedAssets = await hydrateAssetDimensions(nextAssets)
      setAssets(orderAssets(hydratedAssets))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Varlık listesi yüklenemedi.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function uploadAsset(input: UploadAssetInput) {
    const nextAsset = await backendClient.uploadAsset(input)
    const [hydratedAsset] = await hydrateAssetDimensions([nextAsset])
    setAssets((current) =>
      orderAssets([
        hydratedAsset,
        ...current.filter((asset) => asset.id !== hydratedAsset.id),
      ]),
    )
    return hydratedAsset
  }

  return {
    assets,
    isLoading,
    error,
    refresh,
    uploadAsset,
  }
}
