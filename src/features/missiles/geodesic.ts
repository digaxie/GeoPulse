const EARTH_RADIUS_METERS = 6_371_000

type Coordinate = [number, number]
type FlightProfileType = 'ballistic' | 'cruise' | 'hypersonic' | 'interceptor'

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toVector([lon, lat]: Coordinate) {
  const lonRad = toRadians(lon)
  const latRad = toRadians(lat)
  const cosLat = Math.cos(latRad)

  return [
    cosLat * Math.cos(lonRad),
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
  ] as const
}

function fromVector([x, y, z]: readonly [number, number, number]): Coordinate {
  const lon = Math.atan2(y, x)
  const hyp = Math.sqrt(x * x + y * y)
  const lat = Math.atan2(z, hyp)
  return [toDegrees(lon), toDegrees(lat)]
}

export function haversineDistance(from: Coordinate, to: Coordinate) {
  const lat1 = toRadians(from[1])
  const lat2 = toRadians(to[1])
  const dLat = lat2 - lat1
  const dLon = toRadians(to[0] - from[0])

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}

export function calculateBearing(from: Coordinate, to: Coordinate) {
  const lon1 = toRadians(from[0])
  const lon2 = toRadians(to[0])
  const lat1 = toRadians(from[1])
  const lat2 = toRadians(to[1])
  const dLon = lon2 - lon1

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

export function greatCircleInterpolation(from: Coordinate, to: Coordinate, fraction: number): Coordinate {
  const clamped = clamp(fraction, 0, 1)
  if (clamped === 0) {
    return from
  }
  if (clamped === 1) {
    return to
  }

  const start = toVector(from)
  const end = toVector(to)
  const dot = clamp(start[0] * end[0] + start[1] * end[1] + start[2] * end[2], -1, 1)
  const omega = Math.acos(dot)

  if (omega < 1e-6) {
    return from
  }

  const sinOmega = Math.sin(omega)
  const scaleStart = Math.sin((1 - clamped) * omega) / sinOmega
  const scaleEnd = Math.sin(clamped * omega) / sinOmega

  return fromVector([
    scaleStart * start[0] + scaleEnd * end[0],
    scaleStart * start[1] + scaleEnd * end[1],
    scaleStart * start[2] + scaleEnd * end[2],
  ])
}

export function generateArcPoints(from: Coordinate, to: Coordinate, pointCount = 64) {
  const count = Math.max(2, pointCount)
  return Array.from({ length: count }, (_, index) =>
    greatCircleInterpolation(from, to, index / (count - 1)),
  )
}

export function getAltitudeProfile(progress: number, profile: FlightProfileType) {
  const t = clamp(progress, 0, 1)

  if (profile === 'cruise') {
    return 0.08 + Math.sin(t * Math.PI * 8) * 0.01
  }

  if (profile === 'interceptor') {
    if (t <= 0.35) {
      return t / 0.35
    }
    if (t <= 0.8) {
      return 1 - (t - 0.35) * 0.45
    }
    return Math.max(0.1, 0.8 - (t - 0.8) * 3)
  }

  if (profile === 'hypersonic') {
    if (t <= 0.18) {
      return t / 0.18
    }
    if (t <= 0.78) {
      const glide = (t - 0.18) / 0.6
      return 1 - glide * 0.45 + Math.sin(glide * Math.PI * 2) * 0.03
    }
    const terminal = (t - 0.78) / 0.22
    return Math.max(0.06, 0.55 - terminal * 0.49)
  }

  if (t <= 0.2) {
    return t / 0.2
  }
  if (t <= 0.7) {
    const cruise = (t - 0.2) / 0.5
    return 1 - cruise * 0.12
  }

  const terminal = (t - 0.7) / 0.3
  return Math.max(0, 0.88 - terminal * 0.88)
}

export { EARTH_RADIUS_METERS }
