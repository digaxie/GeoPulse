import { writeSceneManifest } from './lib/sceneManifest'

export async function syncScenePacks(rootDir = process.cwd()) {
  await writeSceneManifest(rootDir)
}

if (process.argv[1]?.endsWith('sync-scene-packs.ts')) {
  void syncScenePacks().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
