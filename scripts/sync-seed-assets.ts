import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ms from 'milsymbol'

type AssetKind = 'flag' | 'air' | 'ground' | 'sea' | 'explosion' | 'danger' | 'custom'

type GeneratedSeedAsset = {
  id: string
  kind: AssetKind
  label: string
  tags: string[]
  storagePath: string
  intrinsicWidth: number
  intrinsicHeight: number
  defaultSize?: number
}

type FlagCountry = {
  capital: string
  code: string
  continent: string
  flag_4x3: string
  iso: boolean
  name: string
}

type NatoSymbolDefinition = {
  id: string
  sidc: string
  kind: Exclude<AssetKind, 'flag'>
  label: string
  tags: string[]
  fileName: string
  defaultSize?: number
  options?: {
    frame?: boolean
    fill?: boolean
    size?: number
    padding?: number
  }
}

type GeneralSymbolDefinition = {
  id: string
  kind: Exclude<AssetKind, 'flag'>
  label: string
  svgFileName: string
  tags: string[]
  fileName: string
  defaultSize?: number
}

type ViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

type SymbolPalette = {
  accent: string
  tint: string
}

type OutputContext = {
  rootDir: string
  publicSeedDir: string
  flagsOutputDir: string
  generalOutputDir: string
  natoOutputDir: string
  generatedCatalogPath: string
}

const require = createRequire(import.meta.url)
const currentFile = fileURLToPath(import.meta.url)
const currentDir = path.dirname(currentFile)
const flagIconsRoot = path.dirname(require.resolve('flag-icons/package.json'))
const customIconsDir = path.join(currentDir, 'custom-icons')
const milsymbolRoot = path.dirname(require.resolve('milsymbol/package.json'))

function createOutputContext(rootDir: string): OutputContext {
  const publicSeedDir = path.join(rootDir, 'public', 'seed-assets')

  return {
    rootDir,
    publicSeedDir,
    flagsOutputDir: path.join(publicSeedDir, 'flags'),
    generalOutputDir: path.join(publicSeedDir, 'general'),
    natoOutputDir: path.join(publicSeedDir, 'nato'),
    generatedCatalogPath: path.join(
      rootDir,
      'src',
      'features',
      'assets',
      'generatedSeedCatalog.ts',
    ),
  }
}

const turkishRegions = new Intl.DisplayNames(['tr'], { type: 'region' })

const extraFlagNames: Record<string, string> = {
  eu: 'Avrupa Birliği',
  ps: 'Filistin',
  tw: 'Tayvan',
  un: 'Birleşmiş Milletler',
  xk: 'Kosova',
}

const regionTagsByCountryCode: Record<string, string[]> = {
  tr: ['middle_east'],
  iq: ['middle_east'],
  ir: ['middle_east'],
  il: ['middle_east'],
  sy: ['middle_east'],
  ps: ['middle_east'],
  bh: ['middle_east'],
  ae: ['middle_east'],
  qa: ['middle_east'],
  kw: ['middle_east'],
  lb: ['middle_east'],
  om: ['middle_east'],
  jo: ['middle_east'],
  ye: ['middle_east'],
  sa: ['middle_east'],
  eg: ['middle_east'],
  cy: ['middle_east'],
}

const pinnedFlagCodes = [
  'tr',
  'us',
  'ru',
  'ua',
  'gb',
  'fr',
  'de',
  'cn',
  'iq',
  'ir',
  'il',
  'ps',
  'sy',
  'af',
  'pk',
  'az',
  'am',
  'gr',
  'cy',
  'eu',
  'un',
]

const palettes: Record<Exclude<AssetKind, 'flag'>, SymbolPalette> = {
  air: { accent: '#2563eb', tint: '#dbeafe' },
  ground: { accent: '#0f766e', tint: '#ccfbf1' },
  sea: { accent: '#0369a1', tint: '#e0f2fe' },
  explosion: { accent: '#ea580c', tint: '#ffedd5' },
  danger: { accent: '#dc2626', tint: '#fee2e2' },
  custom: { accent: '#7c3aed', tint: '#ede9fe' },
}

const generalSymbols: GeneralSymbolDefinition[] = [
  // ── Hava (Air) ──────────────────────────────────────────────────────────────
  {
    id: 'general-air-fighter',
    kind: 'air',
    label: 'Savaş Uçağı',
    svgFileName: 'jet-fighter.svg',
    tags: ['general', 'görsel', 'jet', 'fighter', 'uçak', 'hava'],
    fileName: 'air-fighter.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-helicopter',
    kind: 'air',
    label: 'Helikopter',
    svgFileName: 'helicopter.svg',
    tags: ['general', 'görsel', 'helicopter', 'helikopter', 'hava'],
    fileName: 'air-helicopter.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-drone',
    kind: 'air',
    label: 'SİHA',
    svgFileName: 'siha.svg',
    tags: ['general', 'görsel', 'uav', 'drone', 'iha', 'siha', 'hava'],
    fileName: 'air-drone.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-stealth-bomber',
    kind: 'air',
    label: 'Hayalet Bombardıman',
    svgFileName: 'stealth-bomber.svg',
    tags: ['general', 'görsel', 'stealth', 'bomber', 'bombardıman', 'hava'],
    fileName: 'air-stealth-bomber.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-commercial',
    kind: 'air',
    label: 'Yolcu Uçağı',
    svgFileName: 'commercial-airplane.svg',
    tags: ['general', 'görsel', 'commercial', 'yolcu', 'uçak', 'hava'],
    fileName: 'air-commercial.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-departure',
    kind: 'air',
    label: 'Uçak Kalkış',
    svgFileName: 'airplane-departure.svg',
    tags: ['general', 'görsel', 'departure', 'kalkış', 'uçak', 'hava'],
    fileName: 'air-departure.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-arrival',
    kind: 'air',
    label: 'Uçak İniş',
    svgFileName: 'airplane-arrival.svg',
    tags: ['general', 'görsel', 'arrival', 'iniş', 'uçak', 'hava'],
    fileName: 'air-arrival.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-missile',
    kind: 'air',
    label: 'Füze',
    svgFileName: 'rocket.svg',
    tags: ['general', 'görsel', 'missile', 'rocket', 'füze', 'hava'],
    fileName: 'air-missile.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-radar',
    kind: 'air',
    label: 'Radar',
    svgFileName: 'radar-sweep.svg',
    tags: ['general', 'görsel', 'radar', 'hava'],
    fileName: 'air-radar.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-satellite',
    kind: 'air',
    label: 'Uydu',
    svgFileName: 'satellite-communication.svg',
    tags: ['general', 'görsel', 'satellite', 'uydu', 'uzay', 'hava'],
    fileName: 'air-satellite.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-control-tower',
    kind: 'air',
    label: 'Kontrol Kulesi',
    svgFileName: 'control-tower.svg',
    tags: ['general', 'görsel', 'kule', 'tower', 'kontrol', 'hava'],
    fileName: 'air-control-tower.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-missile-launcher',
    kind: 'air',
    label: 'Füze Rampası',
    svgFileName: 'missile-launcher.svg',
    tags: ['general', 'görsel', 'missile', 'launcher', 'rampa', 'hava'],
    fileName: 'air-missile-launcher.svg',
    defaultSize: 54,
  },
  {
    id: 'general-air-paper-plane',
    kind: 'air',
    label: 'Kağıt Uçak',
    svgFileName: 'paper-plane.svg',
    tags: ['general', 'görsel', 'paper', 'kağıt', 'uçak', 'hava'],
    fileName: 'air-paper-plane.svg',
    defaultSize: 54,
  },
  // ── Kara (Ground) ──────────────────────────────────────────────────────────
  {
    id: 'general-ground-armor',
    kind: 'ground',
    label: 'Tank',
    svgFileName: 'battle-tank.svg',
    tags: ['general', 'görsel', 'tank', 'armor', 'zırhlı', 'kara'],
    fileName: 'ground-armor.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-convoy',
    kind: 'ground',
    label: 'Konvoy',
    svgFileName: 'truck.svg',
    tags: ['general', 'görsel', 'convoy', 'truck', 'konvoy', 'kamyon', 'kara'],
    fileName: 'ground-convoy.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-transport',
    kind: 'ground',
    label: 'Askeri Nakliye',
    svgFileName: 'flatbed-covered.svg',
    tags: ['general', 'görsel', 'transport', 'nakliye', 'askeri', 'kara'],
    fileName: 'ground-transport.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-artillery',
    kind: 'ground',
    label: 'Topçu',
    svgFileName: 'crosshair.svg',
    tags: ['general', 'görsel', 'artillery', 'topçu', 'nişangah', 'kara'],
    fileName: 'ground-artillery.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-defense',
    kind: 'ground',
    label: 'Savunma',
    svgFileName: 'shield.svg',
    tags: ['general', 'görsel', 'defense', 'savunma', 'kalkan', 'kara'],
    fileName: 'ground-defense.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-air-defense',
    kind: 'ground',
    label: 'Hava Savunma',
    svgFileName: 'checked-shield.svg',
    tags: ['general', 'görsel', 'air-defense', 'hava savunma', 'kara'],
    fileName: 'ground-air-defense.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-base',
    kind: 'ground',
    label: 'Askeri Üs',
    svgFileName: 'barracks.svg',
    tags: ['general', 'görsel', 'base', 'üs', 'kışla', 'kara'],
    fileName: 'ground-base.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-camp',
    kind: 'ground',
    label: 'Karargâh',
    svgFileName: 'barracks-tent.svg',
    tags: ['general', 'görsel', 'camp', 'karargah', 'çadır', 'kara'],
    fileName: 'ground-camp.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-field-camp',
    kind: 'ground',
    label: 'Sahra Kampı',
    svgFileName: 'camping-tent.svg',
    tags: ['general', 'görsel', 'field', 'camp', 'sahra', 'kamp', 'kara'],
    fileName: 'ground-field-camp.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-supply',
    kind: 'ground',
    label: 'İkmal Deposu',
    svgFileName: 'warehouse.svg',
    tags: ['general', 'görsel', 'supply', 'depot', 'ikmal', 'depo', 'kara'],
    fileName: 'ground-supply.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-depot',
    kind: 'ground',
    label: 'Ambar',
    svgFileName: 'barn.svg',
    tags: ['general', 'görsel', 'barn', 'ambar', 'depo', 'kara'],
    fileName: 'ground-depot.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-ambulance',
    kind: 'ground',
    label: 'Ambulans',
    svgFileName: 'ambulance.svg',
    tags: ['general', 'görsel', 'ambulance', 'ambulans', 'sağlık', 'kara'],
    fileName: 'ground-ambulance.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-weapon',
    kind: 'ground',
    label: 'Silah',
    svgFileName: 'mp5.svg',
    tags: ['general', 'görsel', 'weapon', 'gun', 'silah', 'tüfek', 'kara'],
    fileName: 'ground-weapon.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-minefield',
    kind: 'ground',
    label: 'Mayın Tarlası',
    svgFileName: 'minefield.svg',
    tags: ['general', 'görsel', 'mine', 'minefield', 'mayın', 'kara'],
    fileName: 'ground-minefield.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-annexation',
    kind: 'ground',
    label: 'İlhak',
    svgFileName: 'annexation.svg',
    tags: ['general', 'görsel', 'annexation', 'ilhak', 'işgal', 'kara'],
    fileName: 'ground-annexation.svg',
    defaultSize: 54,
  },
  {
    id: 'general-ground-comms',
    kind: 'ground',
    label: 'İletişim',
    svgFileName: 'tap.svg',
    tags: ['general', 'görsel', 'comms', 'iletişim', 'dinleme', 'kara'],
    fileName: 'ground-comms.svg',
    defaultSize: 54,
  },
  // ── Deniz (Sea) ─────────────────────────────────────────────────────────────
  {
    id: 'general-sea-warship',
    kind: 'sea',
    label: 'Savaş Gemisi',
    svgFileName: 'battleship.svg',
    tags: ['general', 'görsel', 'battleship', 'warship', 'gemi', 'deniz'],
    fileName: 'sea-warship.svg',
    defaultSize: 54,
  },
  {
    id: 'general-sea-patrol',
    kind: 'sea',
    label: 'Devriye Gemisi',
    svgFileName: 'ship-bow.svg',
    tags: ['general', 'görsel', 'patrol', 'devriye', 'gemi', 'deniz'],
    fileName: 'sea-patrol.svg',
    defaultSize: 54,
  },
  {
    id: 'general-sea-wreck',
    kind: 'sea',
    label: 'Batık Gemi',
    svgFileName: 'ship-wreck.svg',
    tags: ['general', 'görsel', 'wreck', 'batık', 'gemi', 'deniz'],
    fileName: 'sea-wreck.svg',
    defaultSize: 54,
  },
  {
    id: 'general-sea-command',
    kind: 'sea',
    label: 'Filo Komutanlığı',
    svgFileName: 'ship-wheel.svg',
    tags: ['general', 'görsel', 'command', 'komutanlık', 'filo', 'dümen', 'deniz'],
    fileName: 'sea-command.svg',
    defaultSize: 54,
  },
  {
    id: 'general-sea-torpedo',
    kind: 'sea',
    label: 'Torpido',
    svgFileName: 'torpedo.svg',
    tags: ['general', 'görsel', 'torpedo', 'torpido', 'deniz'],
    fileName: 'sea-torpedo.svg',
    defaultSize: 54,
  },
  // ── Patlama (Explosion) ─────────────────────────────────────────────────────
  {
    id: 'general-explosion-blast',
    kind: 'explosion',
    label: 'Bomba',
    svgFileName: 'falling-bomb.svg',
    tags: ['general', 'görsel', 'bomb', 'bomba', 'patlama'],
    fileName: 'explosion-blast.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-fire',
    kind: 'explosion',
    label: 'Yangın',
    svgFileName: 'flame.svg',
    tags: ['general', 'görsel', 'fire', 'flame', 'yangın', 'alev', 'patlama'],
    fileName: 'explosion-fire.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-target',
    kind: 'explosion',
    label: 'Hedef',
    svgFileName: 'bullseye.svg',
    tags: ['general', 'görsel', 'target', 'hedef', 'patlama'],
    fileName: 'explosion-target.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-impact',
    kind: 'explosion',
    label: 'Vuruş Noktası',
    svgFileName: 'impact-point.svg',
    tags: ['general', 'görsel', 'impact', 'hit', 'vuruş', 'patlama'],
    fileName: 'explosion-impact.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-airstrike',
    kind: 'explosion',
    label: 'Halı Bombardımanı',
    svgFileName: 'carpet-bombing.svg',
    tags: ['general', 'görsel', 'airstrike', 'bombardıman', 'halı', 'patlama'],
    fileName: 'explosion-airstrike.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-nuclear',
    kind: 'explosion',
    label: 'Nükleer Bomba',
    svgFileName: 'nuclear-bomb.svg',
    tags: ['general', 'görsel', 'nuclear', 'nükleer', 'bomba', 'patlama'],
    fileName: 'explosion-nuclear.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-mushroom',
    kind: 'explosion',
    label: 'Mantar Bulutu',
    svgFileName: 'mushroom-cloud.svg',
    tags: ['general', 'görsel', 'mushroom', 'mantar', 'bulut', 'nükleer', 'patlama'],
    fileName: 'explosion-mushroom.svg',
    defaultSize: 52,
  },
  {
    id: 'general-explosion-targeted',
    kind: 'explosion',
    label: 'Hedeflenmiş',
    svgFileName: 'targeted.svg',
    tags: ['general', 'görsel', 'targeted', 'hedeflenmiş', 'patlama'],
    fileName: 'explosion-targeted.svg',
    defaultSize: 52,
  },
  // ── Tehlike (Danger) ────────────────────────────────────────────────────────
  {
    id: 'general-danger-warning',
    kind: 'danger',
    label: 'Uyarı',
    svgFileName: 'hazard-sign.svg',
    tags: ['general', 'görsel', 'warning', 'uyarı', 'tehlike'],
    fileName: 'danger-warning.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-biohazard',
    kind: 'danger',
    label: 'Biyolojik Tehlike',
    svgFileName: 'biohazard.svg',
    tags: ['general', 'görsel', 'biohazard', 'biyolojik', 'tehlike'],
    fileName: 'danger-biohazard.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-skull',
    kind: 'danger',
    label: 'Ölüm Tehlikesi',
    svgFileName: 'skull-crossed-bones.svg',
    tags: ['general', 'görsel', 'skull', 'death', 'ölüm', 'kurukafa', 'tehlike'],
    fileName: 'danger-skull.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-alarm',
    kind: 'danger',
    label: 'Alarm',
    svgFileName: 'siren.svg',
    tags: ['general', 'görsel', 'alarm', 'siren', 'tehlike'],
    fileName: 'danger-alarm.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-nuclear',
    kind: 'danger',
    label: 'Nükleer Santral',
    svgFileName: 'nuclear-plant.svg',
    tags: ['general', 'görsel', 'nuclear', 'nükleer', 'santral', 'tehlike'],
    fileName: 'danger-nuclear.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-poison',
    kind: 'danger',
    label: 'Zehir',
    svgFileName: 'poison-bottle.svg',
    tags: ['general', 'görsel', 'poison', 'zehir', 'kimyasal', 'tehlike'],
    fileName: 'danger-poison.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-stop',
    kind: 'danger',
    label: 'Dur İşareti',
    svgFileName: 'stop-sign.svg',
    tags: ['general', 'görsel', 'stop', 'dur', 'yasak', 'tehlike'],
    fileName: 'danger-stop.svg',
    defaultSize: 52,
  },
  {
    id: 'general-danger-human-target',
    kind: 'danger',
    label: 'Sivil Tehdit',
    svgFileName: 'human-target.svg',
    tags: ['general', 'görsel', 'civilian', 'sivil', 'tehdit', 'tehlike'],
    fileName: 'danger-human-target.svg',
    defaultSize: 52,
  },
  // ── Özel (Custom) ──────────────────────────────────────────────────────────
  {
    id: 'general-custom-pin',
    kind: 'custom',
    label: 'Konum Pimi',
    svgFileName: 'pin.svg',
    tags: ['general', 'görsel', 'pin', 'marker', 'konum', 'özel'],
    fileName: 'custom-pin.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-marker',
    kind: 'custom',
    label: 'Pozisyon İşareti',
    svgFileName: 'position-marker.svg',
    tags: ['general', 'görsel', 'position', 'pozisyon', 'işaret', 'özel'],
    fileName: 'custom-marker.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-radio',
    kind: 'custom',
    label: 'Telsiz Kulesi',
    svgFileName: 'radio-tower.svg',
    tags: ['general', 'görsel', 'radio', 'telsiz', 'muhabere', 'özel'],
    fileName: 'custom-radio.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-wind-turbine',
    kind: 'custom',
    label: 'Rüzgar Türbini',
    svgFileName: 'wind-turbine.svg',
    tags: ['general', 'görsel', 'wind', 'rüzgar', 'enerji', 'özel'],
    fileName: 'custom-wind-turbine.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-hospital',
    kind: 'custom',
    label: 'Hastane',
    svgFileName: 'hospital.svg',
    tags: ['general', 'görsel', 'hospital', 'hastane', 'sağlık', 'özel'],
    fileName: 'custom-hospital.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-oil-pump',
    kind: 'custom',
    label: 'Petrol Pompası',
    svgFileName: 'oil-pump.svg',
    tags: ['general', 'görsel', 'oil', 'petrol', 'pompa', 'enerji', 'özel'],
    fileName: 'custom-oil-pump.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-oil-drum',
    kind: 'custom',
    label: 'Petrol Varili',
    svgFileName: 'oil-drum.svg',
    tags: ['general', 'görsel', 'oil', 'petrol', 'varil', 'özel'],
    fileName: 'custom-oil-drum.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-gas-pump',
    kind: 'custom',
    label: 'Benzin İstasyonu',
    svgFileName: 'gas-pump.svg',
    tags: ['general', 'görsel', 'gas', 'benzin', 'yakıt', 'özel'],
    fileName: 'custom-gas-pump.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-handcuffed',
    kind: 'custom',
    label: 'Esir/Tutsak',
    svgFileName: 'handcuffed.svg',
    tags: ['general', 'görsel', 'handcuff', 'kelepçe', 'esir', 'tutsak', 'özel'],
    fileName: 'custom-handcuffed.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-gibbet',
    kind: 'custom',
    label: 'Darağacı',
    svgFileName: 'gibbet.svg',
    tags: ['general', 'görsel', 'gibbet', 'darağacı', 'idam', 'özel'],
    fileName: 'custom-gibbet.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-guillotine',
    kind: 'custom',
    label: 'Giyotin',
    svgFileName: 'guillotine.svg',
    tags: ['general', 'görsel', 'guillotine', 'giyotin', 'idam', 'özel'],
    fileName: 'custom-guillotine.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-wanted',
    kind: 'custom',
    label: 'Aranan',
    svgFileName: 'wanted-reward.svg',
    tags: ['general', 'görsel', 'wanted', 'aranan', 'ödül', 'özel'],
    fileName: 'custom-wanted.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-bank',
    kind: 'custom',
    label: 'Banka',
    svgFileName: 'bank.svg',
    tags: ['general', 'görsel', 'bank', 'banka', 'finans', 'özel'],
    fileName: 'custom-bank.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-banknote',
    kind: 'custom',
    label: 'Banknot',
    svgFileName: 'banknote.svg',
    tags: ['general', 'görsel', 'banknote', 'banknot', 'para', 'finans', 'özel'],
    fileName: 'custom-banknote.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-gold',
    kind: 'custom',
    label: 'Altın',
    svgFileName: 'gold-stack.svg',
    tags: ['general', 'görsel', 'gold', 'altın', 'hazine', 'özel'],
    fileName: 'custom-gold.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-puppet',
    kind: 'custom',
    label: 'Kukla',
    svgFileName: 'puppet.svg',
    tags: ['general', 'görsel', 'puppet', 'kukla', 'kontrol', 'özel'],
    fileName: 'custom-puppet.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-vote',
    kind: 'custom',
    label: 'Oy',
    svgFileName: 'vote.svg',
    tags: ['general', 'görsel', 'vote', 'oy', 'seçim', 'demokrasi', 'özel'],
    fileName: 'custom-vote.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-handshake',
    kind: 'custom',
    label: 'Anlaşma',
    svgFileName: 'shaking-hands.svg',
    tags: ['general', 'görsel', 'handshake', 'anlaşma', 'barış', 'diplomasi', 'özel'],
    fileName: 'custom-handshake.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-speaker',
    kind: 'custom',
    label: 'Konuşmacı',
    svgFileName: 'public-speaker.svg',
    tags: ['general', 'görsel', 'speaker', 'konuşmacı', 'lider', 'özel'],
    fileName: 'custom-speaker.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-megaphone',
    kind: 'custom',
    label: 'Megafon',
    svgFileName: 'megaphone.svg',
    tags: ['general', 'görsel', 'megaphone', 'megafon', 'propaganda', 'özel'],
    fileName: 'custom-megaphone.svg',
    defaultSize: 50,
  },
  {
    id: 'general-custom-congress',
    kind: 'custom',
    label: 'Meclis',
    svgFileName: 'congress.svg',
    tags: ['general', 'görsel', 'congress', 'meclis', 'parlamento', 'siyaset', 'özel'],
    fileName: 'custom-congress.svg',
    defaultSize: 50,
  },
]

const natoSymbols: NatoSymbolDefinition[] = [
  {
    id: 'air-fighter',
    sidc: 'SFAPMFF---',
    kind: 'air',
    label: 'Avcı Uçağı',
    tags: ['nato', 'app6', 'air', 'fighter', 'jet', 'hava'],
    fileName: 'air-fighter.svg',
    defaultSize: 56,
  },
  {
    id: 'air-attack',
    sidc: 'SFAPMFA---',
    kind: 'air',
    label: 'Taarruz Uçağı',
    tags: ['nato', 'app6', 'air', 'attack', 'strike', 'hava'],
    fileName: 'air-attack.svg',
    defaultSize: 56,
  },
  {
    id: 'air-bomber',
    sidc: 'SFAPMFB---',
    kind: 'air',
    label: 'Bombardıman Uçağı',
    tags: ['nato', 'app6', 'air', 'bomber', 'hava'],
    fileName: 'air-bomber.svg',
    defaultSize: 56,
  },
  {
    id: 'air-uav',
    sidc: 'SFAPMFQ---',
    kind: 'air',
    label: 'İHA',
    tags: ['nato', 'app6', 'air', 'uav', 'drone', 'iha', 'hava'],
    fileName: 'air-uav.svg',
    defaultSize: 56,
  },
  {
    id: 'air-attack-helicopter',
    sidc: 'SFAPMHA---',
    kind: 'air',
    label: 'Taarruz Helikopteri',
    tags: ['nato', 'app6', 'air', 'helicopter', 'attack', 'hava'],
    fileName: 'air-attack-helicopter.svg',
    defaultSize: 56,
  },
  {
    id: 'air-cargo-helicopter',
    sidc: 'SFAPMHC---',
    kind: 'air',
    label: 'Nakliye Helikopteri',
    tags: ['nato', 'app6', 'air', 'helicopter', 'cargo', 'hava'],
    fileName: 'air-cargo-helicopter.svg',
    defaultSize: 56,
  },
  {
    id: 'air-surface-missile',
    sidc: 'SFAPWMSS--',
    kind: 'air',
    label: 'Yerden Havaya Füze',
    tags: ['nato', 'app6', 'air', 'missile', 'sam', 'hava'],
    fileName: 'air-surface-missile.svg',
    defaultSize: 54,
  },
  {
    id: 'air-ballistic-missile',
    sidc: 'SFAPWMB---',
    kind: 'air',
    label: 'Balistik Füze',
    tags: ['nato', 'app6', 'air', 'missile', 'ballistic', 'hava'],
    fileName: 'air-ballistic-missile.svg',
    defaultSize: 54,
  },
  {
    id: 'ground-infantry',
    sidc: 'SFGPUCI---',
    kind: 'ground',
    label: 'Piyade',
    tags: ['nato', 'app6', 'ground', 'infantry', 'kara', 'soldier'],
    fileName: 'ground-infantry.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-armor',
    sidc: 'SFGPUCA---',
    kind: 'ground',
    label: 'Zırhlı Birlik',
    tags: ['nato', 'app6', 'ground', 'armor', 'armour', 'tank', 'kara'],
    fileName: 'ground-armor.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-artillery',
    sidc: 'SFGPUCF---',
    kind: 'ground',
    label: 'Topçu',
    tags: ['nato', 'app6', 'ground', 'artillery', 'kara'],
    fileName: 'ground-artillery.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-air-defense',
    sidc: 'SFGPUCD---',
    kind: 'ground',
    label: 'Hava Savunması',
    tags: ['nato', 'app6', 'ground', 'air-defense', 'air-defence', 'kara'],
    fileName: 'ground-air-defense.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-engineer',
    sidc: 'SFGPUCE---',
    kind: 'ground',
    label: 'Mühendis',
    tags: ['nato', 'app6', 'ground', 'engineer', 'kara'],
    fileName: 'ground-engineer.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-rocket-artillery',
    sidc: 'SFGPUCFR--',
    kind: 'ground',
    label: 'Roket Topçusu',
    tags: ['nato', 'app6', 'ground', 'rocket', 'artillery', 'kara'],
    fileName: 'ground-rocket-artillery.svg',
    defaultSize: 56,
  },
  {
    id: 'ground-antitank',
    sidc: 'SFGPUCAA--',
    kind: 'ground',
    label: 'Tanksavar',
    tags: ['nato', 'app6', 'ground', 'antitank', 'antiarmor', 'kara'],
    fileName: 'ground-antitank.svg',
    defaultSize: 56,
  },
  {
    id: 'effect-burst',
    sidc: 'G-T-GD----',
    kind: 'explosion',
    label: 'İmha',
    tags: ['nato', 'app6', 'explosion', 'destroy', 'patlama'],
    fileName: 'destroy.svg',
    defaultSize: 48,
  },
  {
    id: 'explosion-interdict',
    sidc: 'G-T-GI----',
    kind: 'explosion',
    label: 'Engelleme',
    tags: ['nato', 'app6', 'explosion', 'interdict', 'patlama'],
    fileName: 'interdict.svg',
    defaultSize: 48,
  },
  {
    id: 'explosion-neutralize',
    sidc: 'G-T-GN----',
    kind: 'explosion',
    label: 'Etkisiz',
    tags: ['nato', 'app6', 'explosion', 'neutralize', 'patlama'],
    fileName: 'neutralize.svg',
    defaultSize: 48,
  },
  {
    id: 'explosion-impact-point',
    sidc: 'G-C-OXWI--',
    kind: 'explosion',
    label: 'Etki Noktası',
    tags: ['nato', 'app6', 'explosion', 'impact', 'patlama'],
    fileName: 'impact-point.svg',
    defaultSize: 48,
  },
  {
    id: 'explosion-target-point',
    sidc: 'G-C-FSTP--',
    kind: 'explosion',
    label: 'Hedef Noktası',
    tags: ['nato', 'app6', 'explosion', 'target', 'patlama'],
    fileName: 'target-point.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-radiation',
    sidc: 'G-C-BWN---',
    kind: 'danger',
    label: 'Nükleer Patlama',
    tags: ['nato', 'app6', 'danger', 'nuclear', 'radiation', 'tehlike'],
    fileName: 'nuclear-ground-zero.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-fallout',
    sidc: 'G-C-BWP---',
    kind: 'danger',
    label: 'Nükleer Serpinti',
    tags: ['nato', 'app6', 'danger', 'fallout', 'nuclear', 'tehlike'],
    fileName: 'nuclear-fallout.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-cbrn-post',
    sidc: 'G-C-MMPON-',
    kind: 'danger',
    label: 'KBRN Gözlem',
    tags: ['nato', 'app6', 'danger', 'cbrn', 'chemical', 'biological', 'radiological', 'tehlike'],
    fileName: 'cbrn-observation.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-decon',
    sidc: 'G-C-BWDP--',
    kind: 'danger',
    label: 'Dekontaminasyon',
    tags: ['nato', 'app6', 'danger', 'decon', 'decontamination', 'tehlike'],
    fileName: 'decon-site.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-minefield',
    sidc: 'G-C-BOAIN-',
    kind: 'danger',
    label: 'Mayın Tarlası',
    tags: ['nato', 'app6', 'danger', 'minefield', 'mine', 'tehlike'],
    fileName: 'minefield.svg',
    defaultSize: 48,
  },
  {
    id: 'danger-booby-trap',
    sidc: 'G-C-BOAB--',
    kind: 'danger',
    label: 'Bubi Tuzağı',
    tags: ['nato', 'app6', 'danger', 'booby-trap', 'tehlike'],
    fileName: 'booby-trap.svg',
    defaultSize: 48,
  },
  // ── Deniz (Sea) NATO ─────────────────────────────────────────────────────
  {
    id: 'sea-carrier',
    sidc: 'SFSPCLCV--',
    kind: 'sea',
    label: 'Uçak Gemisi',
    tags: ['nato', 'app6', 'sea', 'carrier', 'uçak gemisi', 'deniz'],
    fileName: 'sea-carrier.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-destroyer',
    sidc: 'SFSPCLDD--',
    kind: 'sea',
    label: 'Muhrip',
    tags: ['nato', 'app6', 'sea', 'destroyer', 'muhrip', 'deniz'],
    fileName: 'sea-destroyer.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-frigate',
    sidc: 'SFSPCLFF--',
    kind: 'sea',
    label: 'Firkateyn',
    tags: ['nato', 'app6', 'sea', 'frigate', 'firkateyn', 'deniz'],
    fileName: 'sea-frigate.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-amphibious',
    sidc: 'SFSPCLLA--',
    kind: 'sea',
    label: 'Çıkarma Gemisi',
    tags: ['nato', 'app6', 'sea', 'amphibious', 'çıkarma', 'amfibi', 'deniz'],
    fileName: 'sea-amphibious.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-patrol-boat',
    sidc: 'SFSPCLP---',
    kind: 'sea',
    label: 'Devriye Botu',
    tags: ['nato', 'app6', 'sea', 'patrol', 'devriye', 'bot', 'deniz'],
    fileName: 'sea-patrol-boat.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-mine-warfare',
    sidc: 'SFSPNM----',
    kind: 'sea',
    label: 'Mayın Arama Gemisi',
    tags: ['nato', 'app6', 'sea', 'mine', 'warfare', 'mayın', 'deniz'],
    fileName: 'sea-mine-warfare.svg',
    defaultSize: 56,
  },
  {
    id: 'sea-submarine',
    sidc: 'SFUPSLS---',
    kind: 'sea',
    label: 'Denizaltı',
    tags: ['nato', 'app6', 'sea', 'submarine', 'denizaltı', 'deniz'],
    fileName: 'sea-submarine.svg',
    defaultSize: 56,
  },
  // ── Özel (Custom) NATO ──────────────────────────────────────────────────
  {
    id: 'custom-anchor',
    sidc: 'G-C-MGPI--',
    kind: 'custom',
    label: 'İlgi Noktası',
    tags: ['nato', 'app6', 'custom', 'point-of-interest', 'özel'],
    fileName: 'point-of-interest.svg',
    defaultSize: 46,
  },
  {
    id: 'custom-target-reference',
    sidc: 'G-C-MMPT--',
    kind: 'custom',
    label: 'Hedef Referansı',
    tags: ['nato', 'app6', 'custom', 'target-reference', 'özel'],
    fileName: 'target-reference.svg',
    defaultSize: 46,
  },
  {
    id: 'custom-nav-reference',
    sidc: 'G-C-OXRN--',
    kind: 'custom',
    label: 'Seyrüsefer Referansı',
    tags: ['nato', 'app6', 'custom', 'navigation', 'reference', 'özel'],
    fileName: 'navigation-reference.svg',
    defaultSize: 46,
  },
]

function toAscii(value: string) {
  return value
    .replaceAll('İ', 'I')
    .replaceAll('I', 'I')
    .replaceAll('ı', 'i')
    .replaceAll('Ş', 'S')
    .replaceAll('ş', 's')
    .replaceAll('Ğ', 'G')
    .replaceAll('ğ', 'g')
    .replaceAll('Ü', 'U')
    .replaceAll('ü', 'u')
    .replaceAll('Ö', 'O')
    .replaceAll('ö', 'o')
    .replaceAll('Ç', 'C')
    .replaceAll('ç', 'c')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

function keywordTokens(...values: Array<string | undefined>) {
  return unique(
    values
      .flatMap((value) =>
        toAscii(value ?? '')
          .toLowerCase()
          .split(/[^a-z0-9]+/g),
      )
      .filter((token) => token.length > 1),
  )
}

function parseViewBox(svg: string): ViewBox {
  const match = svg.match(/viewBox="([^"]+)"/i)
  if (!match) {
    throw new Error('SVG viewBox bilgisi bulunamadı.')
  }

  const [minX, minY, width, height] = match[1]
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))

  if ([minX, minY, width, height].some((value) => Number.isNaN(value))) {
    throw new Error('SVG viewBox değeri okunamadı.')
  }

  return { minX, minY, width, height }
}

function getInnerSvgContent(svg: string) {
  const cleaned = svg.replace(/^\uFEFF?/, '').trim()
  const rootMatch = cleaned.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>\s*$/i)

  if (!rootMatch) {
    throw new Error('SVG içeriği okunamadı.')
  }

  return rootMatch[1].trim()
}

function buildSvgRoot(width: number, height: number, viewBox: string, innerContent: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${viewBox}">`,
    innerContent,
    '</svg>',
  ].join('')
}

function wrapFlagSvg(svg: string) {
  const viewBox = parseViewBox(svg)
  const padX = Math.round(viewBox.width * 0.08)
  const padY = Math.round(viewBox.height * 0.08)
  const outerWidth = viewBox.width + padX * 2
  const outerHeight = viewBox.height + padY * 2
  const innerContent = getInnerSvgContent(svg)

  const wrapped = [
    `<rect x="0" y="0" width="${outerWidth}" height="${outerHeight}" rx="${Math.round(viewBox.height * 0.06)}" fill="#ffffff"/>`,
    `<g transform="translate(${padX} ${padY})">`,
    innerContent,
    `<rect x="4" y="4" width="${viewBox.width - 8}" height="${viewBox.height - 8}" rx="${Math.round(viewBox.height * 0.025)}" fill="none" stroke="#10203b" stroke-opacity="0.14" stroke-width="8"/>`,
    '</g>',
  ].join('')

  return {
    svg: buildSvgRoot(outerWidth, outerHeight, `0 0 ${outerWidth} ${outerHeight}`, wrapped),
    width: outerWidth,
    height: outerHeight,
  }
}

function sanitizeNatoSvg(svg: string) {
  const viewBox = parseViewBox(svg)
  const maxDimension = Math.max(viewBox.width, viewBox.height)
  const strokeWidth = Math.max(4, Math.round(maxDimension / 36))

  const sanitizedBody = getInnerSvgContent(svg).replace(
    /<(path|circle|rect|ellipse|line|polyline|polygon|text)\b([^>]*)>/gi,
    (match, tagName: string, attributes: string) => {
      let nextAttributes = attributes
      const hasStroke = /\sstroke=/.test(nextAttributes)
      const hasFill = /\sfill=/.test(nextAttributes)
      const fillNone = /\sfill="none"/.test(nextAttributes)

      if (tagName.toLowerCase() === 'text' && !hasFill) {
        nextAttributes += ' fill="#10203b"'
      }

      if (fillNone && !hasStroke) {
        nextAttributes += ` stroke="#10203b" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
      } else if (
        ['path', 'line', 'polyline'].includes(tagName.toLowerCase()) &&
        !hasStroke &&
        !hasFill
      ) {
        nextAttributes += ` fill="none" stroke="#10203b" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
      } else if (
        ['circle', 'rect', 'ellipse', 'polygon'].includes(tagName.toLowerCase()) &&
        !hasStroke &&
        !hasFill
      ) {
        nextAttributes += ' fill="#10203b"'
      }

      return `<${tagName}${nextAttributes}>`
    },
  )

  return {
    svg: buildSvgRoot(
      viewBox.width,
      viewBox.height,
      `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`,
      sanitizedBody,
    ),
    width: viewBox.width,
    height: viewBox.height,
  }
}

function extractGameIconPaths(svg: string): string {
  const inner = getInnerSvgContent(svg)
  return inner
    .replace(/<path\s+d="M0 0h512v512H0z"[^/]*\/>/g, '')
    .replace(/<path\s+d="M0 0h512v512H0z"[^>]*>[^<]*<\/path>/g, '')
}

function wrapGeneralSymbolSvg(svg: string, palette: SymbolPalette) {
  const frameSize = 112
  const viewBox = parseViewBox(svg)
  const innerSize = 58
  const scale = innerSize / Math.max(viewBox.width, viewBox.height)
  const translateX = frameSize / 2 - (viewBox.minX + viewBox.width / 2) * scale
  const translateY = frameSize / 2 - (viewBox.minY + viewBox.height / 2) * scale
  const iconPaths = extractGameIconPaths(svg)
    .replace(/fill="#fff"/g, `fill="${palette.accent}"`)
    .replace(/fill-opacity="1"/g, '')

  const wrapped = [
    `<rect x="10" y="10" width="92" height="92" rx="28" fill="#ffffff"/>`,
    `<rect x="10" y="10" width="92" height="92" rx="28" fill="${palette.tint}" opacity="0.8"/>`,
    `<rect x="10" y="10" width="92" height="92" rx="28" fill="none" stroke="#10203b" stroke-opacity="0.12" stroke-width="2.5"/>`,
    `<circle cx="56" cy="56" r="27" fill="${palette.accent}" fill-opacity="0.14"/>`,
    `<g transform="translate(${translateX.toFixed(3)} ${translateY.toFixed(3)}) scale(${scale.toFixed(3)})">`,
    iconPaths,
    '</g>',
  ].join('')

  return {
    svg: buildSvgRoot(frameSize, frameSize, `0 0 ${frameSize} ${frameSize}`, wrapped),
    width: frameSize,
    height: frameSize,
  }
}

function compareFlagOrder(left: FlagCountry, right: FlagCountry) {
  const leftPinned = pinnedFlagCodes.indexOf(left.code)
  const rightPinned = pinnedFlagCodes.indexOf(right.code)

  if (leftPinned !== -1 || rightPinned !== -1) {
    if (leftPinned === -1) {
      return 1
    }
    if (rightPinned === -1) {
      return -1
    }
    return leftPinned - rightPinned
  }

  return getFlagBaseName(left).localeCompare(getFlagBaseName(right), 'tr')
}

function getFlagBaseName(country: FlagCountry) {
  if (extraFlagNames[country.code]) {
    return extraFlagNames[country.code]
  }

  if (country.iso) {
    const localized = turkishRegions.of(country.code.toUpperCase())
    if (localized && localized !== country.code.toUpperCase()) {
      return localized
    }
  }

  return country.name
}

async function writeCatalogFile(catalog: GeneratedSeedAsset[], context: OutputContext) {
  const content =
    `// Generated by scripts/sync-seed-assets.ts. Do not edit manually.\n` +
    `export type GeneratedSeedAsset = {\n` +
    `  id: string\n` +
    `  kind: 'flag' | 'air' | 'ground' | 'sea' | 'explosion' | 'danger' | 'custom'\n` +
    `  label: string\n` +
    `  tags: string[]\n` +
    `  storagePath: string\n` +
    `  intrinsicWidth: number\n` +
    `  intrinsicHeight: number\n` +
    `  defaultSize?: number\n` +
    `}\n\n` +
    `export const generatedSeedCatalog: GeneratedSeedAsset[] = ${JSON.stringify(catalog, null, 2)}\n`

  await fs.mkdir(path.dirname(context.generatedCatalogPath), { recursive: true })
  await fs.writeFile(context.generatedCatalogPath, content, 'utf8')
}

async function generateFlags(context: OutputContext) {
  const countries = JSON.parse(
    await fs.readFile(path.join(flagIconsRoot, 'country.json'), 'utf8'),
  ) as FlagCountry[]

  const includedCodes = new Set([...pinnedFlagCodes, ...Object.keys(extraFlagNames)])
  const selectedFlags = countries
    .filter((country) => country.iso || includedCodes.has(country.code))
    .sort(compareFlagOrder)

  const generatedFlags: GeneratedSeedAsset[] = []

  for (const country of selectedFlags) {
    const baseName = getFlagBaseName(country)
    const fileName = `${country.code}.svg`
    const sourcePath = path.join(flagIconsRoot, country.flag_4x3)
    const outputPath = path.join(context.flagsOutputDir, fileName)
    const sourceSvg = await fs.readFile(sourcePath, 'utf8')
    const wrappedSvg = wrapFlagSvg(sourceSvg)

    await fs.writeFile(outputPath, wrappedSvg.svg, 'utf8')

    generatedFlags.push({
      id: `flag-${country.code}`,
      kind: 'flag',
      label: `${baseName} Bayrağı`,
      tags: [
        ...keywordTokens(
          baseName,
          country.name,
          country.capital,
          country.continent,
          country.code,
          'bayrak',
          'flag',
        ),
        ...(regionTagsByCountryCode[country.code] ?? []),
      ],
      storagePath: `flags/${fileName}`,
      intrinsicWidth: wrappedSvg.width,
      intrinsicHeight: wrappedSvg.height,
      defaultSize: 52,
    })
  }

  return generatedFlags
}

function createNatoSymbolSvg(definition: NatoSymbolDefinition) {
  const symbol = new ms.Symbol(definition.sidc, {
    standard: 'APP6',
    size: definition.options?.size ?? 180,
    frame: definition.options?.frame ?? true,
    fill: definition.options?.fill ?? false,
    padding: definition.options?.padding ?? 6,
    monoColor: '#10203b',
    infoFields: false,
    outlineWidth: 0,
  })
  const validation = symbol.isValid(true)

  if (
    validation !== true &&
    typeof validation === 'object' &&
    'drawInstructions' in validation &&
    validation.drawInstructions === false
  ) {
    throw new Error(`SIDC çizim talimatı üretmedi: ${definition.sidc}`)
  }

  return symbol.asSVG()
}

async function generateNatoSymbols(context: OutputContext) {
  const generatedSymbols: GeneratedSeedAsset[] = []

  for (const definition of natoSymbols) {
    const renderedSvg = createNatoSymbolSvg(definition)
    const sanitized = sanitizeNatoSvg(renderedSvg)
    await fs.writeFile(path.join(context.natoOutputDir, definition.fileName), sanitized.svg, 'utf8')

    generatedSymbols.push({
      id: definition.id,
      kind: definition.kind,
      label: definition.label,
      tags: keywordTokens(definition.label, ...definition.tags, 'nato', 'app6'),
      storagePath: `nato/${definition.fileName}`,
      intrinsicWidth: Math.round(sanitized.width),
      intrinsicHeight: Math.round(sanitized.height),
      defaultSize: definition.defaultSize,
    })
  }

  return generatedSymbols
}

async function generateGeneralSymbols(context: OutputContext) {
  const generatedSymbols: GeneratedSeedAsset[] = []

  for (const definition of generalSymbols) {
    const palette = palettes[definition.kind]
    const sourcePath = path.join(customIconsDir, definition.svgFileName)
    const sourceSvg = await fs.readFile(sourcePath, 'utf8')
    const wrapped = wrapGeneralSymbolSvg(sourceSvg, palette)

    await fs.writeFile(path.join(context.generalOutputDir, definition.fileName), wrapped.svg, 'utf8')

    generatedSymbols.push({
      id: definition.id,
      kind: definition.kind,
      label: definition.label,
      tags: keywordTokens(
        definition.label,
        ...definition.tags,
        'general',
        'görsel',
        'sembol',
        'ikon',
      ),
      storagePath: `general/${definition.fileName}`,
      intrinsicWidth: wrapped.width,
      intrinsicHeight: wrapped.height,
      defaultSize: definition.defaultSize,
    })
  }

  return generatedSymbols
}

export async function syncSeedAssets(rootDir = path.resolve(currentDir, '..')) {
  const context = createOutputContext(rootDir)

  await fs.rm(context.publicSeedDir, { recursive: true, force: true })
  await fs.mkdir(context.flagsOutputDir, { recursive: true })
  await fs.mkdir(context.generalOutputDir, { recursive: true })
  await fs.mkdir(context.natoOutputDir, { recursive: true })

  const generatedFlags = await generateFlags(context)
  const generatedGeneralSymbols = await generateGeneralSymbols(context)
  const generatedNatoSymbols = await generateNatoSymbols(context)
  const catalog = [...generatedFlags, ...generatedGeneralSymbols, ...generatedNatoSymbols]

  await writeCatalogFile(catalog, context)

  console.log('Seed asset senkronizasyonu tamamlandı.')
  console.log(`Flag source: ${flagIconsRoot}`)
  console.log(`General icon source: ${customIconsDir}`)
  console.log(`NATO symbol source: ${milsymbolRoot}`)
  console.log(`Toplam asset: ${catalog.length}`)
  console.log(`Bayrak: ${generatedFlags.length}`)
  console.log(`Genel sembol: ${generatedGeneralSymbols.length}`)
  console.log(`NATO sembol: ${generatedNatoSymbols.length}`)
}

if (process.argv[1]?.endsWith('sync-seed-assets.ts')) {
  void syncSeedAssets().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
