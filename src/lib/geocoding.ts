export type GeocodingResult = {
  displayName: string
  lon: number
  lat: number
  type: string
}

let lastRequestTime = 0

export async function searchLocation(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // Rate limit: 1 request per second (Nominatim policy)
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed))
  }
  lastRequestTime = Date.now()

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', trimmed)
  url.searchParams.set('limit', '5')
  url.searchParams.set('accept-language', 'tr')

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GeoPulse/1.0 (geopolitical-analysis-tool)' },
  })

  if (!response.ok) return []

  const data: Array<{
    display_name: string
    lon: string
    lat: string
    type: string
    class: string
  }> = await response.json()

  return data.map((item) => ({
    displayName: item.display_name,
    lon: parseFloat(item.lon),
    lat: parseFloat(item.lat),
    type: item.type,
  }))
}

export function zoomForType(type: string): number {
  switch (type) {
    case 'continent':
      return 3
    case 'country':
      return 5
    case 'state':
    case 'region':
      return 7
    case 'county':
    case 'city':
      return 10
    case 'town':
    case 'village':
      return 13
    case 'suburb':
    case 'neighbourhood':
      return 15
    default:
      return 12
  }
}
