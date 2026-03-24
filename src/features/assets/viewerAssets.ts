import { findSeedAssetById, seedAssets } from '@/features/assets/seedAssets'
import {
  assetDefinitionFromUploadedSnapshot,
  collectLegacyUploadedAssetIds,
  isSeedAssetId,
} from '@/features/assets/assetSnapshots'
import type { ScenarioDocument } from '@/features/scenario/model'
import type { AssetDefinition } from '@/lib/backend/types'

function collectSnapshotAssets(document: ScenarioDocument) {
  const assetsById = new Map<string, AssetDefinition>()

  for (const element of document.elements) {
    if (element.kind !== 'asset' || !element.assetSnapshot) {
      continue
    }

    assetsById.set(
      element.assetSnapshot.id,
      assetDefinitionFromUploadedSnapshot(element.assetSnapshot),
    )
  }

  return assetsById
}

export function mergeViewerAssets(
  document: ScenarioDocument,
  legacyAssets: AssetDefinition[] = [],
) {
  const assetsById = new Map(seedAssets.map((asset) => [asset.id, asset]))

  for (const element of document.elements) {
    if (element.kind !== 'asset') {
      continue
    }

    const seedAsset = findSeedAssetById(element.assetId)
    if (seedAsset) {
      assetsById.set(seedAsset.id, seedAsset)
    }
  }

  for (const [assetId, asset] of collectSnapshotAssets(document)) {
    assetsById.set(assetId, asset)
  }

  for (const asset of legacyAssets) {
    if (!isSeedAssetId(asset.id)) {
      assetsById.set(asset.id, asset)
    }
  }

  return [...assetsById.values()]
}

export function hasLegacyUploadedViewerAssets(document: ScenarioDocument) {
  return collectLegacyUploadedAssetIds(document).length > 0
}
