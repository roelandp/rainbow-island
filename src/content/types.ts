/** One word on a test list, in the Lexi Brawl words.json format plus optional extras. */
export interface Question {
  word: string
  definition: string
  hint?: string
  /** Example sentence with `___` where the word goes (without its article). */
  sentence?: string
}

/** A test as it lives in `src/content/toetsen/*.json`, keyed by its id. */
export interface ToetsFile {
  title: string
  /** yyyy-mm-dd, optional. A test without a date counts as the oldest. */
  date?: string
  theme?: string
  language?: string
  questions: Question[]
}

export interface Toets extends ToetsFile {
  id: string
  date?: string
}
