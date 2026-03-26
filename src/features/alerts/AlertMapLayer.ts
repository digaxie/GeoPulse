import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import type OlMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import { getVectorContext } from 'ol/render'
import type RenderEvent from 'ol/render/Event'
import VectorSource from 'ol/source/Vector'

import { createAlertPulseStyles, createAlertStyle, createWarningStyle, getAlertColor, ALERT_LAYER_Z_INDEX } from '@/features/alerts/styles'
import { isAlertRecent, type AlertCityDetail, type RocketAlert } from '@/features/alerts/types'

export type AlertBindings = {
  syncAlerts: (alerts: RocketAlert[]) => void
  setSelectedAlert: (alertId: string | null) => void
  setFocusedAlert: (alert: RocketAlert | null) => void
  setWarningCities: (cities: AlertCityDetail[] | null, color?: string) => void
  clearAll: () => void
  destroy: () => void
}

function buildAlertFeature(alert: RocketAlert, selectedAlertId: string | null) {
  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat([alert.lon, alert.lat])),
  })

  feature.set('alertId', alert.id)
  feature.set('alert', alert)
  // Tekli alarm → her zaman label göster
  feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), alert.id === selectedAlertId, true))
  return feature
}

/** citiesDetail varsa her şehir için ayrı feature oluştur, yoksa tek feature */
function buildAlertFeatures(alert: RocketAlert, selectedAlertId: string | null): Feature<Point>[] {
  const cities = alert.citiesDetail
  if (!cities || cities.length <= 1) {
    return [buildAlertFeature(alert, selectedAlertId)]
  }

  return cities.map((city, i) => {
    const subAlert: RocketAlert = {
      ...alert,
      id: `${alert.id}__pin${i}`,
      englishName: city.name,
      lat: city.lat,
      lon: city.lon,
      areaNameEn: city.zone || city.name,
      countdownSec: city.countdown,
    }
    const feature = new Feature<Point>({
      geometry: new Point(fromLonLat([city.lon, city.lat])),
    })
    feature.set('alertId', alert.id) // tıklayınca parent alert seçilsin
    feature.set('alert', subAlert)
    feature.setStyle(createAlertStyle(subAlert, isAlertRecent(alert), alert.id === selectedAlertId))
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
  let focusedAlert: RocketAlert | null = null
  let focusedFeatures: Feature<Point>[] = []
  let warningFeatures: Feature<Point>[] = []

  const refreshAlertStyles = (parentId: string) => {
    // Parent ID'ye ait tüm feature'ları bul ve stillerini güncelle
    const isSelected = parentId === selectedAlertId
    const keys = [...featuresById.keys()].filter(
      (k) => k === parentId || k.startsWith(`${parentId}__pin`),
    )

    if (keys.length === 0) return

    const isSinglePin = keys.length === 1 && !keys[0].includes('__pin')

    for (const key of keys) {
      const feature = featuresById.get(key)
      const alert = alertsById.get(key)
      if (!feature || !alert) continue

      feature.set('alert', alert)
      // Tekli pin → her zaman label; çoklu pin → seçiliyse label
      feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), isSelected, isSinglePin || isSelected))
    }
  }

  const syncFocusedAlertFeature = () => {
    const activeFocusedAlert = focusedAlert && !alertsById.has(focusedAlert.id) ? focusedAlert : null

    // Önceki focused feature'ları temizle
    for (const f of focusedFeatures) {
      source.removeFeature(f)
    }
    focusedFeatures = []

    if (!activeFocusedAlert) return

    const cities = activeFocusedAlert.citiesDetail
    if (cities && cities.length > 1) {
      // Her şehir için ayrı pin
      for (const city of cities) {
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
        feature.setStyle(createAlertStyle(subAlert, false, activeFocusedAlert.id === selectedAlertId))
        feature.set('isFocusedAlert', true)
        source.addFeature(feature)
        focusedFeatures.push(feature)
      }
    } else {
      // Tek pin
      const feature = new Feature<Point>({
        geometry: new Point(fromLonLat([activeFocusedAlert.lon, activeFocusedAlert.lat])),
      })
      feature.set('alertId', activeFocusedAlert.id)
      feature.set('alert', activeFocusedAlert)
      feature.setStyle(createAlertStyle(activeFocusedAlert, false, activeFocusedAlert.id === selectedAlertId))
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
      // Parent alert'ı bir kere işle (sub-pin'ler aynı parent'a sahip)
      const parentId = alert.id.includes('__pin') ? alert.id.split('__pin')[0] : alert.id
      if (seenAlertIds.has(parentId)) continue
      seenAlertIds.add(parentId)

      // Parent alert'ı bul (citiesDetail'li orijinal)
      const parentAlert = alertsById.get(parentId) ?? alert
      const cities = parentAlert.citiesDetail
      const color = getAlertColor(parentAlert.alertTypeId)
      const elapsed = now - parentAlert.occurredAtMs

      hasAnimatedAlerts = true
      if (cities && cities.length > 1) {
        for (const city of cities) {
          const point = new Point(fromLonLat([city.lon, city.lat]))
          const styles = createAlertPulseStyles(color, elapsed)
          for (const style of styles) {
            vectorContext.setStyle(style)
            vectorContext.drawGeometry(point)
          }
        }
      } else {
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

      // Eski feature'ları temizle (artık olmayan alert'lar)
      for (const [featureKey, feature] of featuresById) {
        const parentId = featureKey.includes('__pin') ? featureKey.split('__pin')[0] : featureKey
        if (!nextIds.has(parentId)) {
          source.removeFeature(feature)
          featuresById.delete(featureKey)
          alertsById.delete(featureKey)
          // Multi-pin alert'larda parent entry de temizlenmeli
          alertsById.delete(parentId)
        }
      }

      for (const alert of alerts) {
        // Önceki feature'ları bu alert için temizle (citiesDetail değişmiş olabilir)
        const prevKeys = [...featuresById.keys()].filter(
          (k) => k === alert.id || k.startsWith(`${alert.id}__pin`),
        )

        alertsById.set(alert.id, alert)

        const newFeatures = buildAlertFeatures(alert, selectedAlertId)
        const newKeys = newFeatures.map((_, i) =>
          newFeatures.length > 1 ? `${alert.id}__pin${i}` : alert.id,
        )

        // Aynı key'ler varsa güncelle, yoksa yeniden oluştur
        const prevKeySet = new Set(prevKeys)
        const newKeySet = new Set(newKeys)

        for (const pk of prevKeys) {
          if (!newKeySet.has(pk)) {
            const old = featuresById.get(pk)
            if (old) source.removeFeature(old)
            featuresById.delete(pk)
            alertsById.delete(pk)
          }
        }

        for (let i = 0; i < newFeatures.length; i++) {
          const key = newKeys[i]
          const feature = newFeatures[i]
          if (prevKeySet.has(key)) {
            const existing = featuresById.get(key)!
            const subAlert = feature.get('alert') as RocketAlert
            existing.setGeometry(feature.getGeometry()!)
            existing.set('alert', subAlert)
            existing.setStyle(createAlertStyle(subAlert, isAlertRecent(alert), alert.id === selectedAlertId, newFeatures.length === 1))
          } else {
            featuresById.set(key, feature)
            if (feature.get('alert')) alertsById.set(key, feature.get('alert') as RocketAlert)
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

    setFocusedAlert(alert) {
      focusedAlert = alert
      syncFocusedAlertFeature()
    },

    setWarningCities(cities, color) {
      // Önceki warning feature'ları temizle
      for (const f of warningFeatures) {
        source.removeFeature(f)
      }
      warningFeatures = []

      if (!cities || cities.length === 0) return

      for (const city of cities) {
        if (city.lat === 0 && city.lon === 0) continue
        const feature = new Feature<Point>({
          geometry: new Point(fromLonLat([city.lon, city.lat])),
        })
        feature.set('warningCity', true)
        feature.setStyle(createWarningStyle(city.name, false, color))
        source.addFeature(feature)
        warningFeatures.push(feature)
      }
    },

    clearAll() {
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlert = null
      focusedFeatures = []
      warningFeatures = []
      source.clear()
    },

    destroy() {
      layer.un('postrender', handlePostRender)
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlert = null
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
