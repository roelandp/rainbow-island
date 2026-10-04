/** Per-word learning state and the Leitner rules. Pure, no DOM. */

export type QuestionType = 'recognize' | 'reverse' | 'sentence' | 'type'
export const QUESTION_TYPES: QuestionType[] = ['recognize', 'reverse', 'sentence', 'type']

/** correct = right without help, hint = right with a hint, almost = spelling nearly right. */
export type Outcome = 'correct' | 'hint' | 'almost' | 'wrong'

export type WordStatus = 'nieuw' | 'oefenen' | 'bijna' | 'geleerd'

export type Box = 0 | 1 | 2 | 3 | 4 | 5
export const MAX_BOX: Box = 5

export interface WordState {
  seen: number
  correct: number
  wrong: number
  box: Box
  /** Timestamp (ms) from which the word is due again. */
  dueAt: number
  /** Timestamp (ms) of the last answer, 0 when never seen. */
  lastSeen: number
  /** Right answers per question type (with hints included). */
  right: Record<QuestionType, number>
  /** Typed right without hint: what "geleerd" is built on. */
  typedClean: number
  /** Answers in a row that were right. */
  streak: number
  /** Wrong answers in a row. */
  wrongStreak: number
  /**
   * After a wrong or almost answer the word must come back soon: the number of
   * other questions still to wait. -1 when no comeback is pending.
   */
  retryIn: number
  last: Outcome | null
  /**
   * Short sentences only (never typed): right answers per direction that were at
   * least SPACING_MS apart. recognize = NL to EN, reverse = EN to NL.
   */
  dirClean: { recognize: number; reverse: number }
  /** When each direction was last counted in `dirClean` (ms, 0 = never). */
  dirAt: { recognize: number; reverse: number }
}

export function emptyState(): WordState {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    box: 0,
    dueAt: 0,
    lastSeen: 0,
    right: { recognize: 0, reverse: 0, sentence: 0, type: 0 },
    typedClean: 0,
    streak: 0,
    wrongStreak: 0,
    retryIn: -1,
    last: null,
    dirClean: { recognize: 0, reverse: 0 },
    dirAt: { recognize: 0, reverse: 0 },
  }
}

/** Fills gaps in a stored state, so older saves keep working. */
export function reviveState(raw: unknown): WordState {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const v = raw as Partial<WordState>
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
  const box = Math.max(0, Math.min(MAX_BOX, Math.round(num(v.box, 0)))) as Box
  const pair = (x: unknown) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return { recognize: num(o.recognize, 0), reverse: num(o.reverse, 0) }
  }
  const right = { ...base.right }
  if (v.right && typeof v.right === 'object') {
    for (const t of QUESTION_TYPES) right[t] = num((v.right as Record<string, unknown>)[t], 0)
  }
  return {
    seen: num(v.seen, 0),
    correct: num(v.correct, 0),
    wrong: num(v.wrong, 0),
    box,
    dueAt: num(v.dueAt, 0),
    lastSeen: num(v.lastSeen, 0),
    right,
    typedClean: num(v.typedClean, 0),
    streak: num(v.streak, 0),
    wrongStreak: num(v.wrongStreak, 0),
    retryIn: num(v.retryIn, -1),
    last: v.last === 'correct' || v.last === 'hint' || v.last === 'almost' || v.last === 'wrong' ? v.last : null,
    dirClean: pair(v.dirClean),
    dirAt: pair(v.dirAt),
  }
}

/** Waiting time per box, in days: 0, 0 (same round), 1, 2, 4, 8. */
export const BOX_DAYS = [0, 0, 1, 2, 4, 8]
const DAY = 86_400_000
const HOUR = 3_600_000
/** Two clean typings count separately only with this much time between them. */
export const SPACING_MS = 2 * HOUR

/**
 * With the test close by there is no time for long gaps: the waiting times
 * shrink. Two weeks or more before the test (or without a date) they are the
 * normal Leitner days; four days before, they are about a third of that.
 */
export function intervalMs(box: Box, msToTest: number | null): number {
  const days = BOX_DAYS[box] ?? 0
  if (days === 0) return 0
  let factor = 1
  if (msToTest !== null && msToTest > 0) factor = Math.max(0.25, Math.min(1, msToTest / (14 * DAY)))
  // Never shorter than a few hours, so a word does not bounce back in the same sitting.
  return Math.max(4 * HOUR, days * DAY * factor)
}

/** Whether the word is due, including the rule that the day before the test everything below box 4 comes back. */
export function isDue(s: WordState, now: number, msToTest: number | null): boolean {
  if (s.seen === 0) return false
  if (s.dueAt <= now) return true
  if (msToTest !== null && msToTest > 0 && msToTest <= 1.5 * DAY && s.box < 4) return true
  return false
}

/** Right answers needed per direction (spaced) before a short sentence counts as learned. */
export const SENTENCE_DIR_NEEDED = 2

/**
 * A short sentence is never typed: it is learned at box 4+ with two right
 * EN to NL answers at least SPACING_MS apart.
 */
export function sentenceLearned(s: WordState): boolean {
  return s.box >= 4 && s.dirClean.reverse >= SENTENCE_DIR_NEEDED
}

/**
 * Words: box 4+ and typed right twice (spaced). Short sentences: box 4+ and right
 * twice EN to NL (spaced). `dirClean` only grows for sentences, so this needs no flag.
 */
export function statusOf(s: WordState): WordStatus {
  if (s.seen === 0) return 'nieuw'
  if (s.box >= 4 && (s.typedClean >= 2 || sentenceLearned(s))) return 'geleerd'
  if (s.box >= 3) return 'bijna'
  return 'oefenen'
}

/**
 * The ladder: recognise the word, then the meaning, then the gap sentence (if
 * there is one), then typing. Each step needs one right answer. Typing stays
 * the main question once reached, with now and then a choice question for
 * variety on words that are already strong. After two misses in a row while
 * typing, one easier question helps to get the word back.
 */
export function typeFor(s: WordState, hasSentence: boolean, roll: number): QuestionType {
  if (s.right.recognize < 1) return 'recognize'
  if (s.right.reverse < 1) return 'reverse'
  if (hasSentence && s.right.sentence < 1) return 'sentence'
  if (s.wrongStreak >= 2) return hasSentence ? 'sentence' : 'recognize'
  if (s.box >= 4 && s.typedClean >= 2 && roll < 0.25) {
    const pool: QuestionType[] = hasSentence ? ['reverse', 'sentence'] : ['reverse']
    return pool[Math.floor((roll / 0.25) * pool.length)]
  }
  return 'type'
}

/** Right EN to NL choices before an English word is typed (in Dutch). */
export const EN_CHOICE_STEPS = 2

/**
 * English lists: the question is always English, the answer always Dutch.
 * Choose the Dutch (EN_CHOICE_STEPS right answers), then type the Dutch. Short
 * sentences are only ever chosen. Two misses in a row while typing: one choice
 * question to get the word back; strong words now and then get a choice for variety.
 */
export function typeForEn(s: WordState, isSentence: boolean, roll: number): QuestionType {
  if (isSentence) return 'reverse'
  if (s.right.type === 0 && s.right.reverse < EN_CHOICE_STEPS) return 'reverse'
  if (s.wrongStreak >= 2) return 'reverse'
  if (s.box >= 4 && s.typedClean >= 2 && roll < 0.2) return 'reverse'
  return 'type'
}

/**
 * Applies one answer. Right: up a box. Wrong: back to box 1 and comes back
 * within 3 questions. Almost: no box gain and comes back soon. Hint: right, but
 * no box gain. `isSentence`: a short sentence, which is never typed, so its
 * choice answers can reach the top boxes (box 4+ only with time in between)
 * and count per direction.
 */
export function applyAnswer(
  prev: WordState,
  type: QuestionType,
  outcome: Outcome,
  now: number,
  msToTest: number | null,
  isSentence = false,
): WordState {
  const s: WordState = { ...prev, right: { ...prev.right }, dirClean: { ...prev.dirClean }, dirAt: { ...prev.dirAt } }
  s.seen++
  s.lastSeen = now
  s.last = outcome

  if (outcome === 'correct' || outcome === 'hint') {
    s.correct++
    s.right[type]++
    s.streak++
    s.wrongStreak = 0
    s.retryIn = -1
    if (outcome === 'correct' && type === 'type') {
      // Typing it right without help proves the word is known: the easier
      // steps are skipped, unless it was just missed.
      // The top box and "geleerd" need some time between two typings, not two in one sitting.
      const spaced = prev.typedClean === 0 || now - prev.lastSeen >= SPACING_MS
      if (spaced) s.typedClean++
      const fresh = prev.last !== 'wrong' && prev.last !== 'almost'
      let box = Math.min(MAX_BOX, fresh ? Math.max(prev.box + 1, 4) : prev.box + 1)
      if (!spaced) box = Math.min(box, Math.max(prev.box, 4))
      s.box = box as Box
      s.right.recognize = Math.max(1, s.right.recognize)
      s.right.reverse = Math.max(1, s.right.reverse)
      s.right.sentence = Math.max(1, s.right.sentence)
    } else if (outcome === 'correct' && isSentence) {
      const spacedBox = prev.lastSeen === 0 || now - prev.lastSeen >= SPACING_MS
      if (s.box < 3 || spacedBox) s.box = Math.min(MAX_BOX, s.box + 1) as Box
      if (type === 'reverse' || type === 'recognize') {
        const at = prev.dirAt[type]
        if (prev.dirClean[type] === 0 || now - at >= SPACING_MS) {
          s.dirClean[type]++
          s.dirAt[type] = now
        }
      }
    } else if (outcome === 'correct') {
      // Choice questions lift a word up to box 3 at most; the top boxes are earned by typing.
      if (s.box < 3) s.box = (s.box + 1) as Box
      // Recognised right the very first time: the meaning is known, skip the reverse step.
      if (prev.seen === 0 && type === 'recognize') s.right.reverse = Math.max(1, s.right.reverse)
    }
    s.dueAt = now + intervalMs(s.box, msToTest)
  } else if (outcome === 'almost') {
    s.streak = 0
    s.wrongStreak = 0
    s.box = Math.max(1, Math.min(s.box, 3)) as Box
    s.retryIn = 3
    s.dueAt = now
  } else {
    s.wrong++
    s.streak = 0
    s.wrongStreak++
    s.box = 1
    s.retryIn = 2
    s.dueAt = now
  }
  return s
}
