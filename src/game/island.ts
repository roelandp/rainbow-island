/** How big the island is, from the number of learned words over all tests. */

export const START_SIZE = 4
export const WORDS_PER_STEP = 5
/** 40 learned words: 8 steps, from 4x4 to 8x8. Words from more tests keep it growing a bit. */
export const MAX_SIZE = 12

export interface IslandSize {
  w: number
  d: number
  /** Number of growth steps taken. */
  step: number
}

/** Every 5 learned words add a strip, alternating width and depth: 4x4, 5x4, 5x5, 6x5 ... */
export function islandSize(learned: number): IslandSize {
  return sizeForStep(Math.floor(learned / WORDS_PER_STEP))
}

export function sizeForStep(step: number): IslandSize {
  const maxSteps = (MAX_SIZE - START_SIZE) * 2
  const s = Math.max(0, Math.min(maxSteps, step))
  return { w: START_SIZE + Math.ceil(s / 2), d: START_SIZE + Math.floor(s / 2), step: s }
}

/**
 * How full the bar towards the next strip of land is. Learned words fill a
 * fifth each; words that are almost learned fill half of that, so progress
 * shows from the first rounds. The bar only reaches the end when the strip is
 * really earned.
 */
export function growthProgress(learned: number, almost: number): { fill: number; toGo: number } {
  const inStep = learned % WORDS_PER_STEP
  const toGo = WORDS_PER_STEP - inStep
  const fill = Math.min(0.95, (inStep + 0.5 * Math.min(almost, toGo)) / WORDS_PER_STEP)
  return { fill, toGo }
}

/** Words to go until the next growth step. */
export function wordsToNextStep(learned: number): number {
  return WORDS_PER_STEP - (learned % WORDS_PER_STEP)
}

/** The lighthouse is the prize for learning every word of a test. */
export function earnsLighthouse(learnedInToets: number, toetsSize: number): boolean {
  return toetsSize > 0 && learnedInToets >= toetsSize
}
