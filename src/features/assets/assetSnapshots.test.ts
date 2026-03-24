import { describe, expect, it } from 'vitest'

import {
  backfillUploadedAssetSnapshots,
  collectLegacyUploadedAssetIds,
  toUploadedAssetSnapshot,
} from '@/features/assets/assetSnapshots'
import { mergeViewerAssets } from '@/features/assets/viewerAssets'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import type { AssetDefinition } from '@/lib/backend/types'

function createUploadedAsset(overrides: Partial<AssetDefinition> = {}): AssetDefinition {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'custom',
    label: 'Uploaded Asset',
    sourceType: 'upload',
    storagePath: 'https://cdn.example.com/uploaded.svg',
    thumbnailPath: 'https://cdn.example.com/uploaded.svg',
    tags: ['custom'],
    defaultSize: 48,
    defaultRotation: 0,
    intrinsicWidth: 120,
    intrinsicHeight: 80,
    scope: 'scenario',
    createdAt: new Date(0).toISOString(),
    ...overrides,
  }
}

describe('assetSnapshots helpers', () => {
  it('creates uploaded snapshots only for uploaded assets', () => {
    expect(toUploadedAssetSnapshot(createUploadedAsset())?.sourceType).toBe('upload')
    expect(
      toUploadedAssetSnapshot(
        createUploadedAsset({ id: 'flag-tr', sourceType: 'seed', storagePath: '/seed-assets/flags/tr.svg' }),
      ),
    ).toBeUndefined()
  })

  it('backfills legacy uploaded asset elements without touching seed assets', () => {
    const asset = createUploadedAsset()
    const document = createDefaultScenarioDocument()
    document.elements = [
      {
        id: 'seed-1',
        kind: 'asset',
        assetId: 'flag-tr',
        position: [35, 39],
        label: '',
        size: 48,
        rotation: 0,
        scale: 1,
        zIndex: 1,
        locked: false,
        meta: {},
        style: {
          strokeColor: '#12213f',
          fillColor: 'rgba(18, 33, 63, 0.12)',
          textColor: '#12213f',
          lineWidth: 3,
          opacity: 1,
          lineDash: [],
          endArrow: false,
        },
      },
      {
        id: 'upload-1',
        kind: 'asset',
        assetId: asset.id,
        position: [35, 39],
        label: '',
        size: 48,
        rotation: 0,
        scale: 1,
        zIndex: 2,
        locked: false,
        meta: {},
        style: {
          strokeColor: '#12213f',
          fillColor: 'rgba(18, 33, 63, 0.12)',
          textColor: '#12213f',
          lineWidth: 3,
          opacity: 1,
          lineDash: [],
          endArrow: false,
        },
      },
    ]

    const { changed, document: nextDocument } = backfillUploadedAssetSnapshots(document, [asset])

    expect(changed).toBe(true)
    expect(nextDocument.elements[0]).not.toHaveProperty('assetSnapshot')
    expect(nextDocument.elements[1]).toHaveProperty('assetSnapshot')
  })

  it('deduplicates unresolved legacy uploaded asset ids in large documents', () => {
    const document = createDefaultScenarioDocument()
    const assetA = '11111111-1111-4111-8111-111111111111'
    const assetB = '22222222-2222-4222-8222-222222222222'

    document.elements = Array.from({ length: 800 }, (_, index) => ({
      id: `asset-${index}`,
      kind: 'asset' as const,
      assetId: index % 2 === 0 ? assetA : assetB,
      position: [35 + index / 1000, 39],
      label: '',
      size: 48,
      rotation: 0,
      scale: 1,
      zIndex: index + 1,
      locked: false,
      meta: {},
      style: {
        strokeColor: '#12213f',
        fillColor: 'rgba(18, 33, 63, 0.12)',
        textColor: '#12213f',
        lineWidth: 3,
        opacity: 1,
        lineDash: [],
        endArrow: false,
      },
    }))

    expect(collectLegacyUploadedAssetIds(document)).toEqual([assetA, assetB])
  })

  it('treats legacy seed aliases as seed assets instead of uploaded assets', () => {
    const document = createDefaultScenarioDocument()
    document.elements = [
      {
        id: 'legacy-seed',
        kind: 'asset',
        assetId: 'general-ground-soldier',
        position: [35, 39],
        label: '',
        size: 48,
        rotation: 0,
        scale: 1,
        zIndex: 1,
        locked: false,
        meta: {},
        style: {
          strokeColor: '#12213f',
          fillColor: 'rgba(18, 33, 63, 0.12)',
          textColor: '#12213f',
          lineWidth: 3,
          opacity: 1,
          lineDash: [],
          endArrow: false,
        },
      },
    ]

    expect(collectLegacyUploadedAssetIds(document)).toEqual([])

    const merged = mergeViewerAssets(document)
    expect(merged.some((asset) => asset.id === 'general-ground-soldier')).toBe(true)
  })

  it('merges seed, snapshot, and legacy viewer assets without duplicating ids', () => {
    const uploadedAsset = createUploadedAsset()
    const document = createDefaultScenarioDocument()
    document.elements = [
      {
        id: 'uploaded',
        kind: 'asset',
        assetId: uploadedAsset.id,
        assetSnapshot: toUploadedAssetSnapshot(uploadedAsset),
        position: [35, 39],
        label: '',
        size: 48,
        rotation: 0,
        scale: 1,
        zIndex: 1,
        locked: false,
        meta: {},
        style: {
          strokeColor: '#12213f',
          fillColor: 'rgba(18, 33, 63, 0.12)',
          textColor: '#12213f',
          lineWidth: 3,
          opacity: 1,
          lineDash: [],
          endArrow: false,
        },
      },
    ]

    const merged = mergeViewerAssets(document, [uploadedAsset])

    expect(merged.some((asset) => asset.id === 'flag-tr')).toBe(true)
    expect(merged.filter((asset) => asset.id === uploadedAsset.id)).toHaveLength(1)
  })
})
