import type { App, Screen } from '../app'
import { CAPES, HATS, PATTERNS, lockedText, unlocked, type Look, type Unlock } from '../content/looks'
import { el } from './dom'

/** Dress Katrien up with what he earned: hats, a cape and a fur pattern. */
export function aankledenScreen(app: App): Screen {
  const root = el('div.screen.solid')
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '← Klaar'), el('h1', { text: 'Aankleden' }))
  const preview = el('img.dress-preview', { alt: 'Katrien' }) as HTMLImageElement
  const sections = el('div')
  app.holdScene(true)

  const progress = app.lookProgress()
  let look: Look = { ...app.store.profile.look, hats: [...app.store.profile.look.hats] }

  function save(): void {
    app.store.update((p) => {
      p.look = look
    })
    app.applyLook()
    app.audio.play('tap')
    render()
  }

  function chip(label: string, on: boolean, u: Unlock, onClick: () => void): HTMLElement {
    const open = unlocked(u, progress)
    return el(
      `button.dress-chip${on ? '.on' : ''}${open ? '' : '.locked'}`,
      { onclick: () => open && onClick() },
      el('span', { text: open ? label : `🔒 ${label}` }),
      open ? null : el('small', { text: lockedText(u) }),
    )
  }

  function render(): void {
    const url = app.dresser.dataUrl('beg')
    if (url) preview.src = url
    const panels: (HTMLElement | null)[] = [
      el('div.card.panel', {}, el('h2', { text: 'Hoedjes en meer' }), el('p.tiny', { text: 'Je mag er meer tegelijk kiezen.' }), el('div.dress-row', {}, ...HATS.map((h) =>
        chip(h.naam, look.hats.includes(h.id), h.unlock, () => {
          look = { ...look, hats: look.hats.includes(h.id) ? look.hats.filter((x) => x !== h.id) : [...look.hats, h.id] }
          save()
        }),
      ))),
      app.is3d ? null : el('div.card.panel', {}, el('h2', { text: 'Cape' }), el('div.dress-row', {},
        chip('Geen', look.cape === null, { kind: 'rounds', at: 0 }, () => {
          look = { ...look, cape: null }
          save()
        }),
        ...CAPES.map((c) =>
          chip(c.naam, look.cape === c.id, c.unlock, () => {
            look = { ...look, cape: c.id }
            save()
          }),
        ),
      )),
      app.is3d ? null : el('div.card.panel', {}, el('h2', { text: 'Vachtje' }), el('div.dress-row', {},
        chip('Gewoon', look.pattern === null, { kind: 'rounds', at: 0 }, () => {
          look = { ...look, pattern: null }
          save()
        }),
        ...PATTERNS.map((pt) =>
          chip(pt.naam, look.pattern === pt.id, pt.unlock, () => {
            look = { ...look, pattern: pt.id }
            save()
          }),
        ),
      )),
    ]
    sections.replaceChildren(...panels.filter((x): x is HTMLElement => x !== null))
  }

  const unsub = app.dresser.subscribe(() => {
    const url = app.dresser.dataUrl('beg')
    if (url) preview.src = url
  })
  render()

  root.append(top, el('div.scroller', {}, el('div.narrow', {}, el('div.dress-stage', {}, preview), sections)))
  return {
    root,
    dispose: () => {
      unsub()
      app.holdScene(false)
    },
  }
}
