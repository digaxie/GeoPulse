import { findSeedAssetById } from '@/features/assets/seedAssets'
import type {
  ScenarioAssetElement,
  ScenarioDocument,
  ScenarioElement,
  UploadedAssetSnapshot,
} from '@/features/scenario/model'
import type { AssetDefinition } from '@/lib/backend/types'

function isAssetElement(element: ScenarioElement): element is ScenarioAssetElement {
  return element.kind === 'asset'
}

export function isSeedAssetId(assetId: string) {
  return Boolean(findSeedAssetById(assetId))
}

export function toUploadedAssetSnapshot(
  asset: AssetDefinition | null | undefined,
): UploadedAssetSnapshot | undefined {
  if (!asset || asset.sourceType !== 'upload') {
    return undefined
  }

  return {
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    sourceType: 'upload',
    storagePath: asset.storagePath,
    thumbnailPath: asset.thumbnailPath,
    intrinsicWidth: asset.intrinsicWidth,
    intrinsicHeight: asset.intrinsicHeight,
  }
}

export function assetDefinitionFromUploadedSnapshot(
  snapshot: UploadedAssetSnapshot,
): AssetDefinition {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    label: snapshot.label,
    sourceType: 'upload',
    storagePath: snapshot.storagePath,
    thumbnailPath: snapshot.thumbnailPath,
    tags: [],
    defaultSize: 48,
    defaultRotation: 0,
    intrinsicWidth: snapshot.intrinsicWidth,
    intrinsicHeight: snapshot.intrinsicHeight,
    scope: 'scenario',
    createdAt: new Date(0).toISOString(),
  }
}

export function collectLegacyUploadedAssetIds(document: ScenarioDocument) {
  const ids = new Set<string>()

  for (const element of document.elements) {
    if (!isAssetElement(element)) {
      continue
    }

    if (element.assetSnapshot || isSeedAssetId(element.assetId)) {
      continue
    }

    ids.add(element.assetId)
  }

  return [...ids]
}

function normalizeAssetsById(
  assets: AssetDefinition[] | Map<string, AssetDefinition>,
) {
  if (assets instanceof Map) {
    return assets
  }

  return new Map(assets.map((asset) => [asset.id, asset]))
}

export function backfillUploadedAssetSnapshots(
  document: ScenarioDocument,
  assets: AssetDefinition[] | Map<string, AssetDefinition>,
) {
  const assetsById = normalizeAssetsById(assets)
  let changed = false

  const nextElements = document.elements.map((element) => {
    if (!isAssetElement(element) || element.assetSnapshot || isSeedAssetId(element.assetId)) {
      return element
    }

    const snapshot = toUploadedAssetSnapshot(assetsById.get(element.assetId))
    if (!snapshot) {
      return element
    }

    changed = true
    return {
      ...element,
      assetSnapshot: snapshot,
    }
  })

  return {
    changed,
    document: changed
      ? {
          ...document,
          elements: nextElements,
        }
      : document,
  }
}
