import { createClient } from '@supabase/supabase-js'

import { backfillUploadedAssetSnapshots, collectLegacyUploadedAssetIds } from '../src/features/assets/assetSnapshots'
import { scenarioDocumentSchema } from '../src/features/scenario/model'
import type { AssetDefinition } from '../src/lib/backend/types'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const batchSize = Number(process.env.BACKFILL_BATCH_SIZE ?? '100')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

type ScenarioRow = {
  id: string
  document_json: unknown
  revision: number
}

type BackfillFailure = {
  scenarioId: string
  stage: 'parse' | 'update'
  message: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

type AssetRow = {
  id: string
  kind: AssetDefinition['kind']
  label: string
  source_type: AssetDefinition['sourceType']
  storage_path: string
  thumbnail_path: string
  tags: string[]
  default_size: number
  default_rotation: number
  intrinsic_width: number | null
  intrinsic_height: number | null
  scope: AssetDefinition['scope']
  created_at: string
}

function toAssetDefinition(row: AssetRow): AssetDefinition {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    sourceType: row.source_type,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    tags: row.tags,
    defaultSize: row.default_size,
    defaultRotation: row.default_rotation,
    intrinsicWidth: row.intrinsic_width ?? undefined,
    intrinsicHeight: row.intrinsic_height ?? undefined,
    scope: row.scope,
    createdAt: row.created_at,
  }
}

async function fetchAssetsByIds(assetIds: string[]) {
  const validAssetIds = assetIds.filter((assetId) => uuidPattern.test(assetId))

  if (validAssetIds.length === 0) {
    return new Map<string, AssetDefinition>()
  }

  const { data, error } = await supabase
    .from('assets')
    .select(
      'id,kind,label,source_type,storage_path,thumbnail_path,tags,default_size,default_rotation,intrinsic_width,intrinsic_height,scope,created_at',
    )
    .in('id', validAssetIds)

  if (error) {
    throw error
  }

  return new Map((data as AssetRow[]).map((asset) => [asset.id, toAssetDefinition(asset)]))
}

async function run() {
  let offset = 0
  let scanned = 0
  let updated = 0
  let skipped = 0
  const failures: BackfillFailure[] = []

  while (true) {
    const { data, error } = await supabase
      .from('scenarios')
      .select('id,document_json,revision')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as ScenarioRow[]
    if (rows.length === 0) {
      break
    }

    scanned += rows.length

    const parsedRows = rows.flatMap((row) => {
      try {
        return [
          {
            id: row.id,
            revision: row.revision,
            document: scenarioDocumentSchema.parse(row.document_json),
          },
        ]
      } catch (error) {
        failures.push({
          scenarioId: row.id,
          stage: 'parse',
          message: formatError(error),
        })
        return []
      }
    })

    const assetIds = new Set<string>()
    for (const row of parsedRows) {
      for (const assetId of collectLegacyUploadedAssetIds(row.document)) {
        assetIds.add(assetId)
      }
    }

    const assetsById = await fetchAssetsByIds([...assetIds])

    for (const row of parsedRows) {
      try {
        const { changed, document } = backfillUploadedAssetSnapshots(row.document, assetsById)
        if (!changed) {
          skipped += 1
          continue
        }

        const nextDocument = scenarioDocumentSchema.parse({
          ...document,
          revision: document.revision + 1,
        })

        const { error: updateError } = await supabase
          .from('scenarios')
          .update({
            document_json: nextDocument,
            revision: nextDocument.revision,
          })
          .eq('id', row.id)

        if (updateError) {
          throw updateError
        }

        updated += 1
      } catch (error) {
        failures.push({
          scenarioId: row.id,
          stage: 'update',
          message: formatError(error),
        })
      }
    }

    offset += rows.length
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        updated,
        skipped,
        failed: failures.length,
        failures,
      },
      null,
      2,
    ),
  )
}

void run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        fatal: formatError(error),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
