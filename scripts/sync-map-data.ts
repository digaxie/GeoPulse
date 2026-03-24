import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const CACHE_DIR = path.join(ROOT, '.cache', 'natural-earth')
const OUTPUT_DIR = path.join(ROOT, 'public', 'data', 'world')

type Source = {
  readonly id: string
  readonly version: string
  readonly url: string
  readonly output: string
  readonly simplify?: string
}

const SOURCES: readonly Source[] = [
  {
    id: 'admin0-countries',
    version: '5.1.1',
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip',
    output: path.join(OUTPUT_DIR, 'admin0-countries.geojson'),
    simplify: '6%',
  },
  {
    id: 'admin1-regions',
    version: '5.1.1',
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip',
    output: path.join(OUTPUT_DIR, 'admin1-regions.geojson'),
    simplify: '3%',
  },
  {
    id: 'populated-places',
    version: '5.1.2',
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip',
    output: path.join(OUTPUT_DIR, 'populated-places.geojson'),
  },
  {
    id: 'disputed-areas',
    version: '5.1.1',
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_disputed_areas.zip',
    output: path.join(OUTPUT_DIR, 'disputed-areas.geojson'),
    simplify: '5%',
  },
]

type GeoJsonFeature = {
  type: string
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

type GeoJson = {
  type: string
  features?: GeoJsonFeature[]
}

function getCacheKey(source: Source): string {
  return createHash('md5')
    .update(`${source.id}-${source.version}-${source.url}`)
    .digest('hex')
    .slice(0, 8)
}

async function ensureDirectories() {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
}

async function download(url: string, destination: string) {
  console.log(`İndiriliyor: ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`İndirme başarısız oldu (${response.status}): ${url}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  if (buffer.byteLength === 0) {
    throw new Error(`Boş dosya indirildi: ${url}`)
  }

  await writeFile(destination, buffer)
  console.log(`İndirildi: ${path.basename(destination)} (${(buffer.byteLength / 1024).toFixed(1)} KB)`)
}

async function getOrDownload(source: Source): Promise<string> {
  const cacheKey = getCacheKey(source)
  const zipPath = path.join(CACHE_DIR, `${source.id}-${cacheKey}.zip`)

  const oldFiles = (await readdir(CACHE_DIR).catch(() => []))
    .filter((f) => f.startsWith(`${source.id}-`) && f.endsWith('.zip') && !f.includes(cacheKey))
    .map((f) => path.join(CACHE_DIR, f))

  await Promise.all(oldFiles.map((f) => rm(f, { force: true })))

  try {
    const info = await stat(zipPath)
    if (info.size > 0) {
      console.log(`Cache kullanılıyor: ${source.id} (v${source.version})`)
      return zipPath
    }
    await rm(zipPath, { force: true })
  } catch {
    // Dosya yok, indirilecek
  }

  await download(source.url, zipPath)
  return zipPath
}

async function runMapshaper(source: Source, zipPath: string) {
  const executable = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'mapshaper.cmd' : 'mapshaper',
  )

  const args = [zipPath, '-proj', 'wgs84']

  if (source.simplify) {
    args.push('-simplify', source.simplify, 'keep-shapes')
  }

  args.push('-o', 'format=geojson', 'force', source.output)

  await new Promise<void>((resolve, reject) => {
    const command = [`"${executable}"`, ...args.map((part) => `"${part}"`)].join(' ')
    const child = exec(command, { cwd: ROOT }, (error) => {
      if (error) {
        reject(new Error(`mapshaper komutu başarısız oldu: ${source.id} — ${error.message}`))
        return
      }
      resolve()
    })

    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
}

async function parseGeoJson(filePath: string): Promise<GeoJson> {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as GeoJson
}

function roundCoordinates(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number(value.toFixed(5))
  }
  if (Array.isArray(value)) {
    return value.map((item) => roundCoordinates(item))
  }
  return value
}

function pickProperties(
  properties: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    if (key in properties) {
      acc[key] = properties[key]
    }
    return acc
  }, {})
}

const PROPERTY_KEYS: Record<string, string[]> = {
  'admin0-countries': ['NAME_LONG', 'NAME', 'MAPCOLOR9', 'NAME_TR', 'FORMAL_EN', 'CONTINENT', 'ADM0_A3', 'ISO_A2', 'ISO_A3'],
  'admin1-regions': ['name', 'name_en', 'name_tr', 'NAME', 'min_zoom', 'adm1_code', 'adm0_a3', 'adm0_name', 'admin'],
  'populated-places': ['NAME', 'NAMEASCII', 'NAME_TR', 'NAME_EN', 'ADM0NAME', 'ADM1NAME', 'FEATURECLA', 'POP_MAX', 'ADM0_A3', 'SOV0NAME'],
  'disputed-areas': ['NAME', 'NAME_LONG', 'TYPE', 'NOTE_BRK', 'ADM0_A3', 'CONTINENT'],
}

function optimizeGeoJson(source: Source, data: GeoJson): GeoJson {
  if (!Array.isArray(data.features)) {
    return data
  }

  let features = data.features

  if (source.id === 'populated-places') {
    features = features.filter((feature) => {
      const pop = Number(feature.properties.POP_MAX ?? 0)
      const rank = Number(feature.properties.RANK_MAX ?? 99)
      const featureClass = String(feature.properties.FEATURECLA ?? '')
      return (
        pop >= 500_000 ||
        rank <= 4 ||
        featureClass === 'Admin-0 capital' ||
        featureClass === 'Admin-1 capital'
      )
    })
  }

  const keys = PROPERTY_KEYS[source.id] ?? []

  return {
    ...data,
    features: features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: roundCoordinates(feature.geometry.coordinates),
      },
      properties: pickProperties(feature.properties, keys),
    })),
  }
}

async function syncSource(source: Source) {
  console.log(`\n▶ ${source.id} işleniyor...`)

  const outputBase = path.basename(source.output, '.geojson')
  const existingOutputs = (await readdir(OUTPUT_DIR).catch(() => []))
    .filter((f) => f.startsWith(outputBase) && f.endsWith('.geojson'))
    .map((f) => path.join(OUTPUT_DIR, f))

  await Promise.all(existingOutputs.map((f) => rm(f, { force: true })))

  const zipPath = await getOrDownload(source)

  await runMapshaper(source, zipPath)

  const generatedFiles = (await readdir(OUTPUT_DIR))
    .filter((f) => f.startsWith(outputBase) && f.endsWith('.geojson'))
    .map((f) => path.join(OUTPUT_DIR, f))

  if (generatedFiles.length === 0) {
    throw new Error(`Beklenen GeoJSON çıktı dosyası üretilmedi: ${source.id}`)
  }

  const filesWithSize = await Promise.all(
    generatedFiles.map(async (file) => ({
      file,
      size: (await stat(file)).size,
    })),
  )

  const primaryFile = filesWithSize.sort((a, b) => b.size - a.size)[0].file

  if (primaryFile !== source.output) {
    await rename(primaryFile, source.output)
  }

  await Promise.all(
    generatedFiles
      .filter((f) => f !== primaryFile)
      .map((f) => rm(f, { force: true })),
  )

  const rawGeoJson = await parseGeoJson(source.output)
  const optimizedGeoJson = optimizeGeoJson(source, rawGeoJson)
  await writeFile(source.output, JSON.stringify(optimizedGeoJson))

  const finalSize = (await stat(source.output)).size
  console.log(`✓ ${source.id} tamamlandı (${(finalSize / 1024).toFixed(1)} KB)`)
}

async function writeMetadata() {
  const metadata = {
    preset: 'de_facto_world',
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map(({ id, version, url }) => ({ id, version, url })),
  }

  await writeFile(
    path.join(OUTPUT_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
  )
}

async function main() {
  console.log('Natural Earth verileri senkronize ediliyor...')
  await ensureDirectories()

  for (const source of SOURCES) {
    await syncSource(source)
  }

  await writeMetadata()

  const tempDir = path.join(OUTPUT_DIR, '__temp__')
  await rm(tempDir, { recursive: true, force: true })

  console.log('\n✅ Tüm kaynaklar başarıyla işlendi.')
}

void main().catch((error: unknown) => {
  console.error('Hata:', error)
  process.exitCode = 1
})