import type { App, Screen } from '../app'
import type { Question } from '../content/types'
import { alternatives, gapFormFor } from '../engine/text'
import { statusOf, type WordState, type WordStatus } from '../engine/words'
import { speakButton } from './common'
import { el } from './dom'
import { escapeHtml, filledSentence } from './round'

const LABEL: Record<WordStatus, string> = {
  nieuw: 'Nieuw',
  oefenen: 'Oefenen',
  bijna: 'Bijna',
  geleerd: 'Geleerd',
}

function when(s: WordState, now: number): string {
  if (s.seen === 0) return 'nog niet gezien'
  if (s.retryIn >= 0 || s.dueAt <= now) return 'nu'
  const h = Math.round((s.dueAt - now) / 3_600_000)
  if (h < 1) return 'binnen een uur'
  if (h < 24) return `over ${h} uur`
  const d = Math.round(h / 24)
  return d === 1 ? 'morgen' : `over ${d} dagen`
}

/** Every word of the active test as a coloured tile. Also the overview for parents. */
export function kaartScreen(app: App): Screen {
  const toets = app.toets
  const engine = app.makeEngine(toets)
  const en = engine.lang === 'en'
  const root = el('div.screen.solid')
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '← Terug'), el('h1', { text: 'Woordenkaart' }))
  const counts: Record<WordStatus, number> = { nieuw: 0, oefenen: 0, bijna: 0, geleerd: 0 }
  for (const q of toets.questions) counts[engine.status(q.word)]++

  const legend = el(
    'div.legend',
    {},
    ...(Object.keys(LABEL) as WordStatus[]).map((k) => el('span', {}, el(`i.st-${k}`), `${LABEL[k]} ${counts[k]}`)),
  )
  const tiles = el(
    'div.tiles',
    {},
    ...toets.questions.map((q) => {
      const st = engine.status(q.word)
      return el(`button.tile.st-${st}`, { onclick: () => detail(q) }, el(`span${en ? '.en' : ''}`, { text: q.word }), el('small', { text: LABEL[st] }))
    }),
  )
  const tests = app.store.profile.tests.filter((t) => t.toets === toets.id).slice(-5).reverse()
  const testLine = tests.length
    ? el('p.note', { text: `Proeftoetsen: ${tests.map((t) => `${t.grade.toFixed(1).replace('.', ',')} (${t.correct}/${t.total})`).join(', ')}` })
    : null
  const p = app.store.profile
  const parent = el('p.tiny', {
    text: `${p.days.played} ${p.days.played === 1 ? 'dag' : 'dagen'} gespeeld · ${p.stats.rounds} rondes · ${p.stats.answers} antwoorden`,
  })

  const body = el('div.scroller', {}, el('div.narrow', {}, el('p.note', { html: `<strong>${escapeHtml(toets.title)}</strong>` }), legend, testLine, tiles, parent))
  root.append(top, body)
  app.holdScene(true)

  function detail(q: Question): void {
    const s = engine.state(q.word)
    const st = statusOf(s)
    const isSentence = engine.isSentence(q.word)
    const sentence = q.sentence ? escapeHtml(q.sentence).replace('___', `<b>${escapeHtml(en ? alternatives(q.word).join(' / ') : gapFormFor(q.word))}</b>`) : null
    // English lists: the speaker reads only the English (word, then the sentence).
    const spoken = () => (en ? (q.sentence ? `${q.word}. ${filledSentence(q)}` : q.word) : `${q.word}. ${q.definition}`)
    const box = el(
      'div.card.detail',
      { onclick: (e: Event) => e.stopPropagation() },
      el('div.q-head', {}, el(`h2${en ? '.en' : ''}`, { text: q.word, style: { flex: '1' } }), speakButton(app, spoken)),
      el('div', {}, el(`span.chip.st-${st}`, { text: LABEL[st] })),
      el(`p${en ? '.nl-big' : ''}`, { text: q.definition }),
      sentence ? el(`p.sentence${en ? '.en' : ''}`, { html: sentence }) : null,
      q.hint ? el('p', { style: { color: 'var(--lila-deep)' }, text: `Hint: ${q.hint}` }) : null,
      el(
        'div.stats',
        {},
        el('div', {}, el('b', { text: String(s.seen) }), 'keer gezien'),
        el('div', {}, el('b', { text: String(s.correct) }), 'keer goed'),
        el('div', {}, el('b', { text: String(s.wrong) }), 'keer fout'),
        isSentence
          ? el('div', {}, el('b', { text: `${s.dirClean.recognize} + ${s.dirClean.reverse}` }), 'goed, twee kanten')
          : el('div', {}, el('b', { text: String(s.typedClean) }), 'goed getypt'),
        el('div', {}, el('b', { text: `${s.box} / 5` }), 'doosje'),
        el('div', {}, el('b', { text: when(s, Date.now()), style: { fontSize: '17px' } }), 'komt terug'),
      ),
      el('button.btn', { style: { width: '100%' }, onclick: () => overlay.remove() }, 'Sluiten'),
    )
    const overlay = el('div.overlay', { onclick: () => overlay.remove() }, box)
    root.appendChild(overlay)
  }

  return { root, dispose: () => app.holdScene(false) }
}
