import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getSceneManifestEntries } from '../../src/features/scenario/scenes'

export function createSceneManifest() {
  return {
    provider: 'vercel_blob_placeholder',
    notes:
      'Regional Liberty scene packs can be uploaded to Vercel Blob later using these stable blob keys.',
    presets: getSceneManifestEntries(),
  }
}

export function getSceneManifestContent() {
  return `${JSON.stringify(createSceneManifest(), null, 2)}\n`
}

export async function writeSceneManifest(rootDir: string) {
  const outputDir = path.join(rootDir, 'public', 'data', 'scenes')
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'scene-manifest.json'), getSceneManifestContent(), 'utf8')
}
