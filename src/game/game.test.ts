import { describe, expect, it } from 'vitest'
import { makeRng } from '../engine/rng'
import { emptyState } from '../engine/words'
import { emptySave, migrate } from '../storage/schema'
import { dayKey, emptyDays, finishRound, goalDone, isAsleep, roundsToday } from './day'
import { earnsLighthouse, growthProgress, islandSize, wordsToNextStep } from './island'
import { addItems, blocksFor, nextStreak, rewardFor, takeItem } from './rewards'

describe('island growth', () => {
  it('starts at 4x4 and grows a strip per 5 learned words', () => {
    expect(islandSize(0)).toEqual({ w: 4, d: 4, step: 0 })
    expect(islandSize(4)).toEqual({ w: 4, d: 4, step: 0 })
    expect(islandSize(5)).toEqual({ w: 5, d: 4, step: 1 })
    expect(islandSize(10)).toEqual({ w: 5, d: 5, step: 2 })
    expect(islandSize(40)).toEqual({ w: 8, d: 8, step: 8 })
    expect(islandSize(1000).w).toBe(12)
    expect(wordsToNextStep(7)).toBe(3)
    expect(earnsLighthouse(40, 40)).toBe(true)
    expect(earnsLighthouse(39, 40)).toBe(false)
  })

  it('fills the growth bar with learned words and half for almost learned ones', () => {
    expect(growthProgress(0, 0)).toEqual({ fill: 0, toGo: 5 })
    expect(growthProgress(0, 2).fill).toBeCloseTo(0.2)
    expect(growthProgress(3, 0).fill).toBeCloseTo(0.6)
    expect(growthProgress(4, 30).fill).toBeLessThan(1)
    expect(growthProgress(7, 1)).toEqual({ fill: (2 + 0.5) / 5, toGo: 3 })
  })
})

describe('rewards', () => {
  it('pays per answer kind', () => {
    expect(blocksFor('type', 'correct')).toBe(2)
    expect(blocksFor('recognize', 'correct')).toBe(1)
    expect(blocksFor('type', 'hint')).toBe(1)
    expect(blocksFor('type', 'almost')).toBe(1)
    expect(blocksFor('type', 'wrong')).toBe(0)
  })

  it('adds a fish at a streak of 3 and furniture at 5', () => {
    const rng = makeRng(1)
    expect(rewardFor('recognize', 'correct', 3, rng)).toContain('vis')
    const five = rewardFor('recognize', 'correct', 5, rng)
    expect(five).toHaveLength(2)
    expect(five).not.toContain('vis')
    expect(rewardFor('recognize', 'wrong', 0, rng)).toEqual([])
    expect(nextStreak(2, 'correct')).toBe(3)
    expect(nextStreak(2, 'almost')).toBe(2)
    expect(nextStreak(2, 'wrong')).toBe(0)
  })

  it('can hand out the rainbow and girly items', () => {
    const rng = makeRng(7)
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) for (const id of rewardFor('type', 'correct', 5, rng)) seen.add(id)
    for (const id of ['regenboog', 'roze', 'lila', 'mint', 'hartjeslamp', 'eenhoorn', 'hemelbed', 'regenboogboog', 'lollyboom', 'kasteeltoren']) {
      expect(seen.has(id)).toBe(true)
    }
    expect(seen.has('vuurtoren')).toBe(false)
  })

  it('keeps an inventory', () => {
    let inv = addItems({}, ['gras', 'gras', 'vis'])
    expect(inv.gras).toBe(2)
    inv = takeItem(inv, 'gras')!
    expect(inv.gras).toBe(1)
    expect(takeItem({}, 'gras')).toBeNull()
  })
})

describe('day goal', () => {
  const t = new Date('2026-10-04T16:00:00').getTime()
  it('counts rounds and days, never losing a day', () => {
    let d = emptyDays()
    d = finishRound(d, t)
    expect(roundsToday(d, t)).toBe(1)
    expect(goalDone(d, t)).toBe(false)
    d = finishRound(d, t + 60_000)
    expect(goalDone(d, t)).toBe(true)
    d = finishRound(d, t + 3 * 86_400_000)
    expect(d.played).toBe(2)
    expect(roundsToday(d, t + 3 * 86_400_000)).toBe(1)
    expect(dayKey(t)).toBe('2026-10-04')
  })
  it('sleeps after 20 hours', () => {
    const d = finishRound(emptyDays(), t)
    expect(isAsleep(d, t + 19 * 3_600_000)).toBe(false)
    expect(isAsleep(d, t + 21 * 3_600_000)).toBe(true)
    expect(isAsleep(emptyDays(), t)).toBe(false)
  })
})

describe('storage', () => {
  it('migrates garbage to an empty save', () => {
    expect(migrate(null)).toEqual(emptySave())
    expect(migrate({ profiles: 'x' }).profiles.wyne).toBeTruthy()
  })
  it('keeps words, inventory and blocks, dropping unknown items', () => {
    const save = emptySave()
    save.profiles.wyne.words.toets_8_oktober = { 'de dialoog': { ...emptyState(), seen: 3, box: 2 } }
    save.profiles.wyne.inventory = { gras: 3 }
    save.profiles.wyne.island.blocks = [{ x: 1, z: 0, y: 0, type: 'gras' }]
    const raw = JSON.parse(JSON.stringify(save))
    raw.profiles.wyne.inventory.raket = 9
    raw.profiles.wyne.island.blocks.push({ x: 0, z: 0, y: 0, type: 'raket' })
    const back = migrate(raw)
    expect(back.profiles.wyne.words.toets_8_oktober['de dialoog'].box).toBe(2)
    expect(back.profiles.wyne.inventory).toEqual({ gras: 3 })
    expect(back.profiles.wyne.island.blocks).toHaveLength(1)
  })
})

describe('build time', () => {
  it('is earned by answering, capped at 5 minutes, and unlocks with 5 right in a row', async () => {
    const bt = await import('./buildtime')
    expect(bt.secondsFor('correct')).toBe(20)
    expect(bt.secondsFor('almost')).toBe(10)
    expect(bt.secondsFor('wrong')).toBe(0)
    expect(bt.addTime(290, 60)).toBe(300)
    expect(bt.spendTime(3, 10)).toBe(0)
    expect(bt.clock(125)).toBe('2:05')
    let run = 0
    for (const o of ['correct', 'correct', 'almost', 'correct'] as const) run = bt.nextRun(run, o)
    expect(run).toBe(3)
    expect(bt.nextRun(run, 'wrong')).toBe(0)
    expect(bt.unlimited(40, 40)).toBe(true)
    expect(bt.unlimited(39, 40)).toBe(false)
  })
})
