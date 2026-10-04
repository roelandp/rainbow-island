import { ARTICLES, editDistance, normalize, splitArticle, stripAccents, wordKind } from './text'

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
export function checkTyped(input: string, word: string): TypedCheck {
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
