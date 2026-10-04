import { describe, expect, it } from 'vitest'
import { TOETSEN, parseToetsen } from '../content'
import type { Question, Toets } from '../content/types'
import { checkDutchAnswer, checkTyped } from './answer'
import { buildOptions, pickDistractors } from './distractors'
import { WordEngine } from './engine'
import { makeRng } from './rng'
import { closestAlternative, closestDutch, englishKind, gapSlot, letterHintEn, letterHintFirst } from './text'
import { applyAnswer, emptyState, reviveState, statusOf, typeForEn } from './words'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const fixture: Question[] = [
  { word: 'mum / mother', definition: 'moeder', hint: "Begint met 'mu...'", sentence: 'My ___ is my dad\'s wife.' },
  { word: 'dad / father', definition: 'vader', sentence: "My ___ is my mum's husband." },
  { word: 'brother', definition: 'broer', sentence: 'My ___ is a boy.' },
  { word: 'sister', definition: 'zus', sentence: 'My ___ is a girl.' },
  { word: 'aunt', definition: 'tante', sentence: "My mum's sister is my ___." },
  { word: 'read', definition: 'lezen', sentence: 'I ___ a book in bed.' },
  { word: 'skate', definition: 'skateboarden', sentence: 'I ___ on my skateboard.' },
  { word: 'young', definition: 'jong', sentence: 'She is very ___.' },
  { word: 'family tree', definition: 'stamboom', sentence: 'This is my ___.' },
  { word: 'short hair', definition: 'kort haar', sentence: 'I have ___.' },
  { word: 'watch TV', definition: 'tv kijken', sentence: 'We sit on the sofa and ___.' },
  { word: 'This is my family.', definition: 'Dit is mijn familie.' },
  { word: 'His name is …', definition: 'Zijn naam is …' },
  { word: 'Her name is …', definition: 'Haar naam is …' },
  { word: 'Who is she?', definition: 'Wie is zij?' },
  { word: 'He is very tall.', definition: 'Hij is erg lang.' },
]
const toets: Toets = parseToetsen({ f: { engels: { title: 'Engels', date: null, language: 'en', questions: fixture } } } as never)[0]

describe('English answer check', () => {
  it('accepts every alternative', () => {
    expect(checkTyped('mum', 'mum / mother', 'en').result).toBe('correct')
    expect(checkTyped('mother', 'mum / mother', 'en').result).toBe('correct')
    expect(checkTyped('mum / mother', 'mum / mother', 'en').result).toBe('correct')
    expect(checkTyped('dad', 'mum / mother', 'en').result).toBe('wrong')
  })

  it('makes the article optional either way', () => {
    expect(checkTyped('the brother', 'brother', 'en').result).toBe('correct')
    expect(checkTyped('a brother', 'brother', 'en').result).toBe('correct')
    expect(checkTyped('an aunt', 'aunt', 'en').result).toBe('correct')
    expect(checkTyped('book', 'a book', 'en').result).toBe('correct')
    expect(checkTyped('the family tree', 'family tree', 'en').result).toBe('correct')
  })

  it('ignores case, punctuation and double spaces', () => {
    expect(checkTyped('  Mother!', 'mum / mother', 'en').result).toBe('correct')
    expect(checkTyped('WATCH   tv.', 'watch TV', 'en').result).toBe('correct')
    expect(checkTyped('who is she', 'Who is she?', 'en').result).toBe('correct')
    expect(checkTyped('Who, is she?', 'Who is she?', 'en').result).toBe('correct')
  })

  it('calls one letter off almost', () => {
    expect(checkTyped('brohter', 'brother', 'en')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkTyped('mothr', 'mum / mother', 'en')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkTyped('the sistr', 'sister', 'en')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkTyped('familytree', 'family tree', 'en')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkTyped('brthr', 'brother', 'en').result).toBe('wrong')
    expect(checkTyped('', 'brother', 'en').result).toBe('wrong')
  })

  it('does not use the Dutch article rules for English', () => {
    expect(checkTyped('de brother', 'brother', 'en').result).toBe('wrong')
  })

  it('shows the closest alternative and safe letter hints', () => {
    expect(closestAlternative('mothr', 'mum / mother')).toBe('mother')
    expect(closestAlternative('mun', 'mum / mother')).toBe('mum')
    expect(letterHintEn('mum / mother', 2)).toBe('m _ _  /  m o _ _ _ _')
    expect(letterHintEn('brother', 1)).toBe('b _ _ _ _ _ _')
  })
})

describe('typed Dutch answers on an English list', () => {
  it('accepts every alternative, with or without spaces around the slash', () => {
    expect(checkDutchAnswer('vrouw', 'vrouw / echtgenote').result).toBe('correct')
    expect(checkDutchAnswer('echtgenote', 'vrouw / echtgenote').result).toBe('correct')
    expect(checkDutchAnswer('neef', 'neef / nicht').result).toBe('correct')
    expect(checkDutchAnswer('nichten', 'neven/nichten').result).toBe('correct')
    expect(checkDutchAnswer('neven', 'neven/nichten').result).toBe('correct')
    expect(checkDutchAnswer('oma/grootmoeder', 'oma / grootmoeder').result).toBe('correct')
    expect(checkDutchAnswer('opa', 'oma / grootmoeder').result).toBe('wrong')
  })

  it('makes de, het and een optional', () => {
    expect(checkDutchAnswer('de moeder', 'moeder').result).toBe('correct')
    expect(checkDutchAnswer('het boek', 'boek').result).toBe('correct')
    expect(checkDutchAnswer('een zwembad', 'zwembad').result).toBe('correct')
    expect(checkDutchAnswer('stamboom', 'de stamboom').result).toBe('correct')
  })

  it('ignores case, punctuation, the ellipsis and double spaces', () => {
    expect(checkDutchAnswer('zijn naam is', 'Zijn naam is …').result).toBe('correct')
    expect(checkDutchAnswer('Zijn  naam is...', 'Zijn naam is …').result).toBe('correct')
    expect(checkDutchAnswer('  Moeder! ', 'moeder').result).toBe('correct')
    expect(checkDutchAnswer('wie is dit', 'Wie is dit?').result).toBe('correct')
    expect(checkDutchAnswer('TV kijken', 'tv kijken').result).toBe('correct')
  })

  it('calls one letter off almost (4+ letters), else wrong', () => {
    expect(checkDutchAnswer('moder', 'moeder')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkDutchAnswer('echtgenoote', 'vrouw / echtgenote')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkDutchAnswer('tvkijken', 'tv kijken')).toEqual({ result: 'almost', reason: 'typo' })
    expect(checkDutchAnswer('oon', 'oom').result).toBe('wrong')
    expect(checkDutchAnswer('mdr', 'moeder').result).toBe('wrong')
    expect(checkDutchAnswer('', 'moeder').result).toBe('wrong')
  })

  it('hints and the shown answer use the Dutch alternatives', () => {
    expect(letterHintFirst('oma / grootmoeder', 2)).toBe('o _ _')
    expect(letterHintFirst('moeder', 2)).toBe('m o _ _ _ _')
    expect(closestDutch('grootmoder', 'oma / grootmoeder')).toBe('grootmoeder')
    expect(closestDutch('', 'oma / grootmoeder')).toBe('oma / grootmoeder')
  })
})

describe('English kinds and distractors', () => {
  it('sorts words, phrases and sentences', () => {
    expect(englishKind('brother')).toBe('word')
    expect(englishKind('mum / mother')).toBe('word')
    expect(englishKind('the brother')).toBe('word')
    expect(englishKind('family tree')).toBe('phrase')
    expect(englishKind('watch TV')).toBe('phrase')
    expect(englishKind('This is my family.')).toBe('sentence')
    expect(englishKind('Who is she?')).toBe('sentence')
    expect(englishKind('His name is …')).toBe('sentence')
    expect(englishKind('His name is ...')).toBe('sentence')
    expect(englishKind('I love my family')).toBe('sentence')
  })

  it('picks sentences for sentences and words for words', () => {
    const rng = makeRng(5)
    const sentence = toets.questions.find((q) => q.word === 'Who is she?')!
    const word = toets.questions.find((q) => q.word === 'brother')!
    for (let i = 0; i < 30; i++) {
      for (const field of ['word', 'definition'] as const) {
        expect(pickDistractors(sentence, toets.questions, rng, field, 3, 'en').every((d) => englishKind(d.word) === 'sentence')).toBe(true)
        expect(pickDistractors(word, toets.questions, rng, field, 3, 'en').every((d) => englishKind(d.word) === 'word')).toBe(true)
      }
    }
  })

  it('keeps the full text with alternatives on the buttons', () => {
    const q = toets.questions[0]
    const opts = buildOptions(q, toets.questions, makeRng(2), 'word', 4, 'en')
    expect(opts.labels[opts.answer]).toBe('mum / mother')
    const gap = buildOptions(q, toets.questions, makeRng(2), 'gap', 4, 'en')
    expect(gap.labels[gap.answer]).toBe('mum / mother')
    expect(new Set(gap.labels).size).toBe(4)
  })

  it('gap distractors do not fit the same slot and are never whole sentences', () => {
    expect(gapSlot('My ___ is a boy.')).toBe('noun')
    expect(gapSlot("My mum's sister is my ___.")).toBe('noun')
    expect(gapSlot('I ___ a book in bed.')).toBe('verb')
    expect(gapSlot('She is very ___.')).toBe('adj')
    const rng = makeRng(11)
    const brother = toets.questions.find((q) => q.word === 'brother')!
    const read = toets.questions.find((q) => q.word === 'read')!
    for (let i = 0; i < 30; i++) {
      const a = pickDistractors(brother, toets.questions, rng, 'gap', 3, 'en')
      expect(a.every((d) => gapSlot(d.sentence) !== 'noun')).toBe(true)
      const b = pickDistractors(read, toets.questions, rng, 'gap', 3, 'en')
      expect(b.map((d) => d.word)).not.toContain('skate')
      expect([...a, ...b].every((d) => englishKind(d.word) !== 'sentence')).toBe(true)
    }
  })
})

describe('English lists: only English to Dutch', () => {
  const t0 = new Date('2026-10-05T10:00:00').getTime()

  function run(seed: number, n: number, check: (e: WordEngine, p: ReturnType<WordEngine['next']>) => void) {
    let now = t0
    const e = new WordEngine({ toets, seed, now: () => now })
    const rng = makeRng(seed)
    for (let i = 0; i < n; i++) {
      const p = e.next()
      check(e, p)
      e.record(p.q.word, p.type, rng.next() < 0.8 ? 'correct' : 'wrong')
      now += i % 10 === 9 ? 5 * HOUR : 20_000
    }
    return e
  }

  it('asks only EN to NL choice: Wyne never types', () => {
    const seen = new Set<string>()
    run(3, 600, (_e, p) => {
      seen.add(p.type)
      // Dutch options: the right one is the definition
      expect(p.options!.labels[p.options!.answer]).toBe(p.q.definition)
    })
    expect(seen).toEqual(new Set(['reverse']))
  })

  it('typeForEn ladder (unused for choice-only lists), and the engine never types', () => {
    let s = emptyState()
    expect(typeForEn(s, false, 0.5)).toBe('reverse')
    s = applyAnswer(s, 'reverse', 'correct', t0, null)
    expect(typeForEn(s, false, 0.5)).toBe('reverse')
    s = applyAnswer(s, 'reverse', 'correct', t0 + HOUR, null)
    expect(typeForEn(s, false, 0.5)).toBe('type')
    expect(s.box).toBe(2)
    s = applyAnswer(s, 'type', 'correct', t0 + 2 * HOUR, null)
    expect(s.box).toBe(4) // typing earns the top boxes
    s = applyAnswer(s, 'type', 'wrong', t0 + 3 * HOUR, null)
    s = applyAnswer(s, 'type', 'wrong', t0 + 3 * HOUR, null)
    expect(typeForEn(s, false, 0.5)).toBe('reverse') // two misses: one easier question
    expect(typeForEn(emptyState(), true, 0.5)).toBe('reverse')
    const e = new WordEngine({ toets, seed: 1, now: () => t0 })
    expect(e.make(fixture[11], 'fallback', 'type').type).toBe('reverse')
    expect(e.make(fixture[0], 'fallback', 'recognize').type).toBe('reverse')
    expect(e.make(fixture[0], 'fallback', 'sentence').type).toBe('reverse')
    expect(e.make(fixture[0], 'fallback', 'type').type).toBe('reverse')
  })

  it('a word is learned from spaced right choices, like a sentence', () => {
    let now = t0
    const e = new WordEngine({ toets, seed: 1, now: () => now })
    const word = fixture[0].word
    expect(e.isSentence(word)).toBe(false)
    for (let i = 0; i < 6; i++) {
      e.record(word, 'reverse', 'correct')
      now += DAY
    }
    expect(e.status(word)).toBe('geleerd')
  })

  it('choice alone never makes a word learned', () => {
    let s = emptyState()
    for (let i = 0; i < 6; i++) s = applyAnswer(s, 'reverse', 'correct', t0 + i * DAY, null)
    expect(s.box).toBe(3)
    expect(statusOf(s)).toBe('bijna')
  })
})

describe('short sentences', () => {
  const t0 = new Date('2026-10-05T10:00:00').getTime()

  it('are learned at box 4+ with 2 right EN to NL answers at least 2 hours apart', () => {
    let s = emptyState()
    let now = t0
    const answer = (gap: number) => {
      now += gap
      s = applyAnswer(s, 'reverse', 'correct', now, null, true)
    }
    answer(0)
    answer(60_000) // same sitting: does not count again
    answer(60_000)
    expect(s.dirClean.reverse).toBe(1)
    expect(s.box).toBe(3)
    expect(statusOf(s)).toBe('bijna')
    answer(3 * HOUR)
    expect(s.dirClean.reverse).toBe(2)
    expect(s.box).toBe(4)
    expect(statusOf(s)).toBe('geleerd')
  })

  it('needs 2 hours between the right answers, and box 4+', () => {
    let s = emptyState()
    s = applyAnswer(s, 'reverse', 'correct', t0, null, true)
    s = applyAnswer(s, 'reverse', 'correct', t0 + HOUR, null, true)
    expect(s.dirClean.reverse).toBe(1)
    s = applyAnswer(s, 'reverse', 'correct', t0 + 2 * HOUR, null, true)
    expect(s.dirClean.reverse).toBe(2)
    expect(statusOf(s)).toBe('bijna') // box 3 only
    const high = { ...emptyState(), seen: 6, box: 5 as const, dirClean: { recognize: 0, reverse: 1 } }
    expect(statusOf(high)).toBe('bijna')
    expect(statusOf({ ...high, dirClean: { recognize: 0, reverse: 2 } })).toBe('geleerd')
    expect(statusOf({ ...high, box: 3 as const, dirClean: { recognize: 0, reverse: 2 } })).toBe('bijna')
  })

  it('a wrong answer sends a sentence back to box 1', () => {
    let s = applyAnswer(emptyState(), 'reverse', 'correct', t0, null, true)
    s = applyAnswer(s, 'reverse', 'wrong', t0 + 60_000, null, true)
    expect(s.box).toBe(1)
    expect(s.retryIn).toBe(2)
  })

  it('normal words never collect direction counts', () => {
    let s = emptyState()
    s = applyAnswer(s, 'recognize', 'correct', t0, null)
    s = applyAnswer(s, 'reverse', 'correct', t0 + 3 * HOUR, null)
    expect(s.dirClean).toEqual({ recognize: 0, reverse: 0 })
  })

  it('old saves without direction data still load', () => {
    const s = reviveState({ seen: 3, box: 2 })
    expect(s.dirClean).toEqual({ recognize: 0, reverse: 0 })
    expect(s.dirAt).toEqual({ recognize: 0, reverse: 0 })
  })
})

describe('the real English list', () => {
  it('learns everything with two rounds of 10 a day', () => {
    for (const real of TOETSEN) {
      let now = new Date('2026-10-05T15:00:00').getTime()
      const e = new WordEngine({ toets: real, seed: 7, now: () => now })
      const rng = makeRng(4)
      for (let day = 0; day < 60; day++) {
        for (let round = 0; round < 2; round++) {
          for (let i = 0; i < 10; i++) {
            const p = e.next()
            expect(p.type).toBe('reverse')
            if (p.options) {
              expect(new Set(p.options.labels).size).toBe(p.options.labels.length)
              expect(p.options.labels.length).toBe(4)
            }
            e.record(p.q.word, p.type, rng.next() < 0.85 ? 'correct' : 'wrong')
            now += 20_000
          }
          now += 3 * HOUR
        }
        now += DAY - 6 * HOUR - 400_000
      }
      const unseen = real.questions.filter((q) => e.state(q.word).seen === 0).length
      expect(unseen).toBe(0)
      expect(e.learnedCount()).toBeGreaterThanOrEqual(real.questions.length * 0.75)
    }
  })
})

describe('soon: undated test that is close', () => {
  it('paces as if the test is a rolling week away', () => {
    const soon = parseToetsen({ f: { s: { title: 'S', date: null, soon: true, language: 'en', questions: fixture } } } as never)[0]
    expect(soon.soon).toBe(true)
    expect(new WordEngine({ toets: soon, seed: 1, now: () => 0 }).msToTest()).toBe(7 * DAY)
    expect(new WordEngine({ toets, seed: 1, now: () => 0 }).msToTest()).toBeNull()
  })
  it('a real date wins over soon', () => {
    const real = TOETSEN.find((t) => t.id === 'engels_familie')
    expect(real?.date).toBe('2026-10-08')
    expect(real?.soon).toBe(false)
  })
})

describe('sprint: English list with the test within 5 days', () => {
  const t0 = new Date('2026-10-04T08:00:00').getTime()
  const dated: Toets = { ...toets, date: '2026-10-08' }

  it('switches on within 5 days of the test, only for English', () => {
    expect(new WordEngine({ toets: dated, seed: 1, now: () => t0 }).sprint()).toBe(true)
    expect(new WordEngine({ toets: dated, seed: 1, now: () => t0 - 3 * DAY }).sprint()).toBe(false)
    expect(new WordEngine({ toets: { ...dated, language: 'nl' }, seed: 1, now: () => t0 }).sprint()).toBe(false)
    expect(new WordEngine({ toets, seed: 1, now: () => t0 }).sprint()).toBe(false)
  })

  it('gives new words at least 75% of the picks while unseen words remain', () => {
    const e = new WordEngine({ toets: dated, seed: 1, now: () => t0 })
    expect(e.mixFor(55, e.msToTest()).fresh).toBeGreaterThanOrEqual(0.75)
    expect(e.mixFor(0, e.msToTest()).fresh).toBe(0.25)
  })

  it('types after one right choice, and one clean typing is learned', () => {
    let s = applyAnswer(emptyState(), 'reverse', 'correct', t0, 3 * DAY, false, true)
    expect(typeForEn(s, false, 0.5, true)).toBe('type')
    expect(typeForEn(s, false, 0.5, false)).toBe('reverse')
    s = applyAnswer(s, 'type', 'correct', t0 + 60_000, 3 * DAY, false, true)
    expect(s.box).toBeGreaterThanOrEqual(4)
    expect(statusOf(s)).toBe('geleerd')
    // with a hint it is not learned yet
    const hinted = applyAnswer(applyAnswer(emptyState(), 'reverse', 'correct', t0, 3 * DAY, false, true), 'type', 'hint', t0 + 60_000, 3 * DAY, false, true)
    expect(statusOf(hinted)).not.toBe('geleerd')
  })

  it('brings a sentence back after 2 hours and learns it with 2 spaced right answers', () => {
    let s = applyAnswer(emptyState(), 'reverse', 'correct', t0, 3 * DAY, true, true)
    expect(s.dueAt).toBe(t0 + 2 * HOUR)
    s = applyAnswer(s, 'reverse', 'correct', t0 + 7 * HOUR, 3 * DAY, true, true)
    expect(s.box).toBeGreaterThanOrEqual(4)
    expect(statusOf(s)).toBe('geleerd')
  })

  it('a missed word comes back after 3 questions, once', () => {
    let s = applyAnswer(emptyState(), 'reverse', 'wrong', t0, 3 * DAY, false, true)
    expect(s.retryIn).toBe(3)
    s = applyAnswer({ ...s, retryIn: 0 }, 'reverse', 'wrong', t0 + 2 * 60_000, 3 * DAY, false, true)
    expect(s.retryIn).toBe(-1)
    expect(s.dueAt).toBe(t0 + 2 * 60_000 + 2 * HOUR)
  })
})
