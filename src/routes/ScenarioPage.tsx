import { useEffect, useRef, useState, type WheelEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { ConflictMap } from '@/components/map/ConflictMap'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'
import { AssetLibraryPanel } from '@/components/panels/AssetLibraryPanel'
import { BriefingPanel } from '@/components/panels/BriefingPanel'
import { InspectorPanel } from '@/components/panels/InspectorPanel'
import { TextControls } from '@/components/panels/TextControls'
import { ToolDock } from '@/components/panels/ToolDock'
import { VersionHistoryPanel } from '@/components/panels/VersionHistoryPanel'
import { AlertsPanel } from '@/features/alerts/AlertsPanel'
import { SystemMessageBanner } from '@/features/alerts/SystemMessageBanner'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useAssets } from '@/features/assets/useAssets'
import { useAuth } from '@/features/auth/useAuth'
import { MissilePanel } from '@/features/missiles/MissilePanel'
import {
  getActiveBriefingSlide,
  getVisibleElementIdsForActiveSlide,
  isElementVisibleOnSlide,
} from '@/features/scenario/briefing'
import { useScenarioStore } from '@/features/scenario/store'
import { serializeScenarioTransfer } from '@/features/scenario/transfer'
import { useScenarioRuntime } from '@/features/scenario/useScenarioRuntime'
import { backendClient } from '@/lib/backend'
import type { ScenarioSnapshotRecord } from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { downloadTextFile, formatRelativeDate, slugifyFileName } from '@/lib/utils'

type PanelKey = 'tools' | 'text' | 'assets' | 'missiles' | 'alerts' | 'briefing' | 'history' | 'settings' | 'share'

const PANELS: { key: PanelKey; label: string }[] = [
  { key: 'tools', label: 'Araclar' },
  { key: 'text', label: 'Metin' },
  { key: 'assets', label: 'Varliklar' },
  { key: 'missiles', label: 'Fuzeler' },
  { key: 'alerts', label: 'Alarmlar' },
  { key: 'briefing', label: 'Briefing' },
  { key: 'history', label: 'Gecmis' },
  { key: 'settings', label: 'Ayarlar' },
  { key: 'share', label: 'Sunum' },
]

type PanelGlyphProps = {
  name: PanelKey
}

function PanelGlyph({ name }: PanelGlyphProps) {
  const commonProps = {
    className: 'sidebar-icon-glyph',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'tools':
      return (
        <svg {...commonProps} viewBox="0 0 16 16" fill="currentColor" stroke="none">
          <path d="M14.25 10.71 11.57 8l2.26-2.26a2.49 2.49 0 0 0 0-3.53 2.5 2.5 0 0 0-3.53 0l-.89.88L8 4.5 5.28 1.75a1.26 1.26 0 0 0-1.76 0L1.75 3.52a1.25 1.25 0 0 0 0 1.77L4.5 8l-.22.22-.89.88-1.75 3.66a1.25 1.25 0 0 0 1.67 1.67l3.62-1.75.49-.49.39-.39.19-.23 2.68 2.68a1.26 1.26 0 0 0 1.76 0l1.77-1.77a1.25 1.25 0 0 0 .04-1.77zm-2.19-8a1.27 1.27 0 0 1 .89.36 1.25 1.25 0 0 1 0 1.77l-1.77-1.72a1.27 1.27 0 0 1 .88-.36zM2.63 4.4 4.4 2.64l.82.82-.87.88.88.88.88-.88 1 1-1.73 1.81zm.13 8.91 1.57-3.23L6 11.74zm4.17-2.4L5.16 9.14 10.3 4l1.76 1.76zm4.67 2.45-2.68-2.67 1.77-1.77.93.93-.88.88.88.89.89-.89.86.87z" />
        </svg>
      )
    case 'text':
      return (
        <svg {...commonProps} viewBox="0 0 16 16" fill="currentColor" stroke="none">
          <path fillRule="evenodd" clipRule="evenodd" d="M15 1H1V15H15V1ZM3 3V7H5V5H7V11H5V13H11V11H9V5H11V7H13V3H3Z" />
        </svg>
      )
    case 'assets':
      return (
        <svg {...commonProps}>
          <path d="M5 21V3.9C5 3.9 5.875 3 8.5 3C11.125 3 12.875 4.8 15.5 4.8C18.125 4.8 19 3.9 19 3.9V14.7C19 14.7 18.125 15.6 15.5 15.6C12.875 15.6 11.125 13.8 8.5 13.8C5.875 13.8 5 14.7 5 14.7" />
        </svg>
      )
    case 'missiles':
      return (
        <svg {...commonProps} viewBox="0 0 512 512" fill="currentColor" stroke="none">
          <path d="M17.34 17.38v34.08C37.24 85.91 61.4 120.5 95.03 151c6.97 24.6 23.57 43.7 46.27 53.9-5.9-8.2-9.4-18.1-9.6-30.1 12 .1 21.9 3.7 30.1 9.6-10.1-22.5-28.7-39-52.9-46-40.28-36.2-66.64-78.82-89.03-121.02zm26.96 0C98.65 32.32 173.5 71.74 240.5 124.5l16.3-11.6C205.6 71.81 149.6 38.58 99.97 17.38zm110.1 0c28.4 8.14 52.8 19.57 75.3 32.83 13 21.96 34.1 36.14 58.6 40.15-7.8-6.38-13.7-15.05-17-26.58 11.7-2.98 22.1-2.09 31.5 1.46-15.5-19.08-37.8-30.23-63-30.76-10.3-6.07-21-11.82-32.3-17.1zm171.3 4.96L321 71.62c-6.1 10.46-12.1 20.92-18.2 31.38-14.6 11.2-26.3 18.7-40.6 29l39.6 22.8h.1l38.3-13.9c37.3 28.7 84.7 43.6 133.5 39.8-21.2-44.6-57.8-78.2-101.5-96.03l-7-39.5zM194.9 148.8l-17.2 46.4c-8.6 8.4-17.2 17.1-25.7 25.7-14.9 5.8-31.2 11.8-46.6 17.5l32.3 32.3 40.6-3.5c28.6 37.3 70.5 64 118.6 72.9-8.9-48.5-35.6-90.5-73.1-119l3.4-40zm123.3 20l-18.2 6.6c17.1 17.7 33.5 38.1 44.3 52.6 1.1 24.4 12.1 46.1 30.6 61.3-3.5-9.5-4.3-19.9-1.4-31.6 11.6 3.3 20.2 9.3 26.6 17.1-4.1-25.4-19-47-42.3-59.9-12-15.9-25.3-31.3-39.6-46.1zM17.34 247.2v49.7c14.05 24.6 33.51 44.5 56.99 61 12.88 23.6 34.67 38.8 60.27 43-7.8-6.4-13.8-15.1-17.1-26.6 11.7-3 22.2-2.1 31.6 1.5-15-18.5-36.3-29.5-60.47-30.7-35.62-23.9-60.18-54.2-71.29-97.9zM441.3 249l-28.7 40.4c-10.5 6-20.9 12.1-31.4 18.1-16.1 1.9-33.2 3.3-49.6 4.8l22.9 39.6 40.1 7.1c17.9 43.5 51.5 80.1 95.7 101.2 4-49.2-10.9-96.7-39.9-133.9l13.7-37.7zm-269.4 83.9l-4.6 49.3c-6.1 10.3-12.2 20.9-18.2 31.4-13 9.6-27 19.4-40.5 28.9l39.6 22.9 38.3-13.9c37.3 28.7 84.6 43.6 133.4 39.8-21.1-44.7-57.7-78.3-101.4-96.1l-7-39.5z" />
        </svg>
      )
    case 'alerts':
      return (
        <svg {...commonProps} fill="currentColor" stroke="none">
          <path d="M5,15.5c-0.6,0.5-1,1.2-1,2C4,18.9,5.1,20,6.5,20h2.7c0.4,1.2,1.5,2,2.8,2s2.4-0.8,2.8-2h2.7c1.4,0,2.5-1.1,2.5-2.5c0-0.8-0.4-1.5-1-2V10c0-1.9-0.7-3.6-2.1-4.9c-0.4-0.4-0.9-0.8-1.4-1.1c-2.1-1.2-4.9-1.2-7,0C6.3,5.2,5,7.5,5,10V15.5z M17.5,18H14h-4H6.5C6.2,18,6,17.8,6,17.5S6.2,17,6.5,17h11c0.3,0,0.5,0.2,0.5,0.5S17.8,18,17.5,18z M7,10c0-1.8,1-3.4,2.5-4.3c1.5-0.9,3.5-0.9,5,0c0.4,0.2,0.7,0.5,1,0.8C16.5,7.4,17,8.7,17,10v5H7V10z" />
          <path d="M18.5,4.4c0.3,0.3,0.6,0.6,0.8,1c0.2,0.4,0.4,0.8,0.5,1.2c0.1,0.4,0.5,0.7,1,0.7c0.1,0,0.2,0,0.3,0c0.5-0.1,0.9-0.7,0.7-1.2c-0.2-0.6-0.4-1.2-0.7-1.7c-0.3-0.5-0.7-1-1.1-1.4c-0.3-0.3-0.6-0.6-1-0.8c-0.5-0.3-1.1-0.2-1.4,0.3c-0.3,0.5-0.2,1.1,0.3,1.4C18.1,4,18.3,4.2,18.5,4.4z" />
          <path d="M2.9,6.9C3,7,3.1,7,3.2,7C3.6,7,4,6.7,4.1,6.3c0.1-0.4,0.3-0.8,0.6-1.1C5,4.8,5.2,4.5,5.6,4.3C5.8,4.1,6,3.9,6.3,3.8c0.5-0.3,0.7-0.9,0.4-1.4C6.4,1.9,5.8,1.8,5.3,2c-0.4,0.2-0.8,0.5-1,0.7C3.8,3.1,3.4,3.6,3.1,4.1c-0.3,0.5-0.6,1-0.8,1.6C2.1,6.2,2.3,6.8,2.9,6.9z" />
        </svg>
      )
    case 'briefing':
      return (
        <svg {...commonProps} viewBox="-5 0 32 32" fill="currentColor" stroke="none">
          <g transform="translate(-263,-101)">
            <path d="M280,113 L268,113 C267.448,113 267,112.553 267,112 C267,111.448 267.448,111 268,111 L280,111 C280.552,111 281,111.448 281,112 C281,112.553 280.552,113 280,113 L280,113 Z M280,119 L268,119 C267.448,119 267,118.553 267,118 C267,117.448 267.448,117 268,117 L280,117 C280.552,117 281,117.448 281,118 C281,118.553 280.552,119 280,119 L280,119 Z M280,125 L268,125 C267.448,125 267,124.553 267,124 C267,123.447 267.448,123 268,123 L280,123 C280.552,123 281,123.447 281,124 C281,124.553 280.552,125 280,125 L280,125 Z M281,103 L281,101 L279,101 L279,103 L275,103 L275,101 L273,101 L273,103 L269,103 L269,101 L267,101 L267,103 C264.791,103 263,104.791 263,107 L263,129 C263,131.209 264.791,133 267,133 L281,133 C283.209,133 285,131.209 285,129 L285,107 C285,104.791 283.209,103 281,103 L281,103 Z" />
          </g>
        </svg>
      )
    case 'history':
      return (
        <svg {...commonProps} fill="currentColor" stroke="none">
          <path d="M3 5.67541V3C3 2.44772 2.55228 2 2 2C1.44772 2 1 2.44772 1 3V7C1 8.10457 1.89543 9 3 9H7C7.55229 9 8 8.55229 8 8C8 7.44772 7.55229 7 7 7H4.52186C4.54218 6.97505 4.56157 6.94914 4.57995 6.92229C5.621 5.40094 7.11009 4.22911 8.85191 3.57803C10.9074 2.80968 13.173 2.8196 15.2217 3.6059C17.2704 4.3922 18.9608 5.90061 19.9745 7.8469C20.9881 9.79319 21.2549 12.043 20.7247 14.1724C20.1945 16.3018 18.9039 18.1638 17.0959 19.4075C15.288 20.6513 13.0876 21.1909 10.9094 20.9247C8.73119 20.6586 6.72551 19.605 5.27028 17.9625C4.03713 16.5706 3.27139 14.8374 3.06527 13.0055C3.00352 12.4566 2.55674 12.0079 2.00446 12.0084C1.45217 12.0088 0.995668 12.4579 1.04626 13.0078C1.25994 15.3309 2.2082 17.5356 3.76666 19.2946C5.54703 21.3041 8.00084 22.5931 10.6657 22.9188C13.3306 23.2444 16.0226 22.5842 18.2345 21.0626C20.4464 19.541 22.0254 17.263 22.6741 14.6578C23.3228 12.0526 22.9963 9.30013 21.7562 6.91897C20.5161 4.53782 18.448 2.69239 15.9415 1.73041C13.4351 0.768419 10.6633 0.756291 8.14853 1.69631C6.06062 2.47676 4.26953 3.86881 3 5.67541Z" />
          <path d="M12 5C11.4477 5 11 5.44771 11 6V12.4667C11 12.4667 11 12.7274 11.1267 12.9235C11.2115 13.0898 11.3437 13.2344 11.5174 13.3346L16.1372 16.0019C16.6155 16.278 17.2271 16.1141 17.5032 15.6358C17.7793 15.1575 17.6155 14.546 17.1372 14.2698L13 11.8812V6C13 5.44772 12.5523 5 12 5Z" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...commonProps} viewBox="0 0 30 30" fill="currentColor" stroke="none">
          <g transform="translate(-101,-360)">
            <path d="M128.52,381.134 L127.528,382.866 C127.254,383.345 126.648,383.508 126.173,383.232 L123.418,381.628 C122.02,383.219 120.129,384.359 117.983,384.799 L117.983,387 C117.983,387.553 117.54,388 116.992,388 L115.008,388 C114.46,388 114.017,387.553 114.017,387 L114.017,384.799 C111.871,384.359 109.98,383.219 108.582,381.628 L105.827,383.232 C105.352,383.508 104.746,383.345 104.472,382.866 L103.48,381.134 C103.206,380.656 103.369,380.044 103.843,379.769 L106.609,378.157 C106.28,377.163 106.083,376.106 106.083,375 C106.083,373.894 106.28,372.838 106.609,371.843 L103.843,370.232 C103.369,369.956 103.206,369.345 103.48,368.866 L104.472,367.134 C104.746,366.656 105.352,366.492 105.827,366.768 L108.582,368.372 C109.98,366.781 111.871,365.641 114.017,365.201 L114.017,363 C114.017,362.447 114.46,362 115.008,362 L116.992,362 C117.54,362 117.983,362.447 117.983,363 L117.983,365.201 C120.129,365.641 122.02,366.781 123.418,368.372 L126.173,366.768 C126.648,366.492 127.254,366.656 127.528,367.134 L128.52,368.866 C128.794,369.345 128.631,369.956 128.157,370.232 L125.391,371.843 C125.72,372.838 125.917,373.894 125.917,375 C125.917,376.106 125.72,377.163 125.391,378.157 L128.157,379.769 C128.631,380.044 128.794,380.656 128.52,381.134 L128.52,381.134 Z M130.008,378.536 L127.685,377.184 C127.815,376.474 127.901,375.749 127.901,375 C127.901,374.252 127.815,373.526 127.685,372.816 L130.008,371.464 C130.957,370.912 131.281,369.688 130.733,368.732 L128.75,365.268 C128.203,364.312 126.989,363.983 126.041,364.536 L123.694,365.901 C122.598,364.961 121.352,364.192 119.967,363.697 L119.967,362 C119.967,360.896 119.079,360 117.983,360 L114.017,360 C112.921,360 112.033,360.896 112.033,362 L112.033,363.697 C110.648,364.192 109.402,364.961 108.306,365.901 L105.959,364.536 C105.011,363.983 103.797,364.312 103.25,365.268 L101.267,368.732 C100.719,369.688 101.044,370.912 101.992,371.464 L104.315,372.816 C104.185,373.526 104.099,374.252 104.099,375 C104.099,375.749 104.185,376.474 104.315,377.184 L101.992,378.536 C101.044,379.088 100.719,380.312 101.267,381.268 L103.25,384.732 C103.797,385.688 105.011,386.017 105.959,385.464 L108.306,384.099 C109.402,385.039 110.648,385.809 112.033,386.303 L112.033,388 C112.033,389.104 112.921,390 114.017,390 L117.983,390 C119.079,390 119.967,389.104 119.967,388 L119.967,386.303 C121.352,385.809 122.598,385.039 123.694,384.099 L126.041,385.464 C126.989,386.017 128.203,385.688 128.75,384.732 L130.733,381.268 C131.281,380.312 130.957,379.088 130.008,378.536 L130.008,378.536 Z M116,378 C114.357,378 113.025,376.657 113.025,375 C113.025,373.344 114.357,372 116,372 C117.643,372 118.975,373.344 118.975,375 C118.975,376.657 117.643,378 116,378 L116,378 Z M116,370 C113.261,370 111.042,372.238 111.042,375 C111.042,377.762 113.261,380 116,380 C118.739,380 120.959,377.762 120.959,375 C120.959,372.238 118.739,370 116,370 L116,370 Z" />
          </g>
        </svg>
      )
    case 'share':
      return (
        <svg {...commonProps}>
          <path d="M3 3H5M21 3H19M12 18L7 21M12 18L17 21M12 18V21M12 18V15M19 3V11.8C19 12.9201 19 13.4802 18.782 13.908C18.5903 14.2843 18.2843 14.5903 17.908 14.782C17.4802 15 16.9201 15 15.8 15H12M19 3H5M5 3V11.8C5 12.9201 5 13.4802 5.21799 13.908C5.40973 14.2843 5.71569 14.5903 6.09202 14.782C6.51984 15 7.0799 15 8.2 15H12M8 10L11 7L13 10L16 7" />
        </svg>
      )
    default:
      return null
  }
}

export function ScenarioPage() {
  const params = useParams<{ scenarioId: string }>()
  const scenarioId = params.scenarioId ?? ''
  const hasScenarioId = Boolean(params.scenarioId)
  const { session, isLoading } = useAuth()
  const sessionUserId = session?.id ?? null
  const title = useScenarioStore((state) => state.title)
  const setTitle = useScenarioStore((state) => state.setTitle)
  const viewerSlug = useScenarioStore((state) => state.viewerSlug)
  const document = useScenarioStore((state) => state.document)
  const selectedElementId = useScenarioStore((state) => state.selectedElementId)
  const activeAssetId = useScenarioStore((state) => state.activeAssetId)
  const lock = useScenarioStore((state) => state.lock)
  const saveState = useScenarioStore((state) => state.saveState)
  const lastSavedRevision = useScenarioStore((state) => state.lastSavedRevision)
  const penColor = useScenarioStore((state) => state.penColor)
  const setPenColor = useScenarioStore((state) => state.setPenColor)
  const eraserSize = useScenarioStore((state) => state.eraserSize)
  const setEraserSize = useScenarioStore((state) => state.setEraserSize)
  const setTool = useScenarioStore((state) => state.setTool)
  const setActiveAssetId = useScenarioStore((state) => state.setActiveAssetId)
  const textDefaults = useScenarioStore((state) => state.textDefaults)
  const setTextDefault = useScenarioStore((state) => state.setTextDefault)
  const setBasemapPreset = useScenarioStore((state) => state.setBasemapPreset)
  const setLabelOption = useScenarioStore((state) => state.setLabelOption)
  const setStylePref = useScenarioStore((state) => state.setStylePref)
  const createSlideFromCurrentView = useScenarioStore((state) => state.createSlideFromCurrentView)
  const duplicateSlide = useScenarioStore((state) => state.duplicateSlide)
  const deleteSlide = useScenarioStore((state) => state.deleteSlide)
  const moveSlideUp = useScenarioStore((state) => state.moveSlideUp)
  const moveSlideDown = useScenarioStore((state) => state.moveSlideDown)
  const setActiveSlide = useScenarioStore((state) => state.setActiveSlide)
  const renameSlide = useScenarioStore((state) => state.renameSlide)
  const updateSlideNotes = useScenarioStore((state) => state.updateSlideNotes)
  const setElementVisibilityOnSlide = useScenarioStore((state) => state.setElementVisibilityOnSlide)
  const setViewerSlug = useScenarioStore((state) => state.setViewerSlug)
  const updateSelectedElementStyle = useScenarioStore((state) => state.updateSelectedElementStyle)
  const updateSelectedElementNumeric = useScenarioStore((state) => state.updateSelectedElementNumeric)
  const updateElement = useScenarioStore((state) => state.updateElement)
  const removeSelectedElement = useScenarioStore((state) => state.removeSelectedElement)
  const clearAllElements = useScenarioStore((state) => state.clearAllElements)
  const toggleSelectedLock = useScenarioStore((state) => state.toggleSelectedLock)
  const bringSelectedForward = useScenarioStore((state) => state.bringSelectedForward)
  const sendSelectedBackward = useScenarioStore((state) => state.sendSelectedBackward)
  const undo = useScenarioStore((state) => state.undo)
  const redo = useScenarioStore((state) => state.redo)
  const backfillAssetSnapshots = useScenarioStore((state) => state.backfillUploadedAssetSnapshots)
  const initializeScenario = useScenarioStore((state) => state.initialize)
  const undoCount = useScenarioStore((state) => state.history.length)
  const redoCount = useScenarioStore((state) => state.future.length)
  const { assets, isLoading: loadingAssets, error: assetsError, uploadAsset } = useAssets()

  const runtime = useScenarioRuntime({ mode: 'editor', scenarioId })
  const shareSectionRef = useRef<HTMLDivElement | null>(null)
  const sidebarIconBarRef = useRef<HTMLElement | null>(null)

  const [activePanel, setActivePanel] = useState<PanelKey | null>('tools')
  const alertsPanelRevealNonce = useAlertStore((state) => state.alertsPanelRevealNonce)
  const [sidebarCanScrollLeft, setSidebarCanScrollLeft] = useState(false)
  const [sidebarCanScrollRight, setSidebarCanScrollRight] = useState(false)
  const [assetDropRequest, setAssetDropRequest] = useState<{
    nonce: number
    assetId: string
    clientX: number
    clientY: number
  } | null>(null)
  const [snapshots, setSnapshots] = useState<ScenarioSnapshotRecord[]>([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null)
  const [busySnapshotId, setBusySnapshotId] = useState<string | null>(null)
  const processedAlertsPanelRevealNonceRef = useRef(0)

  useEffect(() => {
    if (
      alertsPanelRevealNonce <= 0 ||
      alertsPanelRevealNonce === processedAlertsPanelRevealNonceRef.current
    ) {
      return
    }

    processedAlertsPanelRevealNonceRef.current = alertsPanelRevealNonce
    setActivePanel('alerts')
  }, [alertsPanelRevealNonce])

  useEffect(() => {
    if (!activeAssetId && assets.length > 0) {
      const preferredAsset =
        assets.find((asset) => asset.id === 'flag-tr') ??
        assets.find((asset) => asset.kind === 'flag') ??
        assets[0]

      setActiveAssetId(preferredAsset.id)
    }
  }, [activeAssetId, assets, setActiveAssetId])

  useEffect(() => {
    const iconBar = sidebarIconBarRef.current
    if (!iconBar) {
      return
    }

    let frameId = 0

    const syncSidebarOverflow = () => {
      frameId = 0
      const maxScrollLeft = Math.max(0, iconBar.scrollWidth - iconBar.clientWidth)
      const nextCanScrollLeft = iconBar.scrollLeft > 8
      const nextCanScrollRight = iconBar.scrollLeft < maxScrollLeft - 8

      setSidebarCanScrollLeft((current) => (current === nextCanScrollLeft ? current : nextCanScrollLeft))
      setSidebarCanScrollRight((current) => (current === nextCanScrollRight ? current : nextCanScrollRight))
    }

    const scheduleSync = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(syncSidebarOverflow)
    }

    scheduleSync()

    iconBar.addEventListener('scroll', scheduleSync, { passive: true })
    window.addEventListener('resize', scheduleSync)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleSync)
      resizeObserver.observe(iconBar)
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      iconBar.removeEventListener('scroll', scheduleSync)
      window.removeEventListener('resize', scheduleSync)
      resizeObserver?.disconnect()
    }
  }, [activePanel])

  useEffect(() => {
    if (runtime.access !== 'editor' || loadingAssets || assets.length === 0) {
      return
    }

    backfillAssetSnapshots(assets)
  }, [assets, backfillAssetSnapshots, document.revision, loadingAssets, runtime.access])

  useEffect(() => {
    if (!session || !scenarioId) {
      setSnapshots([])
      return
    }

    let active = true
    setLoadingSnapshots(true)
    setSnapshotsError(null)

    void backendClient
      .listSnapshots(scenarioId)
      .then((records) => {
        if (active) {
          setSnapshots(records)
        }
      })
      .catch((error) => {
        if (active) {
          setSnapshotsError(
            error instanceof Error ? error.message : 'Anlik goruntuler yuklenemedi.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSnapshots(false)
        }
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot refetch should track user identity, not token refreshes
  }, [scenarioId, sessionUserId])

  if (!hasScenarioId) {
    return <Navigate to="/app" replace />
  }

  if (!isLoading && !session) {
    return <Navigate to="/login" replace />
  }

  const selectedElement = document.elements.find((element) => element.id === selectedElementId) ?? null
  const activeBriefingSlide = getActiveBriefingSlide(document)
  const activeVisibleElementIds = getVisibleElementIdsForActiveSlide(document)
  const selectedElementVisibleOnActiveSlide =
    activeBriefingSlide && selectedElementId
      ? isElementVisibleOnSlide(document, activeBriefingSlide.id, selectedElementId)
      : null
  const isReadOnly = runtime.access !== 'editor'
  const presenterPath = `/present/${scenarioId}`

  async function reloadSnapshots() {
    const records = await backendClient.listSnapshots(scenarioId)
    setSnapshots(records)
  }

  async function handleRotateViewerSlug() {
    const nextViewerSlug = await backendClient.rotateViewerSlug(scenarioId)
    setViewerSlug(nextViewerSlug)
  }

  function handleExportScenario() {
    const filename = `${slugifyFileName(title)}.json`
    downloadTextFile(filename, serializeScenarioTransfer({ title, document }))
  }

  function togglePanel(key: PanelKey) {
    setActivePanel((current) => (current === key ? null : key))
  }

  function handleSidebarIconBarWheel(event: WheelEvent<HTMLElement>) {
    const iconBar = event.currentTarget
    if (iconBar.scrollWidth <= iconBar.clientWidth) {
      return
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    const maxScrollLeft = Math.max(0, iconBar.scrollWidth - iconBar.clientWidth)
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, iconBar.scrollLeft + event.deltaY))
    if (Math.abs(nextScrollLeft - iconBar.scrollLeft) < 1) {
      return
    }

    event.preventDefault()
    iconBar.scrollLeft = nextScrollLeft
  }

  async function handleCreateSnapshot() {
    if (!session || runtime.access !== 'editor') {
      return
    }

    setBusySnapshotId('create')
    setSnapshotsError(null)

    try {
      await runtime.refreshLockNow()
      if (document.revision !== lastSavedRevision) {
        await runtime.saveNow()
      }

      await backendClient.createSnapshot(scenarioId)
      await reloadSnapshots()
    } catch (error) {
      setSnapshotsError(
        error instanceof Error ? error.message : 'Anlik goruntu kaydedilemedi.',
      )
    } finally {
      setBusySnapshotId(null)
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!session || runtime.access !== 'editor') {
      return
    }

    setBusySnapshotId(snapshotId)
    setSnapshotsError(null)

    try {
      await runtime.refreshLockNow()
      const restoredScenario = await backendClient.restoreSnapshot(snapshotId)
      initializeScenario(restoredScenario, 'editor')
      await reloadSnapshots()
    } catch (error) {
      setSnapshotsError(
        error instanceof Error ? error.message : 'Anlik goruntu geri yuklenemedi.',
      )
    } finally {
      setBusySnapshotId(null)
    }
  }

  const saveBadgeLabel =
    saveState === 'saving'
      ? '-> Kaydediliyor'
      : saveState === 'saved'
        ? 'OK Kaydedildi'
        : saveState === 'error'
          ? 'X Hata'
          : '- Bekliyor'

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <div className="workspace-topbar-info">
          <p className="eyebrow">GeoPulse Editor</p>
          <h1>
            <input
              className="title-edit-input"
              disabled={isReadOnly}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senaryo adi..."
              value={title}
            />
          </h1>
          <p className="lede">
            {isReadOnly ? 'Bu senaryo su an salt okunur durumda.' : 'Canli editor kilidi sizde.'}
          </p>
        </div>

        <div className="workspace-topbar-meta">
          <span className={`save-badge save-${saveState}`}>{saveBadgeLabel}</span>
          {lock ? (
            <span className="lock-pill">
              Kilit {lock.holderUsername} · {formatRelativeDate(lock.expiresAt)}
            </span>
          ) : null}
          <button className="secondary-button" onClick={handleExportScenario} type="button">
            JSON indir
          </button>
          <Link className="secondary-button" to="/app">
            Senaryolar
          </Link>
        </div>
      </header>

      {runtime.error ? <div className="workspace-alert">Uyari: {runtime.error}</div> : null}
      {runtime.status === 'loading' ? (
        <div className="workspace-alert workspace-alert-info">Yukleniyor...</div>
      ) : null}
      {backendClient.mode === 'mock' ? (
        <div className="workspace-alert workspace-alert-warning">Demo mod</div>
      ) : null}

      <div className="workspace-shell">
        <section className="workspace-map-panel">
          <MapErrorBoundary>
            <ConflictMap
              assetDropRequest={assetDropRequest}
              alertAudioRole="editor"
              assets={assets}
              readOnly={isReadOnly}
              visibleElementIds={activeVisibleElementIds}
            />
          </MapErrorBoundary>
          <SystemMessageBanner />
        </section>

        <div className="workspace-sidebar-container">
          <nav
            aria-label="Editor panelleri"
            className={`sidebar-icon-bar${sidebarCanScrollLeft ? ' sidebar-icon-bar--scroll-left' : ''}${sidebarCanScrollRight ? ' sidebar-icon-bar--scroll-right' : ''}`}
            onWheel={handleSidebarIconBarWheel}
            ref={sidebarIconBarRef}
          >
            {PANELS.map(({ key, label }) => (
              <button
                key={key}
                className={`sidebar-icon-btn${activePanel === key ? ' sidebar-icon-btn--active' : ''}`}
                onClick={() => togglePanel(key)}
                title={label}
                type="button"
              >
                <span className="sidebar-icon-btn-icon">
                  <PanelGlyph name={key} />
                </span>
                <span className="sidebar-icon-btn-label">{label}</span>
              </button>
            ))}
            <div className="sidebar-icon-bar-spacer" />
            <SiteCredit className="sidebar-credit" />
          </nav>

          <div
            className={`sidebar-panel${activePanel === 'briefing' ? ' sidebar-panel--briefing' : ''}${activePanel === 'missiles' ? ' sidebar-panel--missiles' : ''}${activePanel === 'alerts' ? ' sidebar-panel--alerts' : ''}`}
            style={activePanel === null ? { display: 'none' } : undefined}
          >
            {activePanel === 'tools' ? (
              <div className="sidebar-panel-inner">
                <p className="sidebar-panel-title">Araclar</p>
                <ToolDock
                  activeTool={document.selectedTool}
                  canEdit={!isReadOnly}
                  eraserSize={eraserSize}
                  onClearAll={() => {
                    if (document.elements.length === 0) {
                      return
                    }

                    if (window.confirm('Haritadaki tum ogeleri silmek istiyor musunuz?')) {
                      clearAllElements()
                    }
                  }}
                  onDelete={removeSelectedElement}
                  onEraserSizeChange={setEraserSize}
                  onPenColorChange={setPenColor}
                  onRedo={redo}
                  onSelectTool={setTool}
                  onUndo={undo}
                  penColor={penColor}
                  redoCount={redoCount}
                  undoCount={undoCount}
                />
              </div>
            ) : null}

            {activePanel === 'text' ? (
              <div className="sidebar-panel-inner">
                <p className="sidebar-panel-title">Metin</p>
                {selectedElement?.kind === 'text' ? (
                  <>
                    <p className="sidebar-panel-desc">Secili metni duzenle.</p>
                    <textarea
                      className="panel-input panel-textarea"
                      disabled={isReadOnly}
                      onChange={(event) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, text: event.target.value } : element,
                        )
                      }}
                      placeholder="Metin yaz..."
                      value={selectedElement.text}
                    />
                    <TextControls
                      align={selectedElement.align}
                      disabled={isReadOnly}
                      fontSize={selectedElement.fontSize}
                      fontWeight={selectedElement.fontWeight}
                      onChangeAlign={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, align: value } : element,
                        )
                      }}
                      onChangeFontSize={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, fontSize: value } : element,
                        )
                      }}
                      onChangeFontWeight={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateElement(selectedElementId, (element) =>
                          element.kind === 'text' ? { ...element, fontWeight: value } : element,
                        )
                      }}
                      onChangeTextColor={(value) => {
                        if (!selectedElementId) {
                          return
                        }

                        updateSelectedElementStyle('textColor', value)
                      }}
                      textColor={selectedElement.style.textColor}
                    />
                  </>
                ) : (
                  <>
                    <p className="sidebar-panel-desc">
                      Araclardan Metin&apos;i sec, haritada bir yere tikla ve yaz.
                    </p>
                    <TextControls
                      align={textDefaults.align}
                      disabled={isReadOnly}
                      fontSize={textDefaults.fontSize}
                      fontWeight={textDefaults.fontWeight}
                      onChangeAlign={(value) => setTextDefault('align', value)}
                      onChangeFontSize={(value) => setTextDefault('fontSize', value)}
                      onChangeFontWeight={(value) => setTextDefault('fontWeight', value)}
                      onChangeTextColor={(value) => setTextDefault('textColor', value)}
                      textColor={textDefaults.textColor}
                    />
                  </>
                )}
              </div>
            ) : null}

            <div
              className="sidebar-panel-inner sidebar-panel-inner--flush"
              style={activePanel !== 'assets' ? { display: 'none' } : undefined}
            >
              <AssetLibraryPanel
                activeAssetId={activeAssetId}
                assets={assets}
                canEdit={!isReadOnly}
                error={assetsError}
                isLoading={loadingAssets}
                onDropAsset={(drop) => {
                  setActiveAssetId(drop.assetId)
                  setAssetDropRequest({ ...drop, nonce: Date.now() })
                }}
                onPickAsset={(assetId) => {
                  setActiveAssetId(assetId)
                  setTool('asset')
                }}
                onUploadAsset={async (input) => {
                  const nextAsset = await uploadAsset(input)
                  setActiveAssetId(nextAsset.id)
                  setTool('asset')
                }}
                requestedFilter={null}
              />
            </div>

            {activePanel === 'missiles' ? (
              <div className="sidebar-panel-inner">
                <MissilePanel canEdit={!isReadOnly} />
              </div>
            ) : null}

            {activePanel === 'alerts' ? (
              <div className="sidebar-panel-inner">
                <AlertsPanel canToggle={!isReadOnly} />
              </div>
            ) : null}

            {activePanel === 'briefing' ? (
              <div className="sidebar-panel-inner">
                <BriefingPanel
                  activeSlideId={document.briefing?.activeSlideId ?? null}
                  canEdit={!isReadOnly}
                  onCreateSlide={createSlideFromCurrentView}
                  onDeleteSlide={deleteSlide}
                  onDuplicateSlide={duplicateSlide}
                  onMoveSlideDown={moveSlideDown}
                  onMoveSlideUp={moveSlideUp}
                  onRenameSlide={renameSlide}
                  onSetActiveSlide={setActiveSlide}
                  onUpdateSlideNotes={updateSlideNotes}
                  presenterPath={presenterPath}
                  slides={document.briefing?.slides ?? []}
                />
              </div>
            ) : null}

            {activePanel === 'history' ? (
              <div className="sidebar-panel-inner">
                <VersionHistoryPanel
                  busySnapshotId={busySnapshotId}
                  canEdit={!isReadOnly}
                  error={snapshotsError}
                  isLoading={loadingSnapshots}
                  onCreateSnapshot={handleCreateSnapshot}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  snapshots={snapshots}
                />
              </div>
            ) : null}

            {activePanel === 'settings' || activePanel === 'share' ? (
              <div className="sidebar-panel-inner sidebar-panel-inner--flush">
                <InspectorPanel
                  activeSlideTitle={activeBriefingSlide?.title ?? null}
                  basemap={document.basemap}
                  canEdit={!isReadOnly}
                  hasHgmAtlas={appEnv.useHgmAtlas}
                  labelOptions={document.labelOptions}
                  onBringForward={bringSelectedForward}
                  onRotateViewerSlug={handleRotateViewerSlug}
                  onSendBackward={sendSelectedBackward}
                  onSetBasemapPreset={setBasemapPreset}
                  onSetSelectedElementVisibleOnActiveSlide={(visible) => {
                    if (!activeBriefingSlide || !selectedElementId) {
                      return
                    }

                    setElementVisibilityOnSlide(activeBriefingSlide.id, selectedElementId, visible)
                  }}
                  onSetStylePref={setStylePref}
                  onToggleLabelOption={setLabelOption}
                  onToggleLock={toggleSelectedLock}
                  onUpdateNumeric={updateSelectedElementNumeric}
                  onUpdateStyle={updateSelectedElementStyle}
                  onUpdateText={(value) => {
                    if (!selectedElementId) {
                      return
                    }

                    updateElement(selectedElementId, (element) =>
                      element.kind === 'text' ? { ...element, text: value } : element,
                    )
                  }}
                  onUpdateTextProperty={(field, value) => {
                    if (!selectedElementId) {
                      return
                    }

                    updateElement(selectedElementId, (element) =>
                      element.kind === 'text' ? { ...element, [field]: value } : element,
                    )
                  }}
                  scenarioId={scenarioId}
                  selectedElement={selectedElement}
                  selectedElementVisibleOnActiveSlide={selectedElementVisibleOnActiveSlide}
                  shareSectionRef={shareSectionRef}
                  stylePrefs={document.stylePrefs}
                  viewerSlug={viewerSlug}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
