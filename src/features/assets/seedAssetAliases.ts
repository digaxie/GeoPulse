export const legacySeedAssetAliases = {
  'general-ground-soldier': 'ground-infantry',
} as const satisfies Record<string, string>

export function resolveSeedAssetAlias(assetId: string) {
  return legacySeedAssetAliases[assetId as keyof typeof legacySeedAssetAliases] ?? assetId
}
