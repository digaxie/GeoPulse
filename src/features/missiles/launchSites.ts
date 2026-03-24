import type { MissileDefinition, ScenarioMissilesState } from '@/features/missiles/types'

export const DEFAULT_LAUNCH_SITE_VALUE = 'default'

export type LaunchSiteOption = {
  key: string
  value: string
  label: string
  coord: [number, number]
  isDefault: boolean
}

export function areCoordsEqual(
  left: [number, number] | null | undefined,
  right: [number, number] | null | undefined,
) {
  if (!left || !right) {
    return false
  }

  return left[0] === right[0] && left[1] === right[1]
}

export function serializeCoord(coord: [number, number]) {
  return `${coord[0]},${coord[1]}`
}

export function isValidLaunchSiteCoord(
  definition: MissileDefinition,
  coord: [number, number] | null | undefined,
) {
  if (!coord) {
    return false
  }

  if (areCoordsEqual(definition.defaultLaunchCoord, coord)) {
    return true
  }

  return definition.knownLaunchSites.some((site) => areCoordsEqual(site.coord, coord))
}

export function resolveMissileLaunchCoord(
  definition: MissileDefinition,
  launchSiteByMissileId: ScenarioMissilesState['launchSiteByMissileId'] | undefined,
): [number, number] {
  const storedCoord = launchSiteByMissileId?.[definition.id]
  if (storedCoord && isValidLaunchSiteCoord(definition, storedCoord)) {
    return storedCoord
  }

  return definition.defaultLaunchCoord
}

export function getLaunchSiteOptions(definition: MissileDefinition): LaunchSiteOption[] {
  const seen = new Set<string>()
  const options: LaunchSiteOption[] = [
    {
      key: 'launch-site-default',
      value: DEFAULT_LAUNCH_SITE_VALUE,
      label: 'Default',
      coord: definition.defaultLaunchCoord,
      isDefault: true,
    },
  ]

  seen.add(serializeCoord(definition.defaultLaunchCoord))

  definition.knownLaunchSites.forEach((site, index) => {
    const coordKey = serializeCoord(site.coord)
    if (seen.has(coordKey)) {
      return
    }

    seen.add(coordKey)
    options.push({
      key: `launch-site-${index}-${coordKey}`,
      value: coordKey,
      label: site.name,
      coord: site.coord,
      isDefault: false,
    })
  })

  return options
}

export function getSelectedLaunchSiteValue(
  definition: MissileDefinition,
  launchSiteByMissileId: ScenarioMissilesState['launchSiteByMissileId'] | undefined,
) {
  const resolvedCoord = resolveMissileLaunchCoord(definition, launchSiteByMissileId)
  return areCoordsEqual(resolvedCoord, definition.defaultLaunchCoord)
    ? DEFAULT_LAUNCH_SITE_VALUE
    : serializeCoord(resolvedCoord)
}
