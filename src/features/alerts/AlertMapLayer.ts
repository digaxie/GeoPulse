import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import type OlMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import { getVectorContext } from 'ol/render'
import type RenderEvent from 'ol/render/Event'
import VectorSource from 'ol/source/Vector'

import {
  ALERT_LAYER_Z_INDEX,
  createAlertPulseStyles,
  createAlertStyle,
  createWarningStyle,
  getAlertColor,
} from '@/features/alerts/styles'
import { isAlertRecent, type AlertCityDetail, type RocketAlert } from '@/features/alerts/types'

export type WarningCityPoint = AlertCityDetail & {
  color: string
  family: 'early_warning' | 'incident_ended'
}

export type AlertBindings = {
  syncAlerts: (alerts: RocketAlert[]) => void
  setSelectedAlert: (alertId: string | null) => void
  setFocusedAlerts: (alerts: RocketAlert[] | null) => void
  setWarningCities: (cities: WarningCityPoint[] | null) => void
  clearAll: () => void
  destroy: () => void
}

function hasValidAlertCoordinate(lat: number, lon: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  )
}

function buildAlertFeature(alert: RocketAlert, selectedAlertId: string | null) {
  if (!hasValidAlertCoordinate(alert.lat, alert.lon)) {
    return null
  }

  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat([alert.lon, alert.lat])),
  })

  feature.set('alertId', alert.id)
  feature.set('alert', alert)
  feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), alert.id === selectedAlertId, true))
  return feature
}

function buildAlertFeatures(alert: RocketAlert, selectedAlertId: string | null): Feature<Point>[] {
  const cities = alert.citiesDetail
  if (!cities || cities.length <= 1) {
    const feature = buildAlertFeature(alert, selectedAlertId)
    return feature ? [feature] : []
  }

  return cities
    .filter((city) => hasValidAlertCoordinate(city.lat, city.lon))
    .map((city, index) => {
      const subAlert: RocketAlert = {
        ...alert,
        id: `${alert.id}__pin${index}`,
        englishName: city.name,
        lat: city.lat,
        lon: city.lon,
        areaNameEn: city.zone || city.name,
        countdownSec: city.countdown,
      }

      const feature = new Feature<Point>({
        geometry: new Point(fromLonLat([city.lon, city.lat])),
      })

      feature.set('alertId', alert.id)
      feature.set('alert', subAlert)
      feature.setStyle(createAlertStyle(subAlert, isAlertRecent(alert), alert.id === selectedAlertId, true))
      return feature
    })
}

export function createAlertLayer(map: OlMap) {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    zIndex: ALERT_LAYER_Z_INDEX,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
  })

  const featuresById = new Map<string, Feature<Point>>()
  const alertsById = new Map<string, RocketAlert>()
  let selectedAlertId: string | null = null
  let focusedAlerts: RocketAlert[] = []
  let focusedFeatures: Feature<Point>[] = []
  let warningFeatures: Feature<Point>[] = []

  const refreshAlertStyles = (parentId: string) => {
    const isSelected = parentId === selectedAlertId
    const keys = [...featuresById.keys()].filter(
      (key) => key === parentId || key.startsWith(`${parentId}__pin`),
    )

    if (keys.length === 0) return

    for (const key of keys) {
      const feature = featuresById.get(key)
      const alert = alertsById.get(key)
      if (!feature || !alert) continue

      feature.set('alert', alert)
      feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), isSelected, true))
    }
  }

  const syncFocusedAlertFeature = () => {
    const activeFocusedAlerts = focusedAlerts.filter((alert) => !alertsById.has(alert.id))

    for (const feature of focusedFeatures) {
      source.removeFeature(feature)
    }
    focusedFeatures = []

    if (activeFocusedAlerts.length === 0) {
      return
    }

    for (const activeFocusedAlert of activeFocusedAlerts) {
      const cities = activeFocusedAlert.citiesDetail
      if (cities && cities.length > 1) {
        for (const city of cities.filter((candidate) => hasValidAlertCoordinate(candidate.lat, candidate.lon))) {
          const subAlert: RocketAlert = {
            ...activeFocusedAlert,
            englishName: city.name,
            lat: city.lat,
            lon: city.lon,
            areaNameEn: city.zone || city.name,
            countdownSec: city.countdown,
          }
          const feature = new Feature<Point>({
            geometry: new Point(fromLonLat([city.lon, city.lat])),
          })
          feature.set('alertId', activeFocusedAlert.id)
          feature.set('alert', subAlert)
          feature.setStyle(createAlertStyle(subAlert, false, activeFocusedAlert.id === selectedAlertId, true))
          feature.set('isFocusedAlert', true)
          source.addFeature(feature)
          focusedFeatures.push(feature)
        }
        continue
      }

      if (!hasValidAlertCoordinate(activeFocusedAlert.lat, activeFocusedAlert.lon)) {
        continue
      }

      const feature = new Feature<Point>({
        geometry: new Point(fromLonLat([activeFocusedAlert.lon, activeFocusedAlert.lat])),
      })
      feature.set('alertId', activeFocusedAlert.id)
      feature.set('alert', activeFocusedAlert)
      feature.setStyle(createAlertStyle(activeFocusedAlert, false, activeFocusedAlert.id === selectedAlertId, true))
      feature.set('isFocusedAlert', true)
      source.addFeature(feature)
      focusedFeatures.push(feature)
    }
  }

  const handlePostRender = (event: RenderEvent) => {
    const now = Date.now()
    let hasAnimatedAlerts = false
    const vectorContext = getVectorContext(event)

    const seenAlertIds = new Set<string>()
    for (const alert of alertsById.values()) {
      if (!isAlertRecent(alert, now)) {
        continue
      }

      const parentId = alert.id.includes('__pin') ? alert.id.split('__pin')[0] : alert.id
      if (seenAlertIds.has(parentId)) continue
      seenAlertIds.add(parentId)

      const parentAlert = alertsById.get(parentId) ?? alert
      const cities = parentAlert.citiesDetail
      const color = getAlertColor(parentAlert.alertTypeId)
      const elapsed = now - parentAlert.occurredAtMs

      if (cities && cities.length > 1) {
        const validCities = cities.filter((city) => hasValidAlertCoordinate(city.lat, city.lon))
        if (validCities.length === 0) {
          continue
        }

        hasAnimatedAlerts = true
        for (const city of validCities) {
          const point = new Point(fromLonLat([city.lon, city.lat]))
          const styles = createAlertPulseStyles(color, elapsed)
          for (const style of styles) {
            vectorContext.setStyle(style)
            vectorContext.drawGeometry(point)
          }
        }
      } else if (hasValidAlertCoordinate(parentAlert.lat, parentAlert.lon)) {
        hasAnimatedAlerts = true
        const point = new Point(fromLonLat([parentAlert.lon, parentAlert.lat]))
        const styles = createAlertPulseStyles(color, elapsed)
        for (const style of styles) {
          vectorContext.setStyle(style)
          vectorContext.drawGeometry(point)
        }
      }
    }

    if (hasAnimatedAlerts) {
      map.render()
    }
  }

  layer.on('postrender', handlePostRender)

  const bindings: AlertBindings = {
    syncAlerts(alerts) {
      const nextIds = new Set(alerts.map((alert) => alert.id))

      for (const [featureKey, feature] of featuresById) {
        const parentId = featureKey.includes('__pin') ? featureKey.split('__pin')[0] : featureKey
        if (!nextIds.has(parentId)) {
          source.removeFeature(feature)
          featuresById.delete(featureKey)
          alertsById.delete(featureKey)
          alertsById.delete(parentId)
        }
      }

      for (const alert of alerts) {
        const previousKeys = [...featuresById.keys()].filter(
          (key) => key === alert.id || key.startsWith(`${alert.id}__pin`),
        )

        alertsById.set(alert.id, alert)

        const nextFeatures = buildAlertFeatures(alert, selectedAlertId)
        const nextKeys = nextFeatures.map((_, index) =>
          nextFeatures.length > 1 ? `${alert.id}__pin${index}` : alert.id,
        )

        const previousKeySet = new Set(previousKeys)
        const nextKeySet = new Set(nextKeys)

        for (const previousKey of previousKeys) {
          if (!nextKeySet.has(previousKey)) {
            const oldFeature = featuresById.get(previousKey)
            if (oldFeature) source.removeFeature(oldFeature)
            featuresById.delete(previousKey)
            alertsById.delete(previousKey)
          }
        }

        for (let index = 0; index < nextFeatures.length; index += 1) {
          const key = nextKeys[index]
          const feature = nextFeatures[index]
          if (previousKeySet.has(key)) {
            const existing = featuresById.get(key)
            if (!existing) {
              continue
            }
            const subAlert = feature.get('alert') as RocketAlert
            existing.setGeometry(feature.getGeometry()!)
            existing.set('alert', subAlert)
            existing.setStyle(createAlertStyle(subAlert, isAlertRecent(alert), alert.id === selectedAlertId, true))
          } else {
            featuresById.set(key, feature)
            if (feature.get('alert')) {
              alertsById.set(key, feature.get('alert') as RocketAlert)
            }
            source.addFeature(feature)
          }
        }
      }

      syncFocusedAlertFeature()
    },

    setSelectedAlert(alertId) {
      const previousSelectedId = selectedAlertId
      selectedAlertId = alertId

      if (previousSelectedId) {
        refreshAlertStyles(previousSelectedId)
      }
      if (selectedAlertId) {
        refreshAlertStyles(selectedAlertId)
      }

      syncFocusedAlertFeature()
    },

    setFocusedAlerts(alerts) {
      focusedAlerts = alerts ?? []
      syncFocusedAlertFeature()
    },

    setWarningCities(cities) {
      for (const feature of warningFeatures) {
        source.removeFeature(feature)
      }
      warningFeatures = []

      if (!cities || cities.length === 0) {
        source.changed()
        layer.changed()
        map.render()
        return
      }

      for (const city of cities) {
        if (!hasValidAlertCoordinate(city.lat, city.lon)) continue
        const feature = new Feature<Point>({
          geometry: new Point(fromLonLat([city.lon, city.lat])),
        })
        feature.set('warningCity', true)
        feature.setStyle(createWarningStyle(city.name, false, city.color))
        source.addFeature(feature)
        warningFeatures.push(feature)
      }

      source.changed()
      layer.changed()
      map.render()
    },

    clearAll() {
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlerts = []
      focusedFeatures = []
      warningFeatures = []
      source.clear()
    },

    destroy() {
      layer.un('postrender', handlePostRender)
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlerts = []
      focusedFeatures = []
      warningFeatures = []
      source.clear()
    },
  }

  return {
    layer,
    bindings,
  }
}
