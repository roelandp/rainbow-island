/** Small seeded PRNG so tests are deterministic. */
export interface Rng {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: T[]): T
}

export function makeRng(seed = 0x9e3779b9): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}

/** Weighted draw. Weights must be > 0. */
export function weightedPick<T>(rng: Rng, items: T[], weight: (item: T) => number): T {
  let total = 0
  for (const item of items) total += Math.max(weight(item), 1e-6)
  let r = rng.next() * total
  for (const item of items) {
    r -= Math.max(weight(item), 1e-6)
    if (r <= 0) return item
  }
  return items[items.length - 1]
}
