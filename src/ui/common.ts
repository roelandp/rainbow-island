import type { App } from '../app'
import { itemInfo, type ItemId } from '../content/blocks'
import { daysUntil } from '../content'
import { ROUNDS_PER_DAY, roundsToday } from '../game/day'
import { growthProgress } from '../game/island'
import type { Inventory } from '../game/rewards'
import { speak } from '../audio/speak'
import { el } from './dom'

/** Two paw prints that colour in per finished round today. */
export function paws(app: App): HTMLElement {
  const done = roundsToday(app.store.profile.days, Date.now())
  const wrap = el('span.paws', { 'aria-label': `${Math.min(done, ROUNDS_PER_DAY)} van ${ROUNDS_PER_DAY} rondes vandaag` })
  for (let i = 0; i < ROUNDS_PER_DAY; i++) wrap.appendChild(el(`span.paw${i < done ? '.on' : ''}`, { text: '🐾' }))
  return wrap
}

/**
 * Tells the scene which parts of the screen are covered by UI, so the island is
 * framed in the free space. Re-measures whenever the elements change size.
 */
export function watchInsets(app: App, top: HTMLElement | null, bottom: HTMLElement | null): () => void {
  const measure = () => {
    const stage = app.stage.getBoundingClientRect()
    const t = top ? Math.max(0, top.getBoundingClientRect().bottom - stage.top) : 0
    const b = bottom ? Math.max(0, stage.bottom - bottom.getBoundingClientRect().top) : 0
    app.scene.setInsets(t, b)
  }
  const ro = new ResizeObserver(measure)
  if (top) ro.observe(top)
  if (bottom) ro.observe(bottom)
  window.addEventListener('resize', measure)
  requestAnimationFrame(measure)
  return () => {
    ro.disconnect()
    window.removeEventListener('resize', measure)
  }
}

export function speakButton(app: App, text: () => string): HTMLElement {
  return el('button.speak', {
    'aria-label': 'Voorlezen',
    onclick: (e: Event) => {
      e.stopPropagation()
      app.audio.unlock()
      // The button always reads aloud, even when automatic reading is off.
      speak(text())
    },
    text: '🔊',
  })
}

/** "nog 4 dagen", "morgen", "vandaag". */
export function testCountdown(date: string | undefined): string | null {
  const d = daysUntil(date)
  if (d === null || d < 0) return null
  if (d === 0) return 'Vandaag is de toets. Succes!'
  if (d === 1) return 'Morgen is de toets'
  return `Nog ${d} dagen tot de toets`
}

/** Counts per kind for the inventory chip: blocks, fish treats, furniture. */
export function inventoryCounts(inv: Inventory): { blocks: number; fish: number; furniture: number } {
  let blocks = 0
  let furniture = 0
  for (const [id, n] of Object.entries(inv)) {
    const kind = itemInfo(id)?.kind
    if (kind === 'block') blocks += n ?? 0
    if (kind === 'furniture') furniture += n ?? 0
  }
  return { blocks, fish: inv.vis ?? 0, furniture }
}

export function inventoryChip(inv: Inventory): HTMLElement {
  const chip = el('div.chip.inv')
  updateInventoryChip(chip, inv)
  return chip
}

export function updateInventoryChip(chip: HTMLElement, inv: Inventory): void {
  const c = inventoryCounts(inv)
  chip.textContent = `🧱\u2009${c.blocks}  🐟\u2009${c.fish}  🪑\u2009${c.furniture}`
}

export function lootList(items: { id: ItemId; n: number }[]): HTMLElement {
  const wrap = el('div.loot')
  for (const { id, n } of items) {
    const info = itemInfo(id)
    if (!info) continue
    wrap.appendChild(el('span', {}, `${info.icon} ${n}x ${info.naam.toLowerCase()}`))
  }
  if (items.length === 0) wrap.appendChild(el('span', {}, 'Deze keer niks, volgende keer vast wel!'))
  return wrap
}

/** A bar towards the next strip of land, with what it takes in words. */
export function growthBar(app: App): HTMLElement {
  const { fill, toGo } = growthProgress(app.growTotal(), 0)
  const fillEl = el('div.grow-fill')
  const bar = el(
    'div.grow',
    {},
    el('div.grow-label', {}, el('span', { text: '🏝️' }), el('span', { text: `Nog ${toGo} ${toGo === 1 ? 'woord' : 'woorden'} goed leren, dan groeit het eiland` })),
    el('div.grow-track', {}, fillEl),
  )
  // Grow into place, so a change after a round is visible.
  requestAnimationFrame(() => requestAnimationFrame(() => (fillEl.style.width = `${Math.round(fill * 100)}%`)))
  return bar
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}
