import { z } from 'zod'

import { type ScenarioDocument, scenarioDocumentSchema } from '@/features/scenario/model'
import { migrateScenarioDocument } from '@/features/scenario/migrate'

const scenarioTransferSchema = z.object({
  version: z.literal(1).default(1),
  exportedAt: z.string().optional(),
  title: z.string().min(1).default('Iceri aktarilan senaryo'),
  document: scenarioDocumentSchema,
})

export type ScenarioTransfer = z.infer<typeof scenarioTransferSchema>

export function serializeScenarioTransfer(input: {
  title: string
  document: ScenarioDocument
}) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      title: input.title.trim() || 'Senaryo',
      document: input.document,
    } satisfies ScenarioTransfer,
    null,
    2,
  )
}

export function parseScenarioTransfer(raw: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Gecersiz JSON formati.')
  }

  const transfer =
    parsed && typeof parsed === 'object' && 'document' in parsed
      ? scenarioTransferSchema.parse(parsed)
      : scenarioTransferSchema.parse({
          title: 'Iceri aktarilan senaryo',
          document: parsed,
        })

  return {
    ...transfer,
    document: migrateScenarioDocument(transfer.document),
  }
}
