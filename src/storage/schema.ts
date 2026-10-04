import type { ItemId } from '../content/blocks'
import { ITEMS } from '../content/blocks'
import { emptyDays, type Days } from '../game/day'
import { CAP_SECONDS, START_SECONDS } from '../game/buildtime'
import type { Inventory } from '../game/rewards'
import { reviveState, type WordState } from '../engine/words'

export const STORAGE_KEY = 'rainbow-island.v1'
export const SCHEMA_VERSION = 1

export interface Settings {
  /** Chosen test id, or null for the newest. */
  toets: string | null
  sound: boolean
  speak: boolean
}

export interface TestResult {
  at: number
  toets: string
  total: number
  correct: number
  /** 1 to 10, one decimal. */
  grade: number
  wrong: { word: string; answer: string }[]
}

export interface PlacedBlock {
  x: number
  z: number
  y: number
  type: ItemId
  /** Quarter turns, for furniture. */
  rot?: number
}

export interface Island {
  /** User-built blocks and furniture. */
  blocks: PlacedBlock[]
  /** Size the player has already seen, so growth can be animated once. */
  seenStep: number
  /** Whether the lighthouse was already handed out, per test id. */
  lighthouses: string[]
}

export interface Look {
  hats: string[]
  pattern: string | null
  cape: string | null
}

export interface Profile {
  naam: string
  /** Learning state per test id and word. */
  words: Record<string, Record<string, WordState>>
  island: Island
  inventory: Inventory
  look: Look
  days: Days
  tests: TestResult[]
  settings: Settings
  stats: { rounds: number; fed: number; answers: number }
  /** Seconds of building left, earned by answering. */
  buildTime: number
  /** The one-off extension (5 right in a row) was used; a full round frees it again. */
  extensionUsed: boolean
}

export interface SaveFile {
  schemaVersion: number
  activeProfile: string
  profiles: Record<string, Profile>
}

export function emptyProfile(naam = 'Wyne'): Profile {
  return {
    naam,
    words: {},
    island: { blocks: [], seenStep: 0, lighthouses: [] },
    inventory: {},
    look: { hats: [], pattern: null, cape: null },
    days: emptyDays(),
    tests: [],
    settings: { toets: null, sound: true, speak: true },
    stats: { rounds: 0, fed: 0, answers: 0 },
    buildTime: START_SECONDS,
    extensionUsed: false,
  }
}

export function emptySave(): SaveFile {
  return { schemaVersion: SCHEMA_VERSION, activeProfile: 'wyne', profiles: { wyne: emptyProfile() } }
}

const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const ITEM_IDS = new Set<string>(ITEMS.map((i) => i.id))

function migrateProfile(raw: unknown): Profile {
  const p = emptyProfile()
  const v = obj(raw)
  if (typeof v.naam === 'string') p.naam = v.naam

  for (const [toets, words] of Object.entries(obj(v.words))) {
    p.words[toets] = {}
    for (const [word, state] of Object.entries(obj(words))) p.words[toets][word] = reviveState(state)
  }

  const island = obj(v.island)
  if (Array.isArray(island.blocks)) {
    p.island.blocks = island.blocks
      .map((b) => obj(b))
      .filter((b) => typeof b.type === 'string' && ITEM_IDS.has(b.type))
      .map((b) => {
        const out: PlacedBlock = { x: Math.round(num(b.x, 0)), z: Math.round(num(b.z, 0)), y: Math.max(0, Math.round(num(b.y, 0))), type: b.type as ItemId }
        const rot = Math.round(num(b.rot, 0)) % 4
        if (rot > 0) out.rot = rot
        return out
      })
  }
  p.island.seenStep = num(island.seenStep, 0)
  if (Array.isArray(island.lighthouses)) p.island.lighthouses = island.lighthouses.filter((x): x is string => typeof x === 'string')

  for (const [id, n] of Object.entries(obj(v.inventory))) {
    if (ITEM_IDS.has(id)) p.inventory[id as ItemId] = Math.max(0, Math.round(num(n, 0)))
  }

  const look = obj(v.look)
  p.look = {
    hats: Array.isArray(look.hats) ? look.hats.filter((x): x is string => typeof x === 'string') : [],
    pattern: typeof look.pattern === 'string' ? look.pattern : null,
    cape: typeof look.cape === 'string' ? look.cape : null,
  }

  const days = obj(v.days)
  p.days = {
    played: num(days.played, 0),
    lastDay: typeof days.lastDay === 'string' ? days.lastDay : null,
    lastAt: num(days.lastAt, 0),
    roundsToday: num(days.roundsToday, 0),
  }

  if (Array.isArray(v.tests)) {
    p.tests = v.tests
      .map((t) => obj(t))
      .filter((t) => typeof t.toets === 'string')
      .map((t) => ({
        at: num(t.at, 0),
        toets: t.toets as string,
        total: num(t.total, 0),
        correct: num(t.correct, 0),
        grade: num(t.grade, 1),
        wrong: Array.isArray(t.wrong) ? (t.wrong as { word: string; answer: string }[]).filter((w) => w && typeof w.word === 'string') : [],
      }))
      .slice(-10)
  }

  const s = obj(v.settings)
  p.settings = {
    toets: typeof s.toets === 'string' ? s.toets : null,
    sound: typeof s.sound === 'boolean' ? s.sound : true,
    speak: typeof s.speak === 'boolean' ? s.speak : true,
  }
  const stats = obj(v.stats)
  p.stats = { rounds: num(stats.rounds, 0), fed: num(stats.fed, 0), answers: num(stats.answers, 0) }
  p.buildTime = Math.max(0, Math.min(CAP_SECONDS, num(v.buildTime, START_SECONDS)))
  p.extensionUsed = v.extensionUsed === true
  return p
}

/** Brings older or partial saves up to the current shape. Never throws. */
export function migrate(raw: unknown): SaveFile {
  const data = obj(raw)
  const out: SaveFile = {
    schemaVersion: SCHEMA_VERSION,
    activeProfile: typeof data.activeProfile === 'string' ? data.activeProfile : 'wyne',
    profiles: {},
  }
  // Future versions add their steps here, e.g. if (version < 2) { ... }.
  for (const [key, value] of Object.entries(obj(data.profiles))) out.profiles[key] = migrateProfile(value)
  if (!out.profiles[out.activeProfile]) out.profiles[out.activeProfile] = emptyProfile()
  return out
}
