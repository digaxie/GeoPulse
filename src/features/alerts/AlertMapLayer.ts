import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import type OlMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import { getVectorContext } from 'ol/render'
import type RenderEvent from 'ol/render/Event'
import VectorSource from 'ol/source/Vector'

import { createAlertPulseStyles, createAlertStyle, getAlertColor, ALERT_LAYER_Z_INDEX } from '@/features/alerts/styles'
import { isAlertRecent, type RocketAlert } from '@/features/alerts/types'

export type AlertBindings = {
  syncAlerts: (alerts: RocketAlert[]) => void
  setSelectedAlert: (alertId: string | null) => void
  setFocusedAlert: (alert: RocketAlert | null) => void
  clearAll: () => void
  destroy: () => void
}

function buildAlertFeature(alert: RocketAlert, selectedAlertId: string | null) {
  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat([alert.lon, alert.lat])),
  })

  feature.set('alertId', alert.id)
  feature.set('alert', alert)
  feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), alert.id === selectedAlertId))
  return feature
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
  let focusedFeature: Feature<Point> | null = null

  const refreshFeatureStyle = (alertId: string) => {
    const feature = featuresById.get(alertId)
    const alert = alertsById.get(alertId)
    if (!feature || !alert) {
      return
    }

    feature.set('alert', alert)
    feature.setStyle(createAlertStyle(alert, isAlertRecent(alert), alertId === selectedAlertId))
  }

  const syncFocusedAlertFeature = () => {
    const activeFocusedAlert = focusedAlert && !alertsById.has(focusedAlert.id) ? focusedAlert : null

    if (!activeFocusedAlert) {
      if (focusedFeature) {
        source.removeFeature(focusedFeature)
        focusedFeature = null
      }
      return
    }

    if (!focusedFeature) {
      focusedFeature = new Feature<Point>({
        geometry: new Point(fromLonLat([activeFocusedAlert.lon, activeFocusedAlert.lat])),
      })
      focusedFeature.set('alertId', activeFocusedAlert.id)
      focusedFeature.set('alert', activeFocusedAlert)
      focusedFeature.setStyle(
        createAlertStyle(activeFocusedAlert, false, activeFocusedAlert.id === selectedAlertId),
      )
      focusedFeature.set('isFocusedAlert', true)
      source.addFeature(focusedFeature)
      return
    }

    focusedFeature.set('alertId', activeFocusedAlert.id)
    focusedFeature.set('alert', activeFocusedAlert)
    focusedFeature.setGeometry(new Point(fromLonLat([activeFocusedAlert.lon, activeFocusedAlert.lat])))
    focusedFeature.setStyle(createAlertStyle(activeFocusedAlert, false, activeFocusedAlert.id === selectedAlertId))
  }

  const handlePostRender = (event: RenderEvent) => {
    const now = Date.now()
    let hasAnimatedAlerts = false
    const vectorContext = getVectorContext(event)

    for (const alert of alertsById.values()) {
      if (!isAlertRecent(alert, now)) {
        continue
      }

      hasAnimatedAlerts = true
      const point = new Point(fromLonLat([alert.lon, alert.lat]))
      const styles = createAlertPulseStyles(getAlertColor(alert.alertTypeId), now - alert.occurredAtMs)
      for (const style of styles) {
        vectorContext.setStyle(style)
        vectorContext.drawGeometry(point)
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

      for (const [alertId, feature] of featuresById) {
        if (nextIds.has(alertId)) {
          continue
        }

        source.removeFeature(feature)
        featuresById.delete(alertId)
        alertsById.delete(alertId)
      }

      for (const alert of alerts) {
        const existing = featuresById.get(alert.id)
        alertsById.set(alert.id, alert)
        if (!existing) {
          const feature = buildAlertFeature(alert, selectedAlertId)
          featuresById.set(alert.id, feature)
          source.addFeature(feature)
          continue
        }

        existing.setGeometry(new Point(fromLonLat([alert.lon, alert.lat])))
        refreshFeatureStyle(alert.id)
      }

      syncFocusedAlertFeature()
    },

    setSelectedAlert(alertId) {
      const previousSelectedId = selectedAlertId
      selectedAlertId = alertId

      if (previousSelectedId) {
        refreshFeatureStyle(previousSelectedId)
      }
      if (selectedAlertId) {
        refreshFeatureStyle(selectedAlertId)
      }

      syncFocusedAlertFeature()
    },

    setFocusedAlert(alert) {
      focusedAlert = alert
      syncFocusedAlertFeature()
    },

    clearAll() {
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlert = null
      focusedFeature = null
      source.clear()
    },

    destroy() {
      layer.un('postrender', handlePostRender)
      featuresById.clear()
      alertsById.clear()
      selectedAlertId = null
      focusedAlert = null
      focusedFeature = null
      source.clear()
    },
  }

  return {
    layer,
    bindings,
  }
}
