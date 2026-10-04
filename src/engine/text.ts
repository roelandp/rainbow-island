/** Text helpers for comparing Dutch words. Pure, no DOM. */

export const ARTICLES = ['de', 'het'] as const
export type Article = (typeof ARTICLES)[number]

/** Lowercase, trimmed, single spaces, NFC, straight quotes, no trailing punctuation. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim()
}

/** "creëren" -> "creeren". */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
}

export type WordKind = 'noun' | 'verb' | 'expression' | 'other'

/**
 * "de dialoog" is a noun with an article; "de spot drijven met" starts with an
 * article too, but is an expression because more than one word follows.
 */
export function splitArticle(word: string): { article: Article | null; bare: string } {
  const w = normalize(word)
  const m = /^(de|het) (\S+)$/.exec(w)
  if (m) return { article: m[1] as Article, bare: m[2] }
  return { article: null, bare: w }
}

export function wordKind(word: string): WordKind {
  const w = normalize(word)
  if (splitArticle(w).article) return 'noun'
  if (w.includes(' ')) return 'expression'
  if (/en$/.test(w) && w.length > 4) return 'verb'
  return 'other'
}

/** The word as it fits in a gap sentence: nouns lose their article. */
export function gapForm(word: string): string {
  if (!splitArticle(word).article) return word.trim()
  // Keep the original casing/diacritics of the bare part.
  return word.trim().replace(/^(de|het)\s+/i, '')
}

/**
 * Optimal string alignment distance (Levenshtein plus adjacent swaps), capped:
 * returns max+1 as soon as the distance is known to exceed `max`.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i++) d[i][0] = i
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1)
      d[i][j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}

export interface DiffChar {
  ch: string
  /** False when this letter of the correct word was missing, wrong or swapped in the answer. */
  ok: boolean
}

/**
 * Marks which letters of `target` the answer got right, so the correct word can
 * be shown with the differences highlighted. Accents count as different.
 */
export function diffMarks(answer: string, target: string): DiffChar[] {
  const a = [...answer]
  const b = [...target]
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i++) d[i][0] = i
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  const ok = new Array<boolean>(b.length).fill(false)
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    const same = a[i - 1].toLowerCase() === b[j - 1].toLowerCase()
    if (d[i][j] === d[i - 1][j - 1] + (same ? 0 : 1)) {
      ok[j - 1] = same
      i--
      j--
    } else if (d[i][j] === d[i - 1][j] + 1) {
      i--
    } else {
      j--
    }
  }
  return b.map((ch, k) => ({ ch, ok: ok[k] || ch === ' ' }))
}

/** "creëren" -> "c r e _ _ _ _" (first `n` letters, spaces between words kept wide). */
export function letterHint(word: string, shown = 3): string {
  const target = gapForm(word)
  let count = 0
  return [...target]
    .map((ch) => {
      if (ch === ' ') return ' '
      count++
      return count <= shown ? ch : '_'
    })
    .join(' ')
    .replace(/ {3}/g, '   ')
}
