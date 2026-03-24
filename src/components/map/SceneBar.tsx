import type { ScenarioDocument } from '@/features/scenario/model'
import {
  continentSceneIds,
  focusSceneIds,
  isSceneCompatibleOpenFreeMapPreset,
  scenePresetRegistry,
} from '@/features/scenario/scenes'
import { cn } from '@/lib/utils'

type SceneBarProps = {
  basemapPreset: ScenarioDocument['basemap']['preset']
  scene: ScenarioDocument['scene']
  canEdit: boolean
  onClear: () => void
  onToggleContinent: (id: (typeof continentSceneIds)[number]) => void
  onSetFocus: (id: (typeof focusSceneIds)[number] | null) => void
}

export function SceneBar({
  basemapPreset,
  scene,
  canEdit,
  onClear,
  onToggleContinent,
  onSetFocus,
}: SceneBarProps) {
  const enabled = canEdit && isSceneCompatibleOpenFreeMapPreset(basemapPreset)
  const hasSelection = scene.focusPreset !== null || scene.activeContinents.length > 0

  return (
    <div className="scene-bar">
      <div className="scene-bar-group">
        <span className="scene-bar-label">Sahneler</span>
        <button
          className={cn('scene-chip', !hasSelection && 'active')}
          disabled={!enabled}
          onClick={onClear}
          type="button"
        >
          Dünya
        </button>
        {continentSceneIds.map((id) => (
          <button
            key={id}
            className={cn('scene-chip', scene.activeContinents.includes(id) && 'active')}
            disabled={!enabled}
            onClick={() => onToggleContinent(id)}
            type="button"
          >
            {scenePresetRegistry[id].label}
          </button>
        ))}
      </div>

      <div className="scene-bar-group scene-bar-group-focus">
        <span className="scene-bar-label">Odak</span>
        {focusSceneIds.map((id) => (
          <button
            key={id}
            className={cn('scene-chip', scene.focusPreset === id && 'active')}
            disabled={!enabled}
            onClick={() => onSetFocus(scene.focusPreset === id ? null : id)}
            type="button"
          >
            {scenePresetRegistry[id].label}
          </button>
        ))}
      </div>

      {!isSceneCompatibleOpenFreeMapPreset(basemapPreset) ? (
        <p className="scene-bar-note">
          Sahne sistemi bu sürümde yalnızca OpenFreeMap Liberty ile çalışır.
        </p>
      ) : null}
    </div>
  )
}
