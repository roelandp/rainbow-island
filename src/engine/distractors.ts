import type { Question } from '../content/types'
import type { Rng } from './rng'
import { gapForm, normalize, wordKind } from './text'

export type OptionField = 'word' | 'definition' | 'gap'

function textOf(q: Question, field: OptionField): string {
  if (field === 'definition') return q.definition
  if (field === 'gap') return gapForm(q.word)
  return q.word
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Picks `count` wrong options for `target`, preferably words of the same kind:
 * nouns with nouns, -en verbs with verbs, expressions with expressions. Never
 * the same option twice and never the right answer.
 */
export function pickDistractors(
  target: Question,
  pool: Question[],
  rng: Rng,
  field: OptionField,
  count = 3,
): Question[] {
  const kind = wordKind(target.word)
  const used = new Set<string>([normalize(textOf(target, field)), normalize(target.word)])
  const candidates = shuffle(
    rng,
    pool.filter((q) => normalize(q.word) !== normalize(target.word)),
  )
  const same = candidates.filter((q) => wordKind(q.word) === kind)
  const rest = candidates.filter((q) => wordKind(q.word) !== kind)
  const picked: Question[] = []
  for (const q of [...same, ...rest]) {
    if (picked.length >= count) break
    const key = normalize(textOf(q, field))
    const wordKey = normalize(q.word)
    if (used.has(key) || used.has(wordKey)) continue
    used.add(key)
    used.add(wordKey)
    picked.push(q)
  }
  return picked
}

export interface Options {
  /** What is shown on the buttons. */
  labels: string[]
  /** Index of the right one. */
  answer: number
}

/** The right option plus distractors, shuffled. */
export function buildOptions(target: Question, pool: Question[], rng: Rng, field: OptionField, count = 4): Options {
  const wrong = pickDistractors(target, pool, rng, field, count - 1)
  const all = shuffle(rng, [target, ...wrong])
  return {
    labels: all.map((q) => textOf(q, field)),
    answer: all.indexOf(target),
  }
}
