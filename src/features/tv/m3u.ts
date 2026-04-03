import type { TvChannel } from './types'

type M3uEntry = {
  name: string
  logoUrl: string
  group: string
  streamUrl: string
}

/**
 * Parse an M3U/M3U8 playlist string into structured entries.
 * Handles #EXTINF lines with tvg-logo, group-title attributes.
 */
export function parseM3u(content: string): M3uEntry[] {
  const lines = content.split(/\r?\n/)
  const entries: M3uEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line.startsWith('#EXTINF:')) {
      continue
    }

    const logoMatch = /tvg-logo="([^"]*)"/i.exec(line)
    const groupMatch = /group-title="([^"]*)"/i.exec(line)

    // Channel name is after the last comma in the #EXTINF line
    const commaIdx = line.lastIndexOf(',')
    const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''

    // The stream URL is on the next non-empty, non-comment line
    let streamUrl = ''
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim()
      if (nextLine && !nextLine.startsWith('#')) {
        streamUrl = nextLine
        i = j // advance outer loop past the URL line
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

/**
 * Convert raw M3U entries to normalized TvChannel objects.
 */
export function normalizeChannels(
  entries: M3uEntry[],
  sourceName: string,
  sourceUrl: string,
  countryFallback: string,
): TvChannel[] {
  return entries.map((entry, idx) => ({
    id: `${sourceName.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
    name: entry.name,
    streamUrl: entry.streamUrl,
    logoUrl: entry.logoUrl,
    group: entry.group || 'Uncategorized',
    country: extractCountryFromGroup(entry.group) || countryFallback,
    sourceName,
    sourceUrl,
  }))
}

function extractCountryFromGroup(group: string): string {
  // Common pattern: "Country: Category" or just a country name
  const colonIdx = group.indexOf(':')
  if (colonIdx > 0) {
    return group.slice(0, colonIdx).trim()
  }
  return group.trim()
}
