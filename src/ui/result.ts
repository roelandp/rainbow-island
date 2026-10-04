import type { App, Screen } from '../app'
import type { ItemId } from '../content/blocks'
import { goalDone } from '../game/day'
import { earnsLighthouse } from '../game/island'
import { addItems, countItems } from '../game/rewards'
import { clock } from '../game/buildtime'
import { growthBar, lootList, paws, watchInsets } from './common'
import { el } from './dom'
import type { RoundResult } from './round'

/** Hands out the lighthouse once per test when every word of it is learned. */
export function checkLighthouse(app: App): boolean {
  const toets = app.toets
  const p = app.store.profile
  if (p.island.lighthouses.includes(toets.id)) return false
  if (!earnsLighthouse(app.learnedIn(toets), toets.questions.length)) return false
  app.store.update((pp) => {
    pp.island.lighthouses.push(toets.id)
    pp.inventory = addItems(pp.inventory, ['vuurtoren'])
  })
  return true
}

export function resultScreen(app: App, payload?: unknown): Screen {
  const r = (payload ?? { earned: [], learned: [], weak: [], right: 0, total: 0 }) as RoundResult
  const tired = goalDone(app.store.profile.days, Date.now())

  void app.scene.animalLeaves()
  app.scene.catPose('happy')
  app.audio.play('roundEnd')
  app.scene.burst('rainbow', 'cat')

  const parts: HTMLElement[] = [
    el('h2', { text: r.right >= r.total - 1 ? 'Wat een topronde!' : r.right >= r.total / 2 ? 'Goed gedaan!' : 'Lekker geoefend!' }),
    el('p.note', { html: `<strong>${r.right} van de ${r.total}</strong> goed &nbsp; ${paws(app).outerHTML}` }),
    el('div.section-label', { text: 'Verdiend' }),
    lootList(countItems(r.earned as ItemId[])),
    el('p.note', { html: app.buildUnlimited() ? '<strong>Alle woorden geleerd: bouwen mag zo lang je wilt!</strong>' : `⏳ <strong>+${clock(r.seconds ?? 0)}</strong> bouwtijd. Je hebt nu <strong>${clock(app.store.profile.buildTime)}</strong> om te bouwen.` }),
  ]
  if (r.learned.length > 0) {
    parts.push(el('div.section-label', { text: 'Nieuw geleerd' }), el('div.wordlist', {}, ...r.learned.map((w) => el('span', { text: w }))))
  }
  if (r.weak.length > 0) {
    parts.push(el('div.section-label', { text: 'Nog even oefenen' }), el('div.wordlist.weak', {}, ...r.weak.map((w) => el('span', { text: w }))))
  }
  parts.push(growthBar(app))
  if (tired) parts.push(el('p.note', { html: '<strong>Katrien is moe en tevreden. Morgen weer!</strong>' }))

  const buttons = el(
    'div.row',
    {},
    el('button.btn.primary', { onclick: () => app.go('bouwen') }, '🧱 Bouwen'),
    el('button.btn', { onclick: () => app.go('round') }, 'Nog een ronde'),
  )
  const sheet = el('div.card.sheet.result', {}, el('div.sheet-scroll', {}, ...parts, buttons, el('button.btn.small.ghost', { style: { width: '100%', marginTop: '10px' }, onclick: () => app.go('menu') }, 'Naar het begin')))
  const root = el('div.screen', {}, el('div.spacer'), sheet)
  const unwatch = watchInsets(app, null, sheet)

  // Growth and the sunset come a moment later, so they are noticed.
  let fired = false
  let lighthouseTimer = 0
  const timer = window.setTimeout(() => {
    fired = true
    if (app.syncIsland(true)) {
      app.scene.burst('rainbow', 'cat')
      app.audio.play('grow')
      app.toast('Het eiland groeit!')
    }
    if (checkLighthouse(app)) {
      lighthouseTimer = window.setTimeout(() => app.toast('Alle woorden geleerd! Je krijgt een vuurtorentje!'), 2800)
    }
    if (tired) app.scene.setMood('sunset')
    app.scene.catPose('idle')
  }, 1200)

  return {
    root,
    dispose: () => {
      window.clearTimeout(timer)
      window.clearTimeout(lighthouseTimer)
      // Left quickly: still hand out what was earned, just without the show.
      if (!fired) checkLighthouse(app)
      unwatch()
    },
  }
}
