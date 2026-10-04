import type { Question } from '../content/types'
import type { Rng } from './rng'
import { englishKind, gapFormFor, gapSlot, kindOf, normalize, type Lang } from './text'

export type OptionField = 'word' | 'definition' | 'gap'

function textOf(q: Question, field: OptionField, lang: Lang): string {
  if (field === 'definition') return q.definition
  if (field === 'gap') return gapFormFor(q.word, lang)
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
 * Dutch nouns with nouns, -en verbs with verbs, expressions with expressions;
 * English sentences with sentences, phrases with phrases, words with words. Never
 * the same option twice and never the right answer.
 */
export function pickDistractors(
  target: Question,
  pool: Question[],
  rng: Rng,
  field: OptionField,
  count = 3,
  lang: Lang = 'nl',
): Question[] {
  const kind = kindOf(target.word, lang)
  const used = new Set<string>([normalize(textOf(target, field, lang)), normalize(target.word)])
  const candidates = shuffle(
    rng,
    pool.filter((q) => normalize(q.word) !== normalize(target.word)),
  )
  const same = candidates.filter((q) => kindOf(q.word, lang) === kind)
  const rest = candidates.filter((q) => kindOf(q.word, lang) !== kind)
  let order = [...same, ...rest]
  if (lang === 'en' && field === 'gap') {
    // English gap: options that would also fit the gap make it a guess, so prefer
    // words from a different slot ("read" for "My ___ is a boy."), and never a
    // whole sentence unless nothing else is left.
    const slot = gapSlot(target.sentence)
    const rank = (q: Question) =>
      (englishKind(q.word) === 'sentence' ? 4 : 0) + (slot !== 'other' && gapSlot(q.sentence) === slot ? 2 : 0) + (kindOf(q.word, lang) === kind ? 0 : 1)
    order = order.map((q, i) => ({ q, i, r: rank(q) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.q)
  }
  const picked: Question[] = []
  for (const q of order) {
    if (picked.length >= count) break
    const key = normalize(textOf(q, field, lang))
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
export function buildOptions(target: Question, pool: Question[], rng: Rng, field: OptionField, count = 4, lang: Lang = 'nl'): Options {
  const wrong = pickDistractors(target, pool, rng, field, count - 1, lang)
  const all = shuffle(rng, [target, ...wrong])
  return {
    labels: all.map((q) => textOf(q, field, lang)),
    answer: all.indexOf(target),
  }
}
