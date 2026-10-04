import { BLOCKS, FURNITURE, type ItemId } from '../content/blocks'
import type { Rng } from '../engine/rng'
import { weightedPick } from '../engine/rng'
import type { Outcome, QuestionType } from '../engine/words'

export type Inventory = Partial<Record<ItemId, number>>

/** Blocks for one answer: typed right 2, choice right 1, with hint or almost 1, wrong 0. */
export function blocksFor(type: QuestionType, outcome: Outcome): number {
  if (outcome === 'wrong') return 0
  if (outcome === 'hint' || outcome === 'almost') return 1
  return type === 'type' ? 2 : 1
}

/** Whether an answer keeps the streak going. Almost neither breaks nor grows it. */
export function nextStreak(streak: number, outcome: Outcome): number {
  if (outcome === 'correct' || outcome === 'hint') return streak + 1
  if (outcome === 'almost') return streak
  return 0
}

/**
 * Everything one answer earns. A streak of 3 adds a fish treat (and again at 6,
 * 9 ...), a streak of 5 adds a piece of furniture (and again at 10 ...).
 */
export function rewardFor(type: QuestionType, outcome: Outcome, streakAfter: number, rng: Rng): ItemId[] {
  const out: ItemId[] = []
  const n = blocksFor(type, outcome)
  for (let i = 0; i < n; i++) out.push(weightedPick(rng, BLOCKS, (b) => b.weight).id)
  if (outcome === 'correct' || outcome === 'hint') {
    if (streakAfter > 0 && streakAfter % 3 === 0) out.push('vis')
    if (streakAfter > 0 && streakAfter % 5 === 0) out.push(weightedPick(rng, FURNITURE.filter((f) => f.weight > 0), (f) => f.weight).id)
  }
  return out
}

export function addItems(inv: Inventory, items: ItemId[]): Inventory {
  const out: Inventory = { ...inv }
  for (const id of items) out[id] = (out[id] ?? 0) + 1
  return out
}

export function takeItem(inv: Inventory, id: ItemId): Inventory | null {
  const have = inv[id] ?? 0
  if (have <= 0) return null
  return { ...inv, [id]: have - 1 }
}

/** Groups a list of item ids into counts, keeping first-seen order. */
export function countItems(items: ItemId[]): { id: ItemId; n: number }[] {
  const map = new Map<ItemId, number>()
  for (const id of items) map.set(id, (map.get(id) ?? 0) + 1)
  return [...map].map(([id, n]) => ({ id, n }))
}
