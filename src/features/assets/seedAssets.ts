import type { AssetDefinition, AssetKind } from '@/lib/backend/types'
import { withBasePath } from '@/lib/paths'

import {
  type GeneratedSeedAsset,
  generatedSeedCatalog,
} from './generatedSeedCatalog'
import { resolveSeedAssetAlias } from './seedAssetAliases'

const seedAssetVersion = '20260318-1'

function defaultSizeForKind(kind: AssetKind) {
  switch (kind) {
    case 'flag':
      return 52
    case 'air':
    case 'ground':
    case 'sea':
      return 56
    case 'explosion':
    case 'danger':
    case 'custom':
      return 48
  }
}

function makeSeedAsset(input: GeneratedSeedAsset): AssetDefinition {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    sourceType: 'seed',
    storagePath: withBasePath(`/seed-assets/${input.storagePath}?v=${seedAssetVersion}`),
    thumbnailPath: withBasePath(`/seed-assets/${input.storagePath}?v=${seedAssetVersion}`),
    tags: input.tags,
    defaultSize: input.defaultSize ?? defaultSizeForKind(input.kind),
    defaultRotation: 0,
    intrinsicWidth: input.intrinsicWidth,
    intrinsicHeight: input.intrinsicHeight,
    scope: 'global',
    createdAt: new Date(0).toISOString(),
  }
}

export const seedAssets: AssetDefinition[] = generatedSeedCatalog.map(makeSeedAsset)
const seedAssetsById = new Map(seedAssets.map((asset) => [asset.id, asset]))

export function findSeedAssetById(assetId: string) {
  const canonicalAssetId = resolveSeedAssetAlias(assetId)
  const asset = seedAssetsById.get(canonicalAssetId)

  if (!asset) {
    return undefined
  }

  return canonicalAssetId === assetId
    ? asset
    : {
        ...asset,
        id: assetId,
      }
}
