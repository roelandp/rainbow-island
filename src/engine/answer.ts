import { ARTICLES, alternatives, editDistance, normalize, normalizeEn, splitArticle, stripAccents, stripEnArticle, wordKind, type Lang } from './text'

export type TypedResult = 'correct' | 'almost' | 'wrong'
/** Why an answer was only "almost": wrong article, missing accent or one letter off. */
export type AlmostReason = 'article' | 'accent' | 'typo'

export interface TypedCheck {
  result: TypedResult
  reason?: AlmostReason
}

/**
 * Checks a typed answer against the word on the list.
 * - case, outer spaces and double spaces never matter
 * - the article of a noun is optional: "dialoog" and "de dialoog" are both right
 * - a wrong article, a missing accent or one letter off is "almost": on the test
 *   spelling counts, so almost is never right
 */
export function checkTyped(input: string, word: string, lang: Lang = 'nl'): TypedCheck {
  if (lang === 'en') return checkTypedEn(input, word)
  const answer = normalize(input)
  const full = normalize(word)
  if (answer === '') return { result: 'wrong' }

  const { article, bare } = splitArticle(full)
  const accepted = article ? [full, bare] : [full]
  if (accepted.includes(answer)) return { result: 'correct' }

  if (article) {
    // "het dialoog" or "een dialoog": right word, wrong or extra article.
    const other = splitArticle(answer)
    const swapped = /^een (\S+)$/.exec(answer)?.[1] ?? (other.article && other.article !== article ? other.bare : null)
    if (swapped === bare) return { result: 'almost', reason: 'article' }
  }

  const plain = (s: string) => stripAccents(s)
  const plainAccepted = accepted.map(plain)
  const plainAnswer = plain(answer)
  if (plainAccepted.includes(plainAnswer)) return { result: 'almost', reason: 'accent' }

  // One letter off (missing, extra, wrong or two swapped), for words of 4+ letters.
  const candidates = article ? [...plainAccepted, ...ARTICLES.filter((a) => a !== article).map((a) => `${a} ${plain(bare)}`)] : plainAccepted
  for (const target of candidates) {
    const letters = target.replace(/^(de|het) /, '').replace(/ /g, '').length
    if (letters >= 4 && editDistance(plainAnswer, target, 1) <= 1) return { result: 'almost', reason: 'typo' }
  }

  // "spot drijven met" for "de spot drijven met": the expression without its article.
  const exprArticle = /^(de|het) (.+ .+)$/.exec(full)
  if (exprArticle && plainAnswer === plain(exprArticle[2])) return { result: 'almost', reason: 'article' }

  // Expressions: forgive a missing or doubled space.
  if (wordKind(full) === 'expression' && plainAnswer.replace(/ /g, '') === plain(full).replace(/ /g, '')) {
    return { result: 'almost', reason: 'typo' }
  }

  return { result: 'wrong' }
}

/**
 * English: every "/" alternative counts, "the", "a" or "an" in front is always
 * optional, case and . ? ! , never matter. One letter off (4+ letters) or a
 * missing space is "almost".
 */
export function checkTypedEn(input: string, word: string): TypedCheck {
  const answer = stripEnArticle(normalizeEn(input))
  if (answer === '') return { result: 'wrong' }
  const accepted = alternatives(word).map((a) => stripEnArticle(normalizeEn(a))).filter((a) => a !== '')
  if (accepted.includes(answer)) return { result: 'correct' }
  // The whole "mum / mother" typed out is right too.
  const slash = (t: string) => t.replace(/\s*\/\s*/g, '/')
  if (word.includes('/') && slash(answer) === slash(stripEnArticle(normalizeEn(word)))) return { result: 'correct' }
  for (const target of accepted) {
    if (target.replace(/ /g, '').length >= 4 && editDistance(answer, target, 1) <= 1) return { result: 'almost', reason: 'typo' }
    if (target.includes(' ') && answer.replace(/ /g, '') === target.replace(/ /g, '')) return { result: 'almost', reason: 'typo' }
  }
  return { result: 'wrong' }
}
