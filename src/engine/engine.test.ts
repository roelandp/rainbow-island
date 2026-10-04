import { describe, expect, it } from 'vitest'
import { TOETSEN, activeToets, parseToetsen } from '../content'
import type { Toets } from '../content/types'
import { checkTyped } from './answer'
import { buildOptions, pickDistractors } from './distractors'
import { WordEngine } from './engine'
import { makeRng } from './rng'
import { diffMarks, letterHint, splitArticle, wordKind } from './text'
import { applyAnswer, emptyState, intervalMs, isDue, statusOf, typeFor, type WordState } from './words'

const toets = activeToets()
const DAY = 86_400_000

describe('content', () => {
  it('loads the test of 8 October with 40 words and sentences', () => {
    expect(TOETSEN.length).toBeGreaterThan(0)
    expect(toets.id).toBe('toets_8_oktober')
    expect(toets.questions).toHaveLength(40)
    for (const q of toets.questions) {
      expect(q.sentence?.split('___')).toHaveLength(2)
      expect(q.sentence).not.toMatch(/[—–]/)
    }
  })

  it('picks the newest dated test as active and accepts the old format', () => {
    const list = parseToetsen({
      a: { oud: { title: 'Oud', questions: [{ word: 'de kat', definition: 'Een dier.' }] } },
      b: { nieuw: { title: 'Nieuw', date: '2026-11-01', questions: [{ word: 'de hond', definition: 'Ook een dier.' }] } },
      c: { leeg: { title: 'Leeg', date: '2027-01-01', questions: [] } },
    } as never)
    expect(list.map((t) => t.id)).toEqual(['nieuw', 'oud'])
  })
})

describe('text', () => {
  it('splits articles only for single nouns', () => {
    expect(splitArticle('de dialoog')).toEqual({ article: 'de', bare: 'dialoog' })
    expect(splitArticle('de spot drijven met').article).toBeNull()
    expect(wordKind('de spot drijven met')).toBe('expression')
    expect(wordKind('op de hak nemen')).toBe('expression')
    expect(wordKind('creëren')).toBe('verb')
    expect(wordKind('het lettertype')).toBe('noun')
    expect(wordKind('cursief')).toBe('other')
  })

  it('makes a letter hint', () => {
    expect(letterHint('creëren')).toBe('c r e _ _ _ _')
    expect(letterHint('de dialoog')).toBe('d i a _ _ _ _')
  })

  it('marks the differences', () => {
    const marks = diffMarks('creeren', 'creëren')
    expect(marks.filter((m) => !m.ok).map((m) => m.ch)).toEqual(['ë'])
    expect(diffMarks('dialoog', 'dialoog').every((m) => m.ok)).toBe(true)
  })
})

describe('checkTyped', () => {
  it('accepts the word with or without article, any case and spacing', () => {
    expect(checkTyped('dialoog', 'de dialoog').result).toBe('correct')
    expect(checkTyped('  De   Dialoog ', 'de dialoog').result).toBe('correct')
    expect(checkTyped('lettertype', 'het lettertype').result).toBe('correct')
    expect(checkTyped('creëren', 'creëren').result).toBe('correct')
  })

  it('calls a wrong article almost', () => {
    expect(checkTyped('het dialoog', 'de dialoog')).toEqual({ result: 'almost', reason: 'article' })
    expect(checkTyped('de lettertype', 'het lettertype')).toEqual({ result: 'almost', reason: 'article' })
    expect(checkTyped('een dialoog', 'de dialoog')).toEqual({ result: 'almost', reason: 'article' })
  })

  it('calls a missing trema almost, never right', () => {
    expect(checkTyped('creeren', 'creëren')).toEqual({ result: 'almost', reason: 'accent' })
  })

  it('calls one letter off almost', () => {
    expect(checkTyped('dialoug', 'de dialoog').result).toBe('almost')
    expect(checkTyped('kwesten', 'kwetsen').result).toBe('almost') // swapped letters
    expect(checkTyped('gedetaileerd', 'gedetailleerd').result).toBe('almost')
    expect(checkTyped('animatie!', 'de animatie').result).toBe('correct')
  })

  it('says wrong for other words or two letters off', () => {
    expect(checkTyped('monoloog', 'de dialoog').result).toBe('wrong')
    expect(checkTyped('gedetaljeert', 'gedetailleerd').result).toBe('wrong')
    expect(checkTyped('', 'de dialoog').result).toBe('wrong')
  })

  it('handles expressions', () => {
    expect(checkTyped('op de hak nemen', 'op de hak nemen').result).toBe('correct')
    expect(checkTyped('Op de hak nemen.', 'op de hak nemen').result).toBe('correct')
    expect(checkTyped('spot drijven met', 'de spot drijven met')).toEqual({ result: 'almost', reason: 'article' })
    expect(checkTyped('drijven', 'de spot drijven met').result).toBe('wrong')
    expect(checkTyped('de spot drijven met', 'de spot drijven met').result).toBe('correct')
    expect(checkTyped('in trek zjin', 'in trek zijn').result).toBe('almost')
    expect(checkTyped('opde hak nemen', 'op de hak nemen').result).toBe('almost')
  })
})

describe('distractors', () => {
  it('never repeats an option and never includes the answer twice', () => {
    const rng = makeRng(7)
    for (const q of toets.questions) {
      for (const field of ['word', 'definition', 'gap'] as const) {
        const opts = buildOptions(q, toets.questions, rng, field)
        expect(opts.labels).toHaveLength(4)
        expect(new Set(opts.labels.map((l) => l.toLowerCase())).size).toBe(4)
        expect(opts.answer).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('prefers the same kind of word', () => {
    const rng = makeRng(3)
    const noun = toets.questions.find((q) => q.word === 'de dialoog')!
    const verb = toets.questions.find((q) => q.word === 'creëren')!
    const expr = toets.questions.find((q) => q.word === 'op de hak nemen')!
    for (let i = 0; i < 20; i++) {
      expect(pickDistractors(noun, toets.questions, rng, 'word').every((d) => wordKind(d.word) === 'noun')).toBe(true)
      expect(pickDistractors(verb, toets.questions, rng, 'word').every((d) => wordKind(d.word) === 'verb')).toBe(true)
      // There are only 3 expressions, so 2 of the same kind plus 1 other.
      const e = pickDistractors(expr, toets.questions, rng, 'word')
      expect(e.filter((d) => wordKind(d.word) === 'expression')).toHaveLength(2)
    }
  })

  it('copes with a tiny list', () => {
    const tiny = [
      { word: 'de kat', definition: 'Een dier.' },
      { word: 'de hond', definition: 'Een dier.' },
    ]
    const opts = buildOptions(tiny[0], tiny, makeRng(1), 'definition')
    expect(opts.labels).toEqual(['Een dier.'])
  })
})

describe('leitner', () => {
  const t0 = new Date('2026-09-01T10:00:00').getTime()

  it('moves up a box when right and back to box 1 when wrong', () => {
    let s = emptyState()
    s = applyAnswer(s, 'recognize', 'correct', t0, null)
    expect(s.box).toBe(1)
    s = applyAnswer(s, 'reverse', 'correct', t0, null)
    expect(s.box).toBe(2)
    expect(s.dueAt).toBe(t0 + DAY)
    s = applyAnswer(s, 'sentence', 'correct', t0, null)
    expect(s.box).toBe(3)
    s = applyAnswer(s, 'sentence', 'correct', t0, null)
    expect(s.box).toBe(3) // choice questions stop at box 3
    s = applyAnswer(s, 'type', 'correct', t0, null)
    expect(s.box).toBe(4)
    expect(statusOf(s)).toBe('bijna')
    // Typed again in the same sitting: not yet learned.
    const again = applyAnswer(s, 'type', 'correct', t0 + 60_000, null)
    expect(again.box).toBe(4)
    expect(statusOf(again)).toBe('bijna')
    s = applyAnswer(s, 'type', 'correct', t0 + 3 * 3_600_000, null)
    expect(s.box).toBe(5)
    expect(statusOf(s)).toBe('geleerd')
    s = applyAnswer(s, 'type', 'wrong', t0, null)
    expect(s.box).toBe(1)
    expect(s.retryIn).toBe(2)
    expect(statusOf(s)).toBe('oefenen')
  })

  it('gives no box for a hint or an almost', () => {
    let s: WordState = { ...emptyState(), box: 3, seen: 3, right: { recognize: 1, reverse: 1, sentence: 1, type: 0 } }
    s = applyAnswer(s, 'type', 'hint', t0, null)
    expect(s.box).toBe(3)
    expect(s.typedClean).toBe(0)
    s = applyAnswer(s, 'type', 'almost', t0, null)
    expect(s.box).toBe(3)
    expect(s.retryIn).toBe(3)
  })

  it('a clean typed answer skips the easy steps', () => {
    const s = applyAnswer(emptyState(), 'type', 'correct', t0, null)
    expect(s.box).toBe(4)
    expect(typeFor(s, true, 0.9)).toBe('type')
  })

  it('shrinks waiting times close to the test and brings weak words back the day before', () => {
    expect(intervalMs(2, null)).toBe(DAY)
    expect(intervalMs(5, null)).toBe(8 * DAY)
    expect(intervalMs(2, 4 * DAY)).toBeLessThan(DAY / 2)
    expect(intervalMs(1, 4 * DAY)).toBe(0)
    const s: WordState = { ...emptyState(), seen: 2, box: 3, dueAt: t0 + 5 * DAY }
    expect(isDue(s, t0, 10 * DAY)).toBe(false)
    expect(isDue(s, t0, DAY)).toBe(true)
    expect(isDue({ ...s, box: 4 }, t0, DAY)).toBe(false)
  })

  it('climbs the question types from easy to hard', () => {
    let s = emptyState()
    expect(typeFor(s, true, 0.5)).toBe('recognize')
    expect(typeFor(applyAnswer(s, 'recognize', 'correct', t0, null), true, 0.5)).toBe('sentence') // known at first sight
    s = applyAnswer(s, 'recognize', 'wrong', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('recognize')
    s = applyAnswer(s, 'recognize', 'correct', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('reverse')
    s = applyAnswer(s, 'reverse', 'correct', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('sentence')
    expect(typeFor(s, false, 0.5)).toBe('type') // no sentence: skip the gap question
    s = applyAnswer(s, 'sentence', 'correct', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('type')
    s = applyAnswer(s, 'type', 'wrong', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('type')
    s = applyAnswer(s, 'type', 'wrong', t0, null)
    expect(typeFor(s, true, 0.5)).toBe('sentence') // two misses: one easier question
  })
})

describe('WordEngine', () => {
  const start = new Date('2026-10-04T10:00:00').getTime()

  function engine(seed = 1, t = start, states?: Record<string, unknown>, theToets: Toets = toets) {
    let now = t
    const e = new WordEngine({ toets: theToets, seed, now: () => now, states })
    return { e, tick: (ms: number) => (now += ms) }
  }

  it('never asks the same word twice in a row', () => {
    const { e, tick } = engine(5)
    const rng = makeRng(9)
    let last = ''
    for (let i = 0; i < 500; i++) {
      const p = e.next()
      expect(p.q.word).not.toBe(last)
      last = p.q.word
      e.record(p.q.word, p.type, rng.next() < 0.75 ? 'correct' : 'wrong')
      tick(20_000)
    }
  })

  it('brings a wrong word back within 3 questions', () => {
    const { e } = engine(11)
    const rng = makeRng(4)
    for (let trial = 0; trial < 60; trial++) {
      const p = e.next()
      e.record(p.q.word, p.type, 'wrong')
      let back = -1
      for (let k = 1; k <= 3; k++) {
        const n = e.next()
        if (n.q.word === p.q.word) {
          back = k
          e.record(n.q.word, n.type, 'correct')
          break
        }
        e.record(n.q.word, n.type, rng.next() < 0.9 ? 'correct' : 'almost')
      }
      expect(back).toBeGreaterThan(0)
    }
  })

  it('mixes due, new and known words roughly 60/25/15', () => {
    // Half the words are known, a third are due, the rest new.
    const states: Record<string, unknown> = {}
    toets.questions.forEach((q, i) => {
      if (i < 15) states[q.word] = { ...emptyState(), seen: 4, box: 5, typedClean: 2, dueAt: start + 5 * DAY, lastSeen: start - DAY }
      else if (i < 28) states[q.word] = { ...emptyState(), seen: 2, box: 2, dueAt: start - 1000, lastSeen: start - DAY }
    })
    const counts = { due: 0, new: 0, known: 0, retry: 0, fallback: 0 }
    // Far from any test the normal mix applies.
    const calm: Toets = { ...toets, date: undefined }
    for (let seed = 0; seed < 1000; seed++) {
      const { e } = engine(seed, start, states, calm)
      counts[e.next().reason]++
    }
    expect(counts.due / 1000).toBeGreaterThan(0.54)
    expect(counts.due / 1000).toBeLessThan(0.66)
    expect(counts.new / 1000).toBeGreaterThan(0.2)
    expect(counts.new / 1000).toBeLessThan(0.3)
    expect(counts.known / 1000).toBeGreaterThan(0.11)
    expect(counts.known / 1000).toBeLessThan(0.19)
  })

  it('learns the whole list with a good student, and statuses climb', () => {
    const { e, tick } = engine(21)
    const rng = makeRng(2)
    for (let day = 0; day < 4; day++) {
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 12; i++) {
          const p = e.next()
          const ok = rng.next() < 0.85
          e.record(p.q.word, p.type, ok ? 'correct' : 'wrong')
          tick(20_000)
        }
        tick(3 * 3_600_000)
      }
      tick(DAY - 9 * 3_600_000 - 36 * 20_000)
    }
    const statuses = toets.questions.map((q) => e.status(q.word))
    expect(statuses.filter((s) => s === 'nieuw').length).toBeLessThanOrEqual(2)
    expect(statuses.filter((s) => s === 'geleerd').length).toBeGreaterThan(3)
  })

  it('shows new words faster when the test is close', () => {
    const { e } = engine(1, new Date('2026-10-06T10:00:00').getTime())
    const mix = e.mixFor(40, 2 * DAY)
    expect(mix.fresh).toBeGreaterThan(0.5)
    expect(mix.fresh).toBeLessThanOrEqual(0.85)
    expect(mix.due + mix.fresh + mix.known).toBeCloseTo(1)
    expect(e.mixFor(5, 10 * DAY).fresh).toBe(0.6) // a few unseen words, test in 10 days
    expect(e.mixFor(5, 20 * DAY).fresh).toBe(0.25) // test far away: normal mix
    expect(e.mixFor(0, 2 * DAY).fresh).toBe(0.25) // everything seen
    expect(e.mixFor(40, null).fresh).toBe(0.25)
  })

  it('a child doing two rounds a day sees every word before the test', () => {
    const { e, tick } = engine(33, new Date('2026-10-04T16:00:00').getTime())
    const rng = makeRng(8)
    // Sunday afternoon to Wednesday: the test is on Thursday morning.
    for (let day = 0; day < 4; day++) {
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < 12; i++) {
          const p = e.next()
          e.record(p.q.word, p.type, rng.next() < 0.8 ? 'correct' : 'wrong')
          tick(20_000)
        }
        tick(2 * 3_600_000)
      }
      tick(DAY - 4 * 3_600_000 - 24 * 20_000)
    }
    const unseen = toets.questions.filter((q) => e.state(q.word).seen === 0).length
    expect(unseen).toBe(0)
  })

  it('restores from a snapshot', () => {
    const { e } = engine(3)
    const p = e.next()
    e.record(p.q.word, p.type, 'correct')
    const snap = JSON.parse(JSON.stringify(e.snapshot()))
    const again = new WordEngine({ toets, states: snap, seed: 1, now: () => start })
    expect(again.state(p.q.word).seen).toBe(1)
    expect(again.state('de dialoog').right.type).toBe(e.state('de dialoog').right.type)
  })

  it('works with a test without sentences', () => {
    const plain: Toets = { ...toets, id: 'plain', questions: toets.questions.map(({ sentence: _s, ...q }) => q) }
    const { e } = engine(8, start, undefined, plain)
    for (let i = 0; i < 200; i++) {
      const p = e.next()
      expect(p.type).not.toBe('sentence')
      e.record(p.q.word, p.type, 'correct')
    }
  })
})
