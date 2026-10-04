/** One word on a test list, in the Lexi Brawl words.json format plus optional extras. */
export interface Question {
  /** English lists: the English word or short sentence, "/" between alternatives. */
  word: string
  /** English lists: the Dutch translation. */
  definition: string
  hint?: string
  /** Example sentence with `___` where the word goes (without its Dutch article). */
  sentence?: string
}

/** A test as it lives in `src/content/toetsen/*.json`, keyed by its id. */
export interface ToetsFile {
  title: string
  /** yyyy-mm-dd, or null/absent when unknown: no countdown, normal waiting times. */
  date?: string | null
  theme?: string
  /** "nl" (default) or "en". */
  language?: string
  /** Test date unknown but close: pace as if the test is a week away (many new words, short waits). */
  soon?: boolean
  questions: Question[]
}

export interface Toets extends ToetsFile {
  id: string
  date?: string
  language: 'nl' | 'en'
}
