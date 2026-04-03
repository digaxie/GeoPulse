/**
 * sync-tv-playlists.ts
 *
 * Downloads public M3U playlists from legal/free sources, parses them,
 * normalizes the data, and writes a unified channels.json file.
 *
 * Usage: npm run sync:tv
 *
 * ── Legal / Source Notes ──
 *
 * 1. Free-TV/IPTV (https://github.com/Free-TV/IPTV)
 *    - Explicitly excludes channels behind commercial subscriptions
 *    - Only includes channels that are free-to-air or freely available
 *      in their country of origin
 *    - MIT-like open contribution model; streams point to official broadcaster CDNs
 *
 * 2. freecasthub/public-iptv (https://github.com/freecasthub/public-iptv)
 *    - Curated collection of free, legal IPTV streams from official public broadcasters
 *    - Explicitly states: "No subscriptions, no piracy — only verified public channels"
 *    - Categories: News, Sports, Weather, Education
 *
 * Both sources aggregate publicly accessible stream URLs that broadcasters
 * themselves make available for free. No DRM circumvention, no subscription
 * bypass, no private/pirate content.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'public', 'data', 'tv')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'channels.json')

type RawEntry = {
  name: string
  logoUrl: string
  group: string
  streamUrl: string
}

type NormalizedChannel = {
  id: string
  name: string
  streamUrl: string
  logoUrl: string
  group: string
  country: string
  sourceName: string
  sourceUrl: string
}

type PlaylistSource = {
  name: string
  url: string
  repoUrl: string
  countryFallback: string
}

/**
 * Sources — only legal/public free-to-air playlists.
 * See header comment for licensing rationale.
 */
const SOURCES: readonly PlaylistSource[] = [
  {
    name: 'Free-TV',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    repoUrl: 'https://github.com/Free-TV/IPTV',
    countryFallback: '',
  },
  {
    name: 'FreecastHub',
    url: 'https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u',
    repoUrl: 'https://github.com/freecasthub/public-iptv',
    countryFallback: '',
  },
]

function parseM3u(content: string): RawEntry[] {
  const lines = content.split(/\r?\n/)
  const entries: RawEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF:')) continue

    const logoMatch = /tvg-logo="([^"]*)"/i.exec(line)
    const groupMatch = /group-title="([^"]*)"/i.exec(line)
    const commaIdx = line.lastIndexOf(',')
    const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''

    let streamUrl = ''
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim()
      if (nextLine && !nextLine.startsWith('#')) {
        streamUrl = nextLine
        i = j
        break
      }
    }

    if (name && streamUrl) {
      entries.push({
        name,
        logoUrl: logoMatch?.[1] ?? '',
        group: groupMatch?.[1] ?? '',
        streamUrl,
      })
    }
  }

  return entries
}

function extractCountry(group: string): string {
  // Patterns: "Turkey", "USA: News", "UK;Entertainment"
  // If group has a separator, country is before it; otherwise the whole group is the country
  const sep = group.search(/[;:]/)
  if (sep > 0) return group.slice(0, sep).trim()
  return group.trim()
}

function normalize(
  entries: RawEntry[],
  source: PlaylistSource,
): NormalizedChannel[] {
  const slug = source.name.toLowerCase().replace(/\s+/g, '-')
  return entries.map((entry, idx) => ({
    id: `${slug}-${idx}`,
    name: entry.name,
    streamUrl: entry.streamUrl,
    logoUrl: entry.logoUrl,
    group: entry.group || 'Uncategorized',
    country: extractCountry(entry.group) || source.countryFallback,
    sourceName: source.name,
    sourceUrl: source.repoUrl,
  }))
}

function deduplicateByStreamUrl(channels: NormalizedChannel[]): NormalizedChannel[] {
  const seen = new Set<string>()
  const result: NormalizedChannel[] = []
  for (const ch of channels) {
    if (seen.has(ch.streamUrl)) continue
    seen.add(ch.streamUrl)
    result.push(ch)
  }
  return result
}

async function fetchPlaylist(source: PlaylistSource): Promise<NormalizedChannel[]> {
  console.log(`  Fetching ${source.name}: ${source.url}`)
  const res = await fetch(source.url)
  if (!res.ok) {
    console.warn(`  ⚠ ${source.name}: HTTP ${res.status} — skipping`)
    return []
  }
  const text = await res.text()
  const entries = parseM3u(text)
  console.log(`  ✓ ${source.name}: ${entries.length} channels parsed`)
  return normalize(entries, source)
}

async function main() {
  console.log('sync-tv-playlists: starting...\n')

  const allChannels: NormalizedChannel[] = []

  for (const source of SOURCES) {
    try {
      const channels = await fetchPlaylist(source)
      allChannels.push(...channels)
    } catch (err) {
      console.warn(`  ⚠ ${source.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const deduplicated = deduplicateByStreamUrl(allChannels)

  // Re-assign unique IDs after dedup
  const final = deduplicated.map((ch, idx) => ({
    ...ch,
    id: `ch-${idx}`,
  }))

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_FILE, JSON.stringify(final, null, 2), 'utf-8')

  console.log(`\n✓ Wrote ${final.length} channels to ${OUTPUT_FILE}`)
}

void main().catch((err) => {
  console.error('sync-tv-playlists failed:', err)
  process.exit(1)
})
