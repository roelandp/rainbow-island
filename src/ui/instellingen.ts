import type { App, Screen } from '../app'
import { TOETSEN, formatDate } from '../content'
import { el } from './dom'

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = el(`button.toggle${on ? '.on' : ''}`, { role: 'switch', 'aria-checked': String(on) })
  t.addEventListener('click', () => {
    on = !on
    t.classList.toggle('on', on)
    t.setAttribute('aria-checked', String(on))
    onChange(on)
  })
  return t
}

export function instellingenScreen(app: App): Screen {
  const p = app.store.profile
  const root = el('div.screen.solid')
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '← Terug'), el('h1', { text: 'Instellingen' }))
  app.holdScene(true)

  const list = el('div.choice-list')
  const renderList = () => {
    const chosen = app.store.profile.settings.toets
    list.replaceChildren(
      el(`button${chosen === null ? '.on' : ''}`, { onclick: () => choose(null) }, 'Automatisch: de nieuwste toets', el('small', { text: TOETSEN[0]?.title ?? '' })),
      ...TOETSEN.map((t) =>
        el(
          `button${chosen === t.id ? '.on' : ''}`,
          { onclick: () => choose(t.id) },
          t.title,
          el('small', { text: `${t.questions.length} woorden${t.date ? ` · ${formatDate(t.date)}` : ''}` }),
        ),
      ),
    )
  }
  const choose = (id: string | null) => {
    app.store.update((pp) => {
      pp.settings.toets = id
    })
    renderList()
  }
  renderList()

  const confirmBox = el('div.danger-zone')
  const renderReset = (asking: boolean) => {
    confirmBox.replaceChildren(
      ...(asking
        ? [
            el('p', { html: '<strong>Weet je het zeker?</strong> Alle woorden, blokken, het eiland en de proeftoetsen van Wyne worden gewist.' }),
            el(
              'div.row',
              {},
              el(
                'button.btn.lila',
                {
                  onclick: () => {
                    app.store.reset()
                    // A fresh start: reload so the island is small again.
                    location.reload()
                  },
                },
                'Ja, wis alles',
              ),
              el('button.btn', { onclick: () => renderReset(false) }, 'Nee, laat maar'),
            ),
          ]
        : [el('button.btn', { style: { width: '100%' }, onclick: () => renderReset(true) }, 'Voortgang wissen')]),
    )
  }
  renderReset(false)

  const soundRow = el(
    'div.setting',
    {},
    el('label', { text: 'Geluid' }),
    toggle(p.settings.sound, (v) => {
      app.store.update((pp) => {
        pp.settings.sound = v
      })
      app.audio.effects = v
      if (v) app.audio.play('right')
    }),
  )
  const speakRow = el(
    'div.setting',
    {},
    el('label', {}, 'Voorlezen', el('small', { style: { display: 'block', color: 'var(--ink-dim)', fontWeight: '700' }, text: 'Leest het goede woord voor als het nog niet lukte' })),
    toggle(p.settings.speak, (v) => {
      app.store.update((pp) => {
        pp.settings.speak = v
      })
    }),
  )

  const body = el(
    'div.scroller',
    {},
    el(
      'div.narrow',
      {},
      el('div.card.panel', {}, el('h2', { text: 'Welke toets oefen je?' }), list),
      el('div.card.panel', {}, soundRow, speakRow),
      el('div.card.panel', {}, el('h2', { text: 'Opnieuw beginnen' }), confirmBox),
      el('p.tiny', { text: `Versie ${__BUILD_ID__.slice(0, 16).replace('T', ' ')} · Katrien: ${app.sceneKind}` }),
    ),
  )
  root.append(top, body)
  return { root, dispose: () => app.holdScene(false) }
}
