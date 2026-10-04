import type { App, Screen } from '../app'
import type { Question } from '../content/types'
import { checkTyped } from '../engine/answer'
import { makeRng } from '../engine/rng'
import { addItems, rewardFor } from '../game/rewards'
import { addTime, clock, secondsFor } from '../game/buildtime'
import type { TestResult } from '../storage/schema'
import { speakButton } from './common'
import { el } from './dom'
import { checkLighthouse } from './result'

/** 1 to 10 with one decimal, like a Dutch school grade. */
export function grade(correct: number, total: number): number {
  if (total <= 0) return 1
  return Math.round((1 + (9 * correct) / total) * 10) / 10
}

function gradeText(g: number): string {
  return g.toFixed(1).replace('.', ',')
}

/**
 * Practice test: every word of the active test in random order, meaning shown,
 * word typed. No hints and no feedback per question; the result comes at the end.
 */
export function toetsScreen(app: App): Screen {
  const toets = app.toets
  const root = el('div.screen.solid')
  const top = el('div.topbar', {}, el('button.btn.small', { onclick: () => app.go('menu') }, '✕ Stoppen'), el('h1', { text: 'Proeftoets' }))
  const body = el('div.scroller')
  const inner = el('div.narrow')
  body.appendChild(inner)
  root.append(top, body)
  app.holdScene(true)

  intro()

  function intro(): void {
    const history = app.store.profile.tests.filter((t) => t.toets === toets.id).slice(-10).reverse()
    const panels: HTMLElement[] = [
      el(
        'div.card.panel',
        {},
        el('h2', { text: toets.title }),
        el('p', {
          text: `Je krijgt alle ${toets.questions.length} woorden, door elkaar. Je ziet de betekenis en typt het woord. Net als op school: geen hints, en pas aan het eind zie je hoe het ging. Elk goed woord levert een blok op.`,
        }),
        el('button.btn.primary', { style: { width: '100%' }, onclick: () => run() }, 'Start de proeftoets'),
      ),
    ]
    if (history.length > 0)
      panels.push(
        el(
            'div.card.panel',
            {},
            el('h2', { text: 'Eerdere proeftoetsen' }),
            el(
              'div.history',
              {},
              ...history.map((t) => el('span', { text: `${new Date(t.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${gradeText(t.grade)} (${t.correct}/${t.total})` })),
            ),
          ),
      )
    inner.replaceChildren(...panels)
  }

  function run(): void {
    const engine = app.makeEngine(toets)
    const rng = makeRng(Date.now() & 0x7fffffff)
    const order: Question[] = [...toets.questions]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const answers: { q: Question; answer: string; ok: boolean }[] = []
    let i = 0
    let busy = false

    const counter = el('div.q-kind')
    const prompt = el('div.q-prompt')
    const input = el('input.type-input', {
      type: 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
      enterkeyhint: 'next',
      placeholder: 'Typ het woord...',
    }) as HTMLInputElement
    const form = el('form.type-row', {}, input, el('button.btn.green', { type: 'submit' }, 'Volgende'))
    const card = el('div.card.panel', {}, el('div.q-head', {}, counter, speakButton(app, () => order[i]?.definition ?? '')), prompt, form)
    inner.replaceChildren(card)

    const show = () => {
      counter.textContent = `Vraag ${i + 1} van ${order.length}`
      prompt.textContent = order[i].definition
      input.value = ''
      input.focus()
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const q = order[i]
      const value = input.value
      if (!q || busy || value.trim() === '') {
        input.focus()
        return
      }
      busy = true
      window.setTimeout(() => (busy = false), 250)
      const check = checkTyped(value, q.word)
      // On a test, spelling counts: almost is not right.
      const ok = check.result === 'correct'
      answers.push({ q, answer: value.trim(), ok })
      engine.record(q.word, 'type', ok ? 'correct' : check.result === 'almost' ? 'almost' : 'wrong')
      app.saveEngine(engine)
      app.audio.play('tap')
      i++
      if (i >= order.length) finish(answers)
      else show()
    })
    show()
  }

  function finish(answers: { q: Question; answer: string; ok: boolean }[]): void {
    const correct = answers.filter((a) => a.ok).length
    const g = grade(correct, answers.length)
    const rng = makeRng(Date.now() & 0x7fffffff)
    const items = answers.filter((a) => a.ok).flatMap(() => rewardFor('recognize', 'correct', 0, rng))
    const result: TestResult = {
      at: Date.now(),
      toets: toets.id,
      total: answers.length,
      correct,
      grade: g,
      wrong: answers.filter((a) => !a.ok).map((a) => ({ word: a.q.word, answer: a.answer })),
    }
    const seconds = correct * secondsFor('correct')
    app.store.update((p) => {
      p.inventory = addItems(p.inventory, items)
      p.tests = [...p.tests, result].slice(-10)
      p.buildTime = addTime(p.buildTime, seconds)
      p.extensionUsed = false
    })
    app.audio.play('roundEnd')
    const lighthouse = checkLighthouse(app)
    const wrong = answers.filter((a) => !a.ok)
    inner.replaceChildren(
      el(
        'div.card.panel',
        {},
        el('h2', { text: 'Jouw cijfer' }),
        el('div.grade', { text: gradeText(g) }),
        el('p.note', { html: `<strong>${correct} van de ${answers.length}</strong> goed gespeld. Je verdient ${items.length} ${items.length === 1 ? 'blok' : 'blokken'} en ${clock(seconds)} bouwtijd.` }),
        lighthouse ? el('p.note', { html: '<strong>Alle woorden geleerd! Er staat een vuurtorentje voor je klaar.</strong>' }) : null,
        wrong.length > 0
          ? el(
              'div',
              {},
              el('div.section-label', { text: 'Zo schrijf je ze' }),
              el(
                'ul.mistakes',
                {},
                ...wrong.map((a) =>
                  el('li', {}, a.answer ? el('span.given', { text: a.answer }) : el('span.given', { text: '(leeg)' }), el('span.good', { text: a.q.word }), el('span', { style: { fontWeight: '700', color: 'var(--ink-dim)', flexBasis: '100%' }, text: a.q.definition })),
                ),
              ),
            )
          : el('p.note', { html: '<strong>Alles goed! Knap hoor!</strong>' }),
        el('div.row', {}, el('button.btn.primary', { onclick: () => app.go('menu') }, 'Klaar'), el('button.btn', { onclick: () => intro() }, 'Nog een keer')),
      ),
    )
    body.scrollTop = 0
  }

  return {
    root,
    dispose: () => app.holdScene(false),
  }
}
