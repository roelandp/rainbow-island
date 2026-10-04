/** Daily goal and days played. Mild: a missed day never costs anything. */

export const ROUNDS_PER_DAY = 2
export const SLEEP_AFTER_MS = 20 * 3_600_000

export interface Days {
  /** Days on which at least one round was finished. */
  played: number
  /** yyyy-mm-dd of the last finished round. */
  lastDay: string | null
  /** Timestamp of the last finished round. */
  lastAt: number
  /** Rounds finished on lastDay. */
  roundsToday: number
}

export function emptyDays(): Days {
  return { played: 0, lastDay: null, lastAt: 0, roundsToday: 0 }
}

export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Rounds done today, for the paw prints. */
export function roundsToday(days: Days, now: number): number {
  return days.lastDay === dayKey(now) ? days.roundsToday : 0
}

export function finishRound(days: Days, now: number): Days {
  const today = dayKey(now)
  if (days.lastDay === today) return { ...days, lastAt: now, roundsToday: days.roundsToday + 1 }
  return { played: days.played + 1, lastDay: today, lastAt: now, roundsToday: 1 }
}

export function goalDone(days: Days, now: number): boolean {
  return roundsToday(days, now) >= ROUNDS_PER_DAY
}

/** Katrien sleeps in her basket when the last round is more than 20 hours ago. */
export function isAsleep(days: Days, now: number): boolean {
  return days.lastAt > 0 && now - days.lastAt > SLEEP_AFTER_MS
}
