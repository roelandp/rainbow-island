import { langOf } from '../engine/text'
import type { Question, Toets, ToetsFile } from './types'

export type { Question, Toets } from './types'

/**
 * Every JSON file in ./toetsen is picked up at build time. A file may hold one
 * test or several, keyed by id, exactly like the old Lexi Brawl words.json.
 */
const files = import.meta.glob('./toetsen/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, ToetsFile>
>

function isQuestion(q: unknown): q is Question {
  if (!q || typeof q !== 'object') return false
  const v = q as Question
  return typeof v.word === 'string' && v.word.trim() !== '' && typeof v.definition === 'string'
}

/** Turns raw file contents into clean tests. Pure, so it can be tested. */
export function parseToetsen(raw: Record<string, Record<string, ToetsFile>>): Toets[] {
  const out: Toets[] = []
  const seen = new Set<string>()
  for (const file of Object.values(raw)) {
    if (!file || typeof file !== 'object') continue
    for (const [id, t] of Object.entries(file)) {
      if (seen.has(id) || !t || !Array.isArray(t.questions)) continue
      const questions: Question[] = []
      const words = new Set<string>()
      for (const q of t.questions) {
        if (!isQuestion(q)) continue
        const word = q.word.trim().replace(/\s+/g, ' ')
        if (words.has(word)) continue
        words.add(word)
        const sentence = typeof q.sentence === 'string' && q.sentence.includes('___') ? q.sentence : undefined
        questions.push({ word, definition: q.definition.trim(), hint: q.hint?.trim() || undefined, sentence })
      }
      if (questions.length === 0) continue
      seen.add(id)
      const date = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : undefined
      const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : id
      out.push({ id, title, date, theme: t.theme, language: langOf(t.language), questions })
    }
  }
  // Newest first; undated tests last, in file order (stable sort).
  out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return out
}

export const TOETSEN: Toets[] = parseToetsen(files)

export function toetsById(id: string | null | undefined): Toets | undefined {
  return TOETSEN.find((t) => t.id === id)
}

/** Shown only when no list could be loaded at all, so the app never crashes. */
const EMPTY: Toets = { id: 'leeg', title: 'Engels', language: 'en', questions: [{ word: 'cat', definition: 'kat' }] }

/** The chosen test (a removed id falls back), or the first one. */
export function activeToets(chosen?: string | null): Toets {
  return toetsById(chosen) ?? TOETSEN[0] ?? EMPTY
}

/** Short Dutch label like "do 8 oktober". */
export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(`${date}T12:00:00`)
  const days = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

/** Whole calendar days from `now` until the test date; negative once it is over. */
export function daysUntil(date: string | null | undefined, now = Date.now()): number | null {
  if (!date) return null
  const test = new Date(`${date}T00:00:00`).getTime()
  const n = new Date(now)
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  return Math.round((test - today) / 86_400_000)
}
