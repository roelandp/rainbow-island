import { describe, expect, it } from 'vitest'
import { TOETSEN, parseToetsen } from '../content'
import type { Question, Toets } from '../content/types'
import { checkTyped } from './answer'
import { buildOptions, pickDistractors } from './distractors'
import { WordEngine } from './engine'
import { makeRng } from './rng'
import { closestAlternative, englishKind, gapSlot, letterHintEn } from './text'
import { applyAnswer, emptyState, reviveState, statusOf, typeFor } from './words'

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
    expect(letterHintEn('mum / mother', 2)).toBe('m u _  /  m o _ _ _ _')
    expect(letterHintEn('brother', 1)).toBe('b _ _ _ _ _ _')
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

describe('short sentences', () => {
  const t0 = new Date('2026-10-05T10:00:00').getTime()

  it('only get NL to EN and EN to NL, never typing or a gap', () => {
    const { e, tick } = (() => {
      let now = t0
      return { e: new WordEngine({ toets, seed: 3, now: () => now }), tick: (ms: number) => (now += ms) }
    })()
    const rng = makeRng(1)
    for (let i = 0; i < 600; i++) {
      const p = e.next()
      if (e.isSentence(p.q.word)) expect(['recognize', 'reverse']).toContain(p.type)
      else if (!p.q.sentence) expect(p.type).not.toBe('sentence')
      e.record(p.q.word, p.type, rng.next() < 0.8 ? 'correct' : 'wrong')
      tick(i % 10 === 9 ? 5 * HOUR : 20_000)
    }
    // forcing typing on a sentence still gives a choice question
    expect(e.make(fixture[11], 'fallback', 'type').type).toBe('recognize')
    expect(typeFor(applyAnswer(applyAnswer(emptyState(), 'recognize', 'correct', t0, null, true), 'reverse', 'correct', t0, null, true), false, 0.9, true)).not.toBe('type')
  })

  it('are learned only at box 4+ with 2 spaced right answers in each direction', () => {
    let s = emptyState()
    let now = t0
    const answer = (type: 'recognize' | 'reverse', gap: number) => {
      now += gap
      s = applyAnswer(s, type, 'correct', now, null, true)
    }
    answer('recognize', 0)
    answer('reverse', 60_000)
    answer('recognize', 60_000) // same sitting: does not count again
    answer('reverse', 60_000)
    expect(s.dirClean).toEqual({ recognize: 1, reverse: 1 })
    expect(statusOf(s)).toBe('bijna')
    answer('recognize', 3 * HOUR)
    expect(s.dirClean.recognize).toBe(2)
    expect(s.box).toBeGreaterThanOrEqual(4)
    expect(statusOf(s)).not.toBe('geleerd') // EN to NL only once
    answer('reverse', 30 * 60_000) // 3.5 hours after the last EN to NL: counts
    expect(s.dirClean.reverse).toBe(2)
    expect(statusOf(s)).toBe('geleerd')
  })

  it('needs 2 hours between the right answers of one direction', () => {
    let s = emptyState()
    s = applyAnswer(s, 'reverse', 'correct', t0, null, true)
    s = applyAnswer(s, 'reverse', 'correct', t0 + HOUR, null, true)
    expect(s.dirClean.reverse).toBe(1)
    s = applyAnswer(s, 'reverse', 'correct', t0 + 2 * HOUR, null, true)
    expect(s.dirClean.reverse).toBe(2)
    // Box 4+ alone is not enough
    const high = { ...emptyState(), seen: 6, box: 5 as const, dirClean: { recognize: 2, reverse: 1 } }
    expect(statusOf(high)).toBe('bijna')
    expect(statusOf({ ...high, dirClean: { recognize: 2, reverse: 2 } })).toBe('geleerd')
    expect(statusOf({ ...high, box: 3 as const, dirClean: { recognize: 2, reverse: 2 } })).toBe('bijna')
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
            if (e.isSentence(p.q.word)) expect(['recognize', 'reverse']).toContain(p.type)
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
      expect(e.learnedCount()).toBeGreaterThan(real.questions.length * 0.8)
    }
  })
})
