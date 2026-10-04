/** What Katrien can wear, and what unlocks it. Adapted from Katrien Klimt. */

export interface Look {
  hats: string[]
  cape: string | null
  pattern: string | null
}

export const EMPTY_LOOK: Look = { hats: [], pattern: null, cape: null }

/** How far Wyne got; every unlock is earned by playing, never bought. */
export interface LookProgress {
  learned: number
  rounds: number
  days: number
  fed: number
}

export interface Unlock {
  kind: keyof LookProgress
  at: number
}

export type HatMount = 'head' | 'face'

export interface Hat {
  id: string
  naam: string
  /** `item` uses the art in public/items, `draw` is painted in code. */
  source: 'item' | 'draw'
  mount: HatMount
  unlock: Unlock
  /** Width as a fraction of the head width. */
  scale: number
  /** Nudges in head widths, before the head tilt is applied. */
  dx: number
  dy: number
  /** Extra tilt in degrees on top of the head tilt. */
  rot: number
}

export const HATS: Hat[] = [
  { id: 'bowtie', naam: 'Strikje', source: 'item', mount: 'head', unlock: { kind: 'rounds', at: 1 }, scale: 0.55, dx: 0, dy: 0.04, rot: -8 },
  { id: 'bell', naam: 'Belletje', source: 'item', mount: 'head', unlock: { kind: 'learned', at: 5 }, scale: 0.34, dx: 0.04, dy: 0.06, rot: 0 },
  { id: 'zonnebril', naam: 'Zonnebril', source: 'draw', mount: 'face', unlock: { kind: 'days', at: 2 }, scale: 0.82, dx: 0, dy: 0, rot: 0 },
  { id: 'fish', naam: 'Visje', source: 'item', mount: 'head', unlock: { kind: 'fed', at: 3 }, scale: 0.9, dx: 0, dy: 0.05, rot: -10 },
  { id: 'mouse-toy', naam: 'Speelmuis', source: 'item', mount: 'head', unlock: { kind: 'rounds', at: 5 }, scale: 0.72, dx: 0, dy: 0.06, rot: -6 },
  { id: 'yarn', naam: 'Bolletje wol', source: 'item', mount: 'head', unlock: { kind: 'learned', at: 10 }, scale: 0.6, dx: 0, dy: 0.04, rot: 0 },
  { id: 'ketting', naam: 'Blingbling', source: 'draw', mount: 'head', unlock: { kind: 'days', at: 4 }, scale: 1.2, dx: 0, dy: 0.7, rot: 0 },
  { id: 'feather', naam: 'Veertje', source: 'item', mount: 'head', unlock: { kind: 'learned', at: 15 }, scale: 0.46, dx: 0.16, dy: 0.05, rot: 16 },
  { id: 'hogehoed', naam: 'Hoge hoed', source: 'draw', mount: 'head', unlock: { kind: 'learned', at: 20 }, scale: 0.82, dx: 0, dy: 0.02, rot: 0 },
  { id: 'lama', naam: 'Kleine lama', source: 'draw', mount: 'head', unlock: { kind: 'learned', at: 25 }, scale: 0.78, dx: 0, dy: 0.02, rot: 0 },
  { id: 'crown', naam: 'Kroontje', source: 'item', mount: 'head', unlock: { kind: 'learned', at: 40 }, scale: 0.78, dx: 0, dy: 0.05, rot: 0 },
  { id: 'helmet', naam: 'Astronautenhelm', source: 'item', mount: 'head', unlock: { kind: 'learned', at: 60 }, scale: 0.74, dx: 0, dy: 0.07, rot: 0 },
]

export interface CapeColor {
  id: string
  naam: string
  color: string
  unlock: Unlock
}

export const CAPES: CapeColor[] = [
  { id: 'rood', naam: 'Rode cape', color: '#e74c3c', unlock: { kind: 'rounds', at: 0 } },
  { id: 'blauw', naam: 'Blauwe cape', color: '#3498db', unlock: { kind: 'rounds', at: 3 } },
  { id: 'groen', naam: 'Groene cape', color: '#2ecc71', unlock: { kind: 'days', at: 3 } },
  { id: 'paars', naam: 'Paarse cape', color: '#9b59b6', unlock: { kind: 'learned', at: 10 } },
  { id: 'zwart', naam: 'Zwarte cape', color: '#2c3e50', unlock: { kind: 'fed', at: 5 } },
  { id: 'goud', naam: 'Gouden cape', color: '#f1c40f', unlock: { kind: 'learned', at: 35 } },
]

export interface Pattern {
  id: string
  naam: string
  unlock: Unlock
}

export const PATTERNS: Pattern[] = [
  { id: 'tijger', naam: 'Tijgerstrepen', unlock: { kind: 'rounds', at: 0 } },
  { id: 'zebra', naam: 'Zebrastrepen', unlock: { kind: 'learned', at: 15 } },
  { id: 'luipaard', naam: 'Luipaardvlekjes', unlock: { kind: 'learned', at: 30 } },
]

export function hatById(id: string | null): Hat | undefined {
  return id ? HATS.find((h) => h.id === id) : undefined
}

export function capeById(id: string | null): CapeColor | undefined {
  return id ? CAPES.find((c) => c.id === id) : undefined
}

export function patternById(id: string | null): Pattern | undefined {
  return id ? PATTERNS.find((p) => p.id === id) : undefined
}

export function unlocked(u: Unlock, p: LookProgress): boolean {
  return p[u.kind] >= u.at
}

/** Why something is still locked, in Dutch. */
export function lockedText(u: Unlock): string {
  switch (u.kind) {
    case 'learned':
      return `bij ${u.at} woorden geleerd`
    case 'rounds':
      return u.at === 1 ? 'na je eerste ronde' : `na ${u.at} rondes`
    case 'days':
      return `na ${u.at} dagen spelen`
    case 'fed':
      return `na ${u.at} vissnoepjes`
  }
}

/** Drops anything that is not unlocked (any more), so a wiped profile cannot keep a hat. */
export function sanitiseLook(look: Look, p: LookProgress): Look {
  const hats = (look.hats || []).filter((id) => {
    const h = hatById(id)
    return h && unlocked(h.unlock, p)
  })
  const cape = capeById(look.cape)
  const pattern = patternById(look.pattern)
  return {
    hats,
    cape: cape && unlocked(cape.unlock, p) ? cape.id : null,
    pattern: pattern && unlocked(pattern.unlock, p) ? pattern.id : null,
  }
}
