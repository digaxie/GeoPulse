import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { syncScenePacks } from './sync-scene-packs'
import { syncSeedAssets } from './sync-seed-assets'

type FileSnapshot = Map<string, string>

const repoRoot = process.cwd()

async function walkFiles(rootDir: string, baseDir = rootDir): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) {
        return walkFiles(fullPath, baseDir)
      }

      return [path.relative(baseDir, fullPath).replace(/\\/g, '/')]
    }),
  )

  return files.flat().sort()
}

async function readFileSnapshot(baseDir: string, targetPath: string): Promise<FileSnapshot> {
  const absoluteTarget = path.join(baseDir, targetPath)
  const entries = new Map<string, string>()

  const statEntries = await walkFiles(absoluteTarget, absoluteTarget)
  await Promise.all(
    statEntries.map(async (relativePath) => {
      const content = await readFile(path.join(absoluteTarget, relativePath), 'utf8')
      entries.set(relativePath, content.replace(/\r\n/g, '\n'))
    }),
  )

  return entries
}

async function readSingleFile(baseDir: string, targetPath: string): Promise<string> {
  const content = await readFile(path.join(baseDir, targetPath), 'utf8')
  return content.replace(/\r\n/g, '\n')
}

function compareSnapshots(
  label: string,
  actual: FileSnapshot,
  generated: FileSnapshot,
  failures: string[],
) {
  const actualFiles = new Set(actual.keys())
  const generatedFiles = new Set(generated.keys())

  for (const relativePath of [...actualFiles].sort()) {
    if (!generatedFiles.has(relativePath)) {
      failures.push(`${label}: stale file present -> ${relativePath}`)
    }
  }

  for (const relativePath of [...generatedFiles].sort()) {
    if (!actualFiles.has(relativePath)) {
      failures.push(`${label}: missing generated file -> ${relativePath}`)
      continue
    }

    if (actual.get(relativePath) !== generated.get(relativePath)) {
      failures.push(`${label}: content mismatch -> ${relativePath}`)
    }
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'geopulse-generated-'))

  try {
    await syncScenePacks(tempRoot)
    await syncSeedAssets(tempRoot)

    const failures: string[] = []
    const actualSeedFiles = await readFileSnapshot(repoRoot, 'public/seed-assets')
    const generatedSeedFiles = await readFileSnapshot(tempRoot, 'public/seed-assets')
    compareSnapshots('public/seed-assets', actualSeedFiles, generatedSeedFiles, failures)

    const actualCatalog = await readSingleFile(
      repoRoot,
      'src/features/assets/generatedSeedCatalog.ts',
    )
    const generatedCatalog = await readSingleFile(
      tempRoot,
      'src/features/assets/generatedSeedCatalog.ts',
    )
    if (actualCatalog !== generatedCatalog) {
      failures.push('src/features/assets/generatedSeedCatalog.ts: content mismatch')
    }

    const actualSceneManifest = await readSingleFile(
      repoRoot,
      'public/data/scenes/scene-manifest.json',
    )
    const generatedSceneManifest = await readSingleFile(
      tempRoot,
      'public/data/scenes/scene-manifest.json',
    )
    if (actualSceneManifest !== generatedSceneManifest) {
      failures.push('public/data/scenes/scene-manifest.json: content mismatch')
    }

    if (failures.length > 0) {
      console.error('Generated artifacts are out of date:')
      for (const failure of failures) {
        console.error(`- ${failure}`)
      }
      process.exitCode = 1
      return
    }

    console.log('Generated artifacts are up to date.')
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
