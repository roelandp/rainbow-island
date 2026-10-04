import type { Question, Toets } from '../content/types'
import { buildOptions, type Options } from './distractors'
import { makeRng, weightedPick, type Rng } from './rng'
import { englishKind, langOf, type Lang } from './text'
import {
  applyAnswer,
  emptyState,
  isDue,
  reviveState,
  statusOf,
  typeFor,
  typeForEn,
  type Outcome,
  type QuestionType,
  type WordState,
  type WordStatus,
} from './words'

/** Why a word was picked; handy for tests and debugging. */
export type PickReason = 'retry' | 'due' | 'new' | 'known' | 'fallback'

export interface Pick {
  q: Question
  type: QuestionType
  reason: PickReason
  /** Buttons for the choice questions; null when typing. */
  options: Options | null
}

export interface EngineOptions {
  toets: Toets
  states?: Record<string, unknown>
  seed?: number
  now?: () => number
  /** Share of picks per pool. Defaults to 60% due or weak, 25% new, 15% known. */
  mix?: { due: number; fresh: number; known: number }
}

const DEFAULT_MIX = { due: 0.6, fresh: 0.25, known: 0.15 }
/** Rolling distance to the test for lists marked `soon` without a date. */
const SOON_MS = 7 * 86_400_000
/** English lists within this distance of the test run in sprint mode: many new words fast. */
export const SPRINT_MS = 5 * 86_400_000
/** Share of new words in sprint mode while unseen words remain. */
const SPRINT_FRESH = { min: 0.75, max: 0.9 }

/**
 * Picks the next word and question type, and keeps the learning state of one
 * test. Knows nothing about graphics or the DOM.
 */
export class WordEngine {
  readonly toets: Toets
  readonly lang: Lang
  private states = new Map<string, WordState>()
  private rng: Rng
  private now: () => number
  private mix: { due: number; fresh: number; known: number }
  private lastWord: string | null = null

  constructor(opts: EngineOptions) {
    this.toets = opts.toets
    this.lang = langOf(opts.toets.language)
    this.rng = makeRng(opts.seed ?? (Date.now() & 0x7fffffff))
    this.now = opts.now ?? (() => Date.now())
    this.mix = opts.mix ?? DEFAULT_MIX
    for (const q of this.toets.questions) {
      this.states.set(q.word, reviveState(opts.states?.[q.word]))
    }
  }

  get questions(): Question[] {
    return this.toets.questions
  }

  /** English short sentences ("What is your name?") are never typed and have their own learned rule. */
  isSentence(word: string): boolean {
    return this.lang === 'en' && englishKind(word) === 'sentence'
  }

  state(word: string): WordState {
    return this.states.get(word) ?? emptyState()
  }

  status(word: string): WordStatus {
    return statusOf(this.state(word))
  }

  learnedCount(): number {
    return this.questions.filter((q) => this.status(q.word) === 'geleerd').length
  }

  /** Milliseconds until the start of the test day, null without a date or once it passed. */
  msToTest(): number | null {
    // Date unknown but close: a rolling week, so new words come fast and waits are short.
    if (!this.toets.date) return this.toets.soon ? SOON_MS : null
    const ms = new Date(`${this.toets.date}T08:30:00`).getTime() - this.now()
    return ms > 0 ? ms : null
  }

  /**
   * Sprint mode (English lists, test within 5 days): mostly new words, typing
   * after one right choice, one clean typing = learned, sentences back after 2 hours.
   */
  sprint(toTest: number | null = this.msToTest()): boolean {
    return this.lang === 'en' && toTest !== null && toTest <= SPRINT_MS
  }

  snapshot(): Record<string, WordState> {
    const out: Record<string, WordState> = {}
    for (const [k, v] of this.states) out[k] = { ...v, right: { ...v.right }, dirClean: { ...v.dirClean }, dirAt: { ...v.dirAt } }
    return out
  }

  /** The next question. Never the same word twice in a row (unless the test has only one word). */
  next(): Pick {
    const now = this.now()
    const toTest = this.msToTest()
    const all = this.questions
    const notLast = all.filter((q) => q.word !== this.lastWord)
    const pool = notLast.length > 0 ? notLast : all

    // 1. A word that was missed and has waited long enough.
    const retries = pool.filter((q) => {
      const s = this.state(q.word)
      return s.retryIn === 0
    })
    if (retries.length > 0) {
      const q = retries.reduce((a, b) => (this.state(a.word).lastSeen <= this.state(b.word).lastSeen ? a : b))
      return this.make(q, 'retry')
    }

    // Words still waiting for their comeback stay out of the normal pools.
    const waiting = (q: Question) => this.state(q.word).retryIn > 0
    const free = pool.filter((q) => !waiting(q))
    const known = (s: WordState) => s.box >= 4

    const due = free.filter((q) => {
      const s = this.state(q.word)
      return s.seen > 0 && isDue(s, now, toTest)
    })
    const fresh = free.filter((q) => this.state(q.word).seen === 0)
    const strong = free.filter((q) => known(this.state(q.word)) && !isDue(this.state(q.word), now, toTest))

    // 2. Roughly 60% due or weak, 25% new, 15% known; an empty pool passes its turn on.
    const mix = this.mixFor(fresh.length, toTest)
    const r = this.rng.next()
    const order: PickReason[] =
      r < mix.due ? ['due', 'new', 'known'] : r < mix.due + mix.fresh ? ['new', 'due', 'known'] : ['known', 'due', 'new']
    for (const reason of order) {
      if (reason === 'due' && due.length > 0) {
        // Lowest box and longest overdue first.
        const q = weightedPick(this.rng, due, (x) => {
          const s = this.state(x.word)
          const overdue = Math.max(0, now - s.dueAt) / 3_600_000
          return (6 - s.box) * (6 - s.box) + Math.min(overdue, 24) / 6 + (s.last === 'wrong' || s.last === 'almost' ? 6 : 0)
        })
        return this.make(q, 'due')
      }
      if (reason === 'new' && fresh.length > 0) {
        return this.make(this.rng.pick(fresh), 'new')
      }
      if (reason === 'known' && strong.length > 0) {
        // Prefer known words that are due, then the ones not seen for longest.
        const q = weightedPick(this.rng, strong, (x) => {
          const s = this.state(x.word)
          const hours = Math.max(0, now - s.lastSeen) / 3_600_000
          return 1 + Math.min(hours, 72) + (isDue(s, now, toTest) ? 48 : 0) + (statusOf(s) !== 'geleerd' ? 24 : 0)
        })
        return this.make(q, 'known')
      }
    }

    // 3. Nothing due and nothing new: practise the weakest word that is not known yet.
    const rest = free.length > 0 ? free : pool
    const q = weightedPick(this.rng, rest, (x) => {
      const s = this.state(x.word)
      const hours = Math.max(0, now - s.lastSeen) / 3_600_000
      return (6 - s.box) * (6 - s.box) + Math.min(hours, 48) / 4
    })
    return this.make(q, 'fallback')
  }

  /**
   * Within two weeks of the test, while there are words never seen, new words
   * get at least 60% of the questions, more when time is short (up to 85%), so every word comes by soon and well before the test day.
   * Planned on two rounds of 10 a day. The rest stays repetition of missed and
   * due words, which is what makes them stick.
   */
  mixFor(unseen: number, toTest: number | null): { due: number; fresh: number; known: number } {
    if (toTest === null || unseen === 0 || toTest > 14 * 86_400_000) return this.mix
    const daysLeft = Math.max(1, toTest / 86_400_000 - 1)
    // Sprint: at least 75% new words while there are unseen ones, so every word comes by before the test.
    const needed = this.sprint(toTest)
      ? Math.min(SPRINT_FRESH.max, Math.max(SPRINT_FRESH.min, unseen / (daysLeft * 20)))
      : Math.min(0.85, Math.max(0.6, unseen / (daysLeft * 20)))
    if (needed <= this.mix.fresh) return this.mix
    const rest = 1 - needed
    const scale = rest / (this.mix.due + this.mix.known)
    return { due: this.mix.due * scale, fresh: needed, known: this.mix.known * scale }
  }

  /** A pick for a given word, e.g. for the practice test. */
  make(q: Question, reason: PickReason, forceType?: QuestionType): Pick {
    const s = this.state(q.word)
    const sentenceItem = this.isSentence(q.word)
    let type: QuestionType
    if (this.lang === 'en') {
      // English lists: only EN to NL. Choose the Dutch, or type it (never for short sentences).
      type = forceType ?? typeForEn(s, sentenceItem, this.rng.next(), this.sprint())
      if (type !== 'type' || sentenceItem) type = 'reverse'
    } else {
      type = forceType ?? typeFor(s, Boolean(q.sentence), this.rng.next())
      if (type === 'sentence' && !q.sentence) type = 'recognize'
    }
    let options: Options | null = null
    if (type === 'recognize') options = buildOptions(q, this.questions, this.rng, 'word', 4, this.lang)
    else if (type === 'reverse') options = buildOptions(q, this.questions, this.rng, 'definition', 4, this.lang)
    else if (type === 'sentence') options = buildOptions(q, this.questions, this.rng, 'gap', 4, this.lang)
    return { q, type, reason, options }
  }

  /** Stores one answer. Returns the status before and after, for "newly learned" lists. */
  record(word: string, type: QuestionType, outcome: Outcome): { before: WordStatus; after: WordStatus } {
    const prev = this.state(word)
    const before = statusOf(prev)
    // Every answer counts down the comebacks of the other words.
    for (const [k, s] of this.states) {
      if (k !== word && s.retryIn > 0) this.states.set(k, { ...s, retryIn: s.retryIn - 1 })
    }
    const next = applyAnswer(prev, type, outcome, this.now(), this.msToTest(), this.isSentence(word), this.sprint())
    this.states.set(word, next)
    this.lastWord = word
    return { before, after: statusOf(next) }
  }

  /** Never start with the word the previous round ended on. */
  avoid(word: string | null): void {
    if (word) this.lastWord = word
  }

  /** The words that need attention most, for the end of a round. */
  weakest(n = 3, among?: string[]): Question[] {
    const list = among ? this.questions.filter((q) => among.includes(q.word)) : this.questions
    return [...list]
      .filter((q) => this.state(q.word).seen > 0 && this.status(q.word) !== 'geleerd')
      .sort((a, b) => {
        const sa = this.state(a.word)
        const sb = this.state(b.word)
        const score = (s: WordState) => s.box * 10 - s.wrong * 3 - (s.last === 'wrong' ? 15 : s.last === 'almost' ? 8 : 0)
        return score(sa) - score(sb)
      })
      .slice(0, n)
  }
}
