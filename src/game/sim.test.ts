import { describe, expect, it } from 'vitest'
import familie from '../content/toetsen/engels_familie.json'
import { parseToetsen } from '../content'
import { WordEngine } from '../engine/engine'
import { checkDutchAnswer, checkTyped } from '../engine/answer'
import { makeRng } from '../engine/rng'
import { statusOf, type Outcome, type WordState } from '../engine/words'

/**
 * A simulated Wyne: two rounds a day (morning and afternoon), driving the engine
 * the way src/ui/round.ts does (a fresh engine per round from the saved states,
 * avoid the last word, one record per question). Starts today, Sunday 4 October
 * 2026; the test is on the date in the list (Thursday 8 October). The key result
 * is what is seen and learned by the test; after that it carries on (the test
 * date passed, normal waiting times) to see how long learning everything takes.
 */

// Same as ROUND_LENGTH in src/ui/round.ts (not imported: that module needs the DOM and Three.js).
const ROUND_LENGTH = 10
const ROUNDS_PER_DAY = 2
const MAX_DAYS = 60
const MINUTE = 60_000
const DAY = 86_400_000
const START = new Date(2026, 9, 4, 0, 0, 0).getTime()

/** Chance of a wrong answer for a word in a given box. */
type MissChance = (box: number) => number
/** Gets better as a word climbs: about 70-80% right over the first days, 95% on known words. */
const IMPROVING: MissChance = (box) => [0.3, 0.25, 0.2, 0.15, 0.08, 0.05][box] ?? 0.05
/** A flat 20% wrong, whatever the box: a stress test, also known words keep slipping. */
const FLAT: MissChance = () => 0.2

interface DayLog {
  day: number
  date: string
  seen: number
  learned: number
  almost: number
  learnedSentences: number
  right: number
  asked: number
  types: Record<string, number>
}

const iso = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Round start times (minutes after midnight) for 2, 3 or 4 rounds a day. */
const ROUND_TIMES: Record<number, number[]> = {
  2: [8 * 60, 15 * 60 + 30],
  3: [8 * 60, 15 * 60 + 30, 19 * 60],
  4: [7 * 60 + 30, 12 * 60 + 30, 15 * 60 + 30, 19 * 60],
}

function simulate(seed: number, miss: MissChance, roundsPerDay = ROUNDS_PER_DAY) {
  const toets = parseToetsen({ familie } as never)[0]
  const testDay = toets.date ?? null
  const rng = makeRng(seed)
  let states: Record<string, WordState> = {}
  let lastWord: string | null = null
  let clock = START
  const now = () => clock

  const total = toets.questions.length
  const sentenceWords = new Set<string>()
  let daySeen: number | null = null
  let dayLearned: number | null = null
  /** Every word reached "geleerd" at least once (it can slip back after a miss). */
  let dayEverLearned: number | null = null
  const everLearned = new Set<string>()
  const log: DayLog[] = []
  /** The last day before the test (its evening is the last chance to practise). */
  let beforeTest: DayLog | null = null

  for (let day = 1; day <= MAX_DAYS; day++) {
    const dayStart = START + (day - 1) * DAY
    const entry: DayLog = { day, date: iso(dayStart), seen: 0, learned: 0, almost: 0, learnedSentences: 0, right: 0, asked: 0, types: {} }
    // Morning round around 8:00 (none on the test day itself: school), afternoon round around 15:30.
    const minutes = entry.date === testDay ? [15 * 60 + 30] : ROUND_TIMES[roundsPerDay]
    const starts = minutes.map((m) => dayStart + (m + Math.floor(rng.next() * 20)) * MINUTE)
    let engine: WordEngine | null = null
    for (const roundStart of starts) {
      clock = roundStart
      engine = new WordEngine({ toets, states, seed: Math.floor(rng.next() * 0x7fffffff), now })
      engine.avoid(lastWord)
      for (const q of engine.questions) if (engine.isSentence(q.word)) sentenceWords.add(q.word)
      for (let i = 0; i < ROUND_LENGTH; i++) {
        const pick = engine.next()
        const roll = rng.next()
        const p = miss(engine.state(pick.q.word).box)
        let outcome: Outcome
        if (pick.type === 'type') {
          // Typing: of the misses, 40% are one letter off; of the right ones, one in eight used a hint.
          outcome = roll < p * 0.6 ? 'wrong' : roll < p ? 'almost' : roll < p + (1 - p) / 8 ? 'hint' : 'correct'
          // Sanity: what the bot would type counts as right (English lists: the Dutch, first alternative).
          if (outcome === 'correct') {
            const check =
              engine.lang === 'en'
                ? checkDutchAnswer(pick.q.definition.split('/')[0].trim(), pick.q.definition)
                : checkTyped(pick.q.word.split('/')[0].trim(), pick.q.word, engine.lang)
            expect(check.result, `${pick.q.word} -> ${pick.q.definition}`).toBe('correct')
          }
        } else {
          outcome = roll < p ? 'wrong' : 'correct'
        }
        const { after } = engine.record(pick.q.word, pick.type, outcome)
        if (after === 'geleerd') everLearned.add(pick.q.word)
        entry.asked++
        if (outcome === 'correct' || outcome === 'hint') entry.right++
        entry.types[pick.type] = (entry.types[pick.type] ?? 0) + 1
        lastWord = pick.q.word
        // 15 to 35 seconds per question, longer after a miss (tap or type the right one).
        clock += (15 + Math.floor(rng.next() * 20) + (outcome === 'wrong' ? 15 : 0)) * 1000
      }
      states = engine.snapshot()
    }
    const e = engine!
    entry.seen = e.questions.filter((q) => e.state(q.word).seen > 0).length
    entry.learned = e.learnedCount()
    entry.almost = e.questions.filter((q) => e.status(q.word) === 'bijna').length
    entry.learnedSentences = [...sentenceWords].filter((w) => e.status(w) === 'geleerd').length
    log.push(entry)
    if (testDay && entry.date < testDay) beforeTest = entry
    if (daySeen === null && entry.seen === total) daySeen = day
    if (dayEverLearned === null && everLearned.size === total) dayEverLearned = day
    if (dayLearned === null && entry.learned === total) {
      dayLearned = day
      break
    }
  }
  const last = log[log.length - 1]
  return { roundsPerDay, total, testDay, sentences: sentenceWords.size, daySeen, dayLearned, dayEverLearned, everLearned: everLearned.size, beforeTest, last, log, states }
}

function summary(name: string, sim: ReturnType<typeof simulate>): string {
  const lines = sim.log.map(
    (d) =>
      `dag ${String(d.day).padStart(2)} ${d.date}${d.date === sim.testDay ? ' TOETS' : ''}: gezien ${String(d.seen).padStart(2)}/${sim.total}, geleerd ${String(d.learned).padStart(2)} (zinnen ${d.learnedSentences}/${sim.sentences}), bijna ${d.almost}, goed ${d.right}/${d.asked}, ${Object.entries(d.types).map(([k, v]) => `${k} ${v}`).join(' ')}`,
  )
  const notLearned = Object.entries(sim.states)
    .filter(([, s]) => statusOf(s) !== 'geleerd')
    .map(([w, s]) => `${w} (box ${s.box}, typed ${s.typedClean}, dir ${s.dirClean.reverse})`)
  const b = sim.beforeTest
  return [
    `== ${name}: ${sim.total} woorden (${sim.sentences} korte zinnen), ${sim.roundsPerDay} rondes van ${ROUND_LENGTH} per dag, toets ${sim.testDay ?? 'geen datum'}`,
    ...lines,
    b ? `Voor de toets (avond ${b.date}): gezien ${b.seen}/${sim.total}, geleerd ${b.learned}, bijna ${b.almost}, zinnen geleerd ${b.learnedSentences}/${sim.sentences}` : '',
    `Alles gezien op dag: ${sim.daySeen ?? 'nooit'}`,
    `Elk woord minstens een keer geleerd op dag: ${sim.dayEverLearned ?? `niet binnen ${MAX_DAYS} dagen (${sim.everLearned}/${sim.total})`}`,
    `Alles tegelijk geleerd op dag: ${sim.dayLearned ?? `niet binnen ${MAX_DAYS} dagen`}`,
    `Zinnen geleerd aan het eind: ${sim.last.learnedSentences} van ${sim.sentences}`,
    notLearned.length ? `Nog niet geleerd: ${notLearned.slice(0, 12).join(', ')}` : '',
  ].join('\n')
}

describe('simulation: two rounds a day from 4 October, about 75% right at the start', () => {
  const sim = simulate(20261004, IMPROVING)

  it('prints a summary', () => {
    console.log(summary('Wyne wordt beter per doosje', sim))
    expect(sim.log.length).toBeGreaterThan(0)
  })

  it('knows the test date of the list', () => {
    expect(sim.testDay).toBe('2026-10-08')
  })

  it('shows most words before the test, and every word within a week', () => {
    // 8 rounds of 10 before the test for 55 items, with misses coming back first:
    // not every word fits (the summary prints how many did). Guard against regressions.
    expect(sim.beforeTest).not.toBeNull()
    expect(sim.beforeTest!.seen).toBeGreaterThanOrEqual(Math.floor(sim.total * 0.75))
    expect(sim.daySeen).not.toBeNull()
    expect(sim.daySeen!).toBeLessThanOrEqual(8)
  })

  it('gets every word learned at least once within 60 days', () => {
    // "All learned at the same moment" is not asserted: a single miss drops a word back.
    expect(sim.dayEverLearned).not.toBeNull()
  })

  it('is deterministic', () => {
    const again = simulate(20261004, IMPROVING)
    expect(again.beforeTest?.learned).toBe(sim.beforeTest?.learned)
    expect(again.dayLearned).toBe(sim.dayLearned)
  })
})

describe('simulation: a flat 20% wrong, also on known words (stress test, reported only)', () => {
  it('prints a summary', () => {
    const sim = simulate(20261004, FLAT)
    console.log(summary('Altijd 20% fout', sim))
    expect(sim.daySeen).not.toBeNull()
  })
})

describe('simulation: sprint before the test, 2, 3 and 4 rounds a day', () => {
  const day = (sim: ReturnType<typeof simulate>, date: string) => sim.log.find((d) => d.date === date)!
  const sims = Object.fromEntries([2, 3, 4].map((r) => [r, simulate(20261004, IMPROVING, r)])) as Record<number, ReturnType<typeof simulate>>

  it('prints the numbers before the test', () => {
    for (const rounds of [2, 3, 4]) {
      const sim = sims[rounds]
      const tue = day(sim, '2026-10-06')
      const wed = day(sim, '2026-10-07')
      console.log(
        `${rounds} rondes per dag: di 6 okt gezien ${tue.seen}/${sim.total} (geleerd ${tue.learned}); wo 7 okt avond gezien ${wed.seen}/${sim.total}, geleerd ${wed.learned} (zinnen ${wed.learnedSentences}/${sim.sentences})`,
      )
    }
  })

  it('2 rounds a day: nearly every word comes by before the test', () => {
    // 80 questions before the test for 55 items, misses come back once: seeing all
    // of them AND learning half does not fit in 80 questions (see the 3-round case).
    const wed = day(sims[2], '2026-10-07')
    expect(wed.seen).toBeGreaterThanOrEqual(48)
    expect(wed.learned).toBeGreaterThanOrEqual(4)
  })

  it('3 rounds a day: all seen by Tuesday, half learned by Wednesday evening', () => {
    expect(day(sims[3], '2026-10-06').seen).toBe(55)
    expect(day(sims[3], '2026-10-07').learned).toBeGreaterThanOrEqual(28)
  })

  it('4 rounds a day: all seen by Tuesday, most learned by Wednesday evening', () => {
    expect(day(sims[4], '2026-10-06').seen).toBe(55)
    expect(day(sims[4], '2026-10-07').learned).toBeGreaterThanOrEqual(40)
  })
})
