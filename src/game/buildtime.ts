import type { Outcome } from '../engine/words'

/**
 * Build time is earned by learning, so building never replaces practising.
 * Seconds per answer, a bonus per newly learned word, a small start credit
 * and a cap so it cannot be hoarded. Once every word of the test is learned,
 * building is unlimited.
 */
export const START_SECONDS = 120
export const CAP_SECONDS = 5 * 60
export const LEARNED_BONUS = 60
/** Right answers in a row needed to unlock building again when the time is up. */
export const UNLOCK_RIGHT = 5
/**
 * The one extension: 5 right in a row buys exactly this much more building.
 * After that, only a full round (or practice test) earns time and frees the
 * extension again.
 */
export const EXTENSION_SECONDS = 90

/** The unlock run: right answers count up, a wrong one starts over, an almost-right one waits. */
export function nextRun(run: number, outcome: Outcome): number {
  if (outcome === 'correct' || outcome === 'hint') return run + 1
  if (outcome === 'wrong') return 0
  return run
}

export function secondsFor(outcome: Outcome): number {
  if (outcome === 'correct') return 20
  if (outcome === 'hint' || outcome === 'almost') return 10
  return 0
}

export function addTime(bank: number, seconds: number): number {
  return Math.max(0, Math.min(CAP_SECONDS, bank + seconds))
}

export function spendTime(bank: number, seconds: number): number {
  return Math.max(0, bank - seconds)
}

export function unlimited(learnedInToets: number, toetsSize: number): boolean {
  return toetsSize > 0 && learnedInToets >= toetsSize
}

/** "2:05" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
