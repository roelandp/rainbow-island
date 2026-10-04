import type { App, Screen } from '../app'
import { ITEMS, itemInfo, type ItemId } from '../content/blocks'
import { canPlace, place, removeTop, type PlaceError } from '../game/build'
import { addItems, takeItem } from '../game/rewards'
import { watchInsets } from './common'
import { EXTENSION_SECONDS, UNLOCK_RIGHT, clock } from '../game/buildtime'
import { el } from './dom'
import { startRoaming } from './roam'
import { catMover, tapOnCat } from './move'

const ERRORS: Record<PlaceError, string> = {
  buiten: 'Dat is in het water. Bouw op het eiland!',
  'te-hoog': 'Hoger gaat niet, anders valt het om.',
  'bovenop-meubel': 'Op een meubel kan niks meer.',
  'bovenop-water': 'Op water kan niks blijven liggen.',
}

type Tool = ItemId | 'gum'

/**
 * Build mode: pick a block or piece of furniture in the bar, tap a tile to put
 * it on top. The eraser takes the top one off and gives it back. Swipe to turn
 * the island a quarter, pinch to zoom. Drag a fish treat onto Katrien to feed her.
 */
export function bouwenScreen(app: App): Screen {
  let tool: Tool | null = null
  app.scene.setMood('day')
  app.scene.catPose('idle')
  void app.scene.animalLeaves()
  app.syncIsland(true)

  const free = app.buildUnlimited()
  const timeChip = el('div.chip.build-time', { text: free ? '⏳ onbeperkt' : `⏳ ${clock(app.store.profile.buildTime)}` })
  const top = el(
    'div.topbar',
    {},
    el('button.btn.small.ghost', { onclick: () => app.go('menu') }, '← Klaar'),
    timeChip,
    el('div.spacer'),
    el('button.btn.round.ghost', { 'aria-label': 'Draai links', onclick: () => turn(-1) }, '↺'),
    el('button.btn.round.ghost', { 'aria-label': 'Draai rechts', onclick: () => turn(1) }, '↻'),
  )
  const hint = el('p.note.build-hint')
  const bar = el('div.buildbar')
  const sheet = el('div.card.sheet.build', {}, hint, bar)
  const root = el('div.screen', {}, top, el('div.spacer'), sheet)
  const unwatch = watchInsets(app, top, sheet)
  const stopRoam = startRoaming(app, { tiredSleep: true })
  const mover = catMover(app, root)

  function turn(dir: 1 | -1): void {
    app.audio.play('tap')
    app.scene.rotate(dir)
  }

  function render(): void {
    const inv = app.store.profile.inventory
    const owned = ITEMS.filter((i) => i.kind !== 'treat' && (inv[i.id] ?? 0) > 0)
    if (tool && tool !== 'gum' && (inv[tool] ?? 0) <= 0) tool = null
    bar.replaceChildren()
    for (const item of owned) {
      bar.appendChild(
        el(
          `button.slot${tool === item.id ? '.on' : ''}`,
          { onclick: () => select(item.id), 'aria-label': item.naam },
          el('span.swatch', { style: { background: item.color }, text: item.icon }),
          el('span.count', { text: String(inv[item.id]) }),
          el('span.name', { text: item.naam }),
        ),
      )
    }
    const fish = inv.vis ?? 0
    if (fish > 0) {
      const slot = el(
        'button.slot.fish',
        { 'aria-label': 'Vissnoepje' },
        el('span.swatch', { style: { background: '#d7eefb' }, text: '🐟' }),
        el('span.count', { text: String(fish) }),
        el('span.name', { text: 'Sleep naar Katrien' }),
      )
      slot.addEventListener('pointerdown', (e) => dragFish(e as PointerEvent))
      bar.appendChild(slot)
    }
    bar.appendChild(
      el(
        `button.slot.gum${tool === 'gum' ? '.on' : ''}`,
        { onclick: () => select('gum'), 'aria-label': 'Gum' },
        el('span.swatch', { style: { background: '#fff' }, text: '🧽' }),
        el('span.name', { text: 'Weghalen' }),
      ),
    )
    if (owned.length === 0 && fish === 0) {
      hint.textContent = 'Je hebt nog geen blokken. Speel een ronde om blokken te verdienen!'
    } else if (!tool) {
      hint.textContent = 'Kies een blok en tik op het eiland. Tik op een meubel om het te draaien, op Katrien om haar te verplaatsen.'
    } else if (tool === 'gum') {
      hint.textContent = 'Tik op een blok om het weg te halen.'
    } else {
      hint.textContent = `${itemInfo(tool)?.naam}: tik op het eiland om het neer te zetten. Katrien verplaatsen: tik op haar.`
    }
  }

  function select(t: Tool): void {
    app.audio.play('tap')
    tool = tool === t ? null : t
    render()
  }

  function tapAt(clientX: number, clientY: number): void {
    if (locked) return
    // Katrien always comes first: tap her (whatever is selected), then tap where she should go.
    if ((mover.selected || tapOnCat(app, clientX, clientY)) && mover.tap(clientX, clientY)) return
    if (!tool) {
      // No block chosen: tap Katrien, then a tile, and she walks there.
      // A tap on a piece of furniture turns it a quarter.
      if (mover.tap(clientX, clientY)) return
      const spot = app.scene.pick(clientX, clientY)
      if (spot) app.turnFurnitureAt(spot.x, spot.z)
      return
    }
    const hit = app.scene.pick(clientX, clientY)
    if (!hit) return
    const p = app.store.profile
    const tiles = app.scene.tiles()
    if (tool === 'gum') {
      const r = removeTop(p.island.blocks, hit.x, hit.z)
      if (!r) return
      app.store.update((pp) => {
        pp.island.blocks = r.blocks
        pp.inventory = addItems(pp.inventory, [r.removed])
      })
      app.audio.play('remove')
      app.pushPlaced()
      render()
      return
    }
    const err = canPlace(p.island.blocks, tiles, hit.x, hit.z, tool)
    // Tapping furniture turns it, whatever is selected.
    if (err === 'bovenop-meubel' && app.turnFurnitureAt(hit.x, hit.z)) return
    if (err) {
      app.toast(ERRORS[err])
      return
    }
    const inv = takeItem(p.inventory, tool)
    const blocks = place(p.island.blocks, tiles, hit.x, hit.z, tool)
    if (!inv || !blocks) return
    app.store.update((pp) => {
      pp.inventory = inv
      pp.island.blocks = blocks
    })
    app.audio.play('place')
    app.pushPlaced()
    render()
  }

  // ---------- taps on the scene (swipe and pinch are handled by the app on every screen) ----------

  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>()
  let gestureUsed = false

  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() })
    if (pointers.size === 1) gestureUsed = false
    if (pointers.size === 2) gestureUsed = true
  }
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
  }
  const onUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId)
    pointers.delete(e.pointerId)
    if (!p || gestureUsed) return
    const dx = p.x - p.sx
    const dy = p.y - p.sy
    const dt = performance.now() - p.t
    // Swipes are turned into quarter turns by the app itself, on every screen.
    if (Math.hypot(dx, dy) < 12 && dt < 600) {
      tapAt(e.clientX, e.clientY)
    }
  }
  const stage = app.stage
  stage.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)

  // ---------- feeding ----------

  function dragFish(e: PointerEvent): void {
    e.preventDefault()
    const ghost = el('div.flyer', { text: '🐟' })
    ghost.style.fontSize = '44px'
    document.body.appendChild(ghost)
    const move = (ev: PointerEvent) => {
      ghost.style.left = `${ev.clientX - 26}px`
      ghost.style.top = `${ev.clientY - 40}px`
    }
    move(e)
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      ghost.remove()
      const s = app.stage.getBoundingClientRect()
      const c = app.scene.catScreenPos()
      const near = Math.hypot(ev.clientX - s.left - c.x, ev.clientY - s.top - c.y) < 110
      if (!near) {
        hint.textContent = 'Sleep het vissnoepje naar Katrien toe.'
        return
      }
      const inv = takeItem(app.store.profile.inventory, 'vis')
      if (!inv) return
      app.store.update((pp) => {
        pp.inventory = inv
        pp.stats.fed++
      })
      app.audio.play('purr')
      app.scene.catPose('happy')
      app.scene.burst('hearts', 'cat')
      window.setTimeout(() => app.scene.burst('hearts', 'cat'), 500)
      window.setTimeout(() => app.scene.catPose('idle'), 2200)
      hint.textContent = 'Mmm! Katrien spint van geluk.'
      render()
      hint.textContent = 'Mmm! Katrien spint van geluk.'
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // ---------- build time: earned by answering, spent here ----------

  let locked = false
  let bank = app.store.profile.buildTime
  let sinceSave = 0
  const save = () =>
    app.store.update((pp) => {
      pp.buildTime = bank
    })
  const showLock = () => {
    locked = true
    tool = null
    render()
    const canExtend = !app.store.profile.extensionUsed
    const card = el(
      'div.card.detail.lock',
      {},
      el('div.lock-icon', { text: '⏳' }),
      el('h2', { text: 'De bouwtijd is op!' }),
      canExtend
        ? el('p', { text: `Doe ${UNLOCK_RIGHT} woorden goed op een rij en je mag nog ${clock(EXTENSION_SECONDS)} verder bouwen.` })
        : el('p', { text: 'Je hebt al een keer verlengd. Speel een hele ronde, dan verdien je nieuwe bouwtijd.' }),
      canExtend
        ? el('button.btn.primary', { style: { width: '100%' }, onclick: () => app.go('round', { unlock: true }) }, `${UNLOCK_RIGHT} goed op een rij`)
        : null,
      el(`button.btn${canExtend ? '' : '.primary'}`, { style: { width: '100%', marginTop: '10px' }, onclick: () => app.go('round') }, '▶ Speel een hele ronde'),
      el('button.btn.small.ghost', { style: { width: '100%', marginTop: '10px' }, onclick: () => app.go('menu') }, 'Naar het begin'),
    )
    root.appendChild(el('div.overlay', {}, card))
  }
  const ticker = window.setInterval(() => {
    if (free || locked || document.visibilityState !== 'visible') return
    bank = Math.max(0, bank - 1)
    timeChip.textContent = `⏳ ${clock(bank)}`
    timeChip.classList.toggle('low', bank <= 30)
    if (bank === 30) app.toast('Nog 30 seconden bouwen')
    if (++sinceSave >= 5 || bank === 0) {
      sinceSave = 0
      save()
    }
    if (bank === 0) showLock()
  }, 1000)
  if (!free && bank <= 0) showLock()

  render()

  return {
    root,
    dispose: () => {
      window.clearInterval(ticker)
      if (!free) save()
      unwatch()
      stopRoam()
      mover.dispose()
      stage.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    },
  }
}
