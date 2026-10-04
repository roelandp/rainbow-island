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

// ---------- English ----------

/** Language of a test list. Dutch rules (de/het, -en) only apply to 'nl'. */
export type Lang = 'nl' | 'en'

export function langOf(language: string | undefined | null): Lang {
  return typeof language === 'string' && language.trim().toLowerCase().startsWith('en') ? 'en' : 'nl'
}

/** Lowercase, straight quotes, no . ? ! , or ellipsis anywhere, single spaces. */
export function normalizeEn(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/…|\.\.\./g, ' ')
    .replace(/[.?!,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "mum / mother" -> ["mum", "mother"]: every alternative counts as right. */
export function alternatives(word: string): string[] {
  const parts = word
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p !== '')
  return parts.length > 0 ? parts : [word.trim()]
}

/** "the brother" -> "brother". The English article is always optional. */
export function stripEnArticle(text: string): string {
  return text.replace(/^(the|a|an) (?=\S)/, '')
}

export type EnKind = 'sentence' | 'phrase' | 'word'

/**
 * Sentences end on . ? ! , have 4+ words or contain "..." (like "His name is ...").
 * 2 or 3 words is a phrase, otherwise a single word. Counted on the first alternative,
 * without a leading article.
 */
export function englishKind(word: string): EnKind {
  const w = word.trim()
  if (/[.?!]$/.test(w) || /…|\.\.\./.test(w)) return 'sentence'
  const first = stripEnArticle(normalizeEn(alternatives(w)[0]))
  const count = first === '' ? 0 : first.split(' ').length
  if (count >= 4) return 'sentence'
  if (count >= 2) return 'phrase'
  return 'word'
}

/** Kind of a word for picking distractors of the same kind, per language. */
export function kindOf(word: string, lang: Lang = 'nl'): string {
  return lang === 'en' ? englishKind(word) : wordKind(word)
}

/** The word as it goes in a gap sentence; English words stay as they are. */
export function gapFormFor(word: string, lang: Lang = 'nl'): string {
  return lang === 'en' ? word.trim() : gapForm(word)
}

/** Letter hint per alternative, never giving away more than about half a word: "m u _ / m o _ _ _ _". */
export function letterHintEn(word: string, shown = 2): string {
  return alternatives(word)
    .map((alt) => {
      const letters = [...alt].filter((ch) => ch !== ' ').length
      const n = Math.min(shown, Math.max(1, Math.ceil(letters / 2)))
      let count = 0
      return [...alt]
        .map((ch) => {
          if (ch === ' ') return ' '
          count++
          return count <= n ? ch : '_'
        })
        .join(' ')
        .replace(/ {3}/g, '   ')
    })
    .join('  /  ')
}

/** The alternative the answer was closest to, to show the differences against. */
export function closestAlternative(answer: string, word: string): string {
  const alts = alternatives(word)
  const a = stripEnArticle(normalizeEn(answer))
  if (a === '' || alts.length === 1) return alts.length === 1 ? word.trim() : alts[0]
  let best = alts[0]
  let bestD = Infinity
  for (const alt of alts) {
    const d = editDistance(a, stripEnArticle(normalizeEn(alt)), 20)
    if (d < bestD) {
      bestD = d
      best = alt
    }
  }
  return best
}

export type GapSlot = 'noun' | 'verb' | 'adj' | 'other'

/**
 * Rough word class of the gap, from the word in front of it: "my ___" or
 * "dad's ___" wants a noun, "I ___" a verb, "very ___" an adjective. Used to
 * keep gap distractors that would also fit (and confuse) out of the options.
 */
export function gapSlot(sentence: string | undefined): GapSlot {
  if (!sentence || !sentence.includes('___')) return 'other'
  const before = normalizeEn(sentence.split('___')[0]).split(' ').filter(Boolean)
  const prev = before[before.length - 1] ?? ''
  if (/'s$/.test(prev) || ['my', 'your', 'his', 'her', 'our', 'their', 'a', 'an', 'the', 'of', 'this'].includes(prev)) return 'noun'
  if (['i', 'we', 'you', 'they', 'to', "let's"].includes(prev)) return 'verb'
  if (['very', 'so', 'too', 'is', 'are', 'am'].includes(prev)) return 'adj'
  if (prev === '' && /^\s*___\s+(is|are)\b/i.test(sentence)) return 'noun'
  return 'other'
}
