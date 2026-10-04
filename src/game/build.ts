import { itemInfo, type ItemId } from '../content/blocks'
import type { PlacedBlock } from '../storage/schema'

/** Highest stack, counted in layers above the ground. */
export const MAX_LAYERS = 6

export interface Bounds {
  minX: number
  minZ: number
  w: number
  d: number
}

export function inBounds(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x < b.minX + b.w && z >= b.minZ && z < b.minZ + b.d
}

export function column(blocks: PlacedBlock[], x: number, z: number): PlacedBlock[] {
  return blocks.filter((b) => b.x === x && b.z === z).sort((a, b) => a.y - b.y)
}

/** Number of layers standing on a tile. */
export function height(blocks: PlacedBlock[], x: number, z: number): number {
  const col = column(blocks, x, z)
  return col.length ? col[col.length - 1].y + 1 : 0
}

export type PlaceError = 'buiten' | 'te-hoog' | 'bovenop-meubel' | 'bovenop-water'

/** Whether something can go on top of this tile, and if not, why. */
export function canPlace(blocks: PlacedBlock[], bounds: Bounds, x: number, z: number, type: ItemId): PlaceError | null {
  if (!inBounds(bounds, x, z)) return 'buiten'
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (top && itemInfo(top.type)?.kind === 'furniture') return 'bovenop-meubel'
  if (top && top.type === 'water') return 'bovenop-water'
  const h = top ? top.y + 1 : 0
  const tall = type === 'vuurtoren' ? 2 : 1
  if (h + tall > MAX_LAYERS) return 'te-hoog'
  return null
}

/** Puts an item on top of a tile. Returns the new list, or null when it cannot go there. */
export function place(blocks: PlacedBlock[], bounds: Bounds, x: number, z: number, type: ItemId): PlacedBlock[] | null {
  if (canPlace(blocks, bounds, x, z, type)) return null
  return [...blocks, { x, z, y: height(blocks, x, z), type }]
}

/** Takes the top item off a tile and says what it was. */
export function removeTop(blocks: PlacedBlock[], x: number, z: number): { blocks: PlacedBlock[]; removed: ItemId } | null {
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (!top) return null
  return { blocks: blocks.filter((b) => b !== top), removed: top.type }
}

/** Turns the furniture on top of a tile a quarter; null when the top is not furniture. */
export function turnTop(blocks: PlacedBlock[], x: number, z: number): PlacedBlock[] | null {
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (!top || itemInfo(top.type)?.kind !== 'furniture') return null
  return blocks.map((b) => (b === top ? { ...b, rot: ((b.rot ?? 0) + 1) % 4 } : b))
}

/** Placed furniture of a type, for Katrien's little routines. */
export function findItem(blocks: PlacedBlock[], type: ItemId): PlacedBlock | undefined {
  return blocks.find((b) => b.type === type)
}
