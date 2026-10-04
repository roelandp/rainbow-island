import type { App, Screen } from '../app'
import type { Question } from '../content/types'
import { checkDutchAnswer, checkTyped } from '../engine/answer'
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
 * Practice test: every word of the active test in random order. English lists:
 * the English is shown and read aloud, the Dutch is chosen from 4 (Wyne
 * never types). No hints and no feedback per question; the result
 * comes at the end. Only English is ever read aloud.
 */
export function toetsScreen(app: App): Screen {
  const toets = app.toets
  const isEn = toets.language === 'en'
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
          text: isEn
            ? `Je krijgt alle ${toets.questions.length} woorden en zinnen, door elkaar. Je ziet het Engels en kiest het goede Nederlands. Geen hints. Pas aan het eind zie je hoe het ging. Elk goed antwoord levert een blok op.`
            : `Je krijgt alle ${toets.questions.length} woorden, door elkaar. Je ziet de betekenis en typt het woord. Net als op school: geen hints, en pas aan het eind zie je hoe het ging. Elk goed woord levert een blok op.`,
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
      lang: 'nl',
      placeholder: isEn ? 'Typ het Nederlands...' : 'Typ het woord...',
    }) as HTMLInputElement
    const form = el('form.type-row', {}, input, el('button.btn.green', { type: 'submit' }, 'Volgende'))
    const choices = el('div.options.big')
    const card = el('div.card.panel', {}, el('div.q-head', {}, counter, isEn ? speakButton(app, () => order[i]?.word ?? '') : null), prompt, form, choices)
    inner.replaceChildren(card)

    const advance = () => {
      app.audio.play('tap')
      i++
      if (i >= order.length) finish(answers)
      else show()
    }

    const show = () => {
      const q = order[i]
      counter.textContent = `Vraag ${i + 1} van ${order.length}`
      prompt.textContent = isEn ? q.word : q.definition
      prompt.className = isEn ? `q-prompt en${engine.isSentence(q.word) ? '' : ' word'}` : 'q-prompt'
      if (isEn) app.say(q.word)
      input.value = ''
      // English lists are never typed: choose the right Dutch one.
      if (engine.choiceOnly(q.word)) {
        const pick = engine.make(q, 'fallback', 'reverse')
        const opts = pick.options!
        const long = opts.labels.some((l) => l.length > 26)
        choices.className = `options big${long ? ' long' : ''}`
        choices.replaceChildren(
          ...opts.labels.map((label, k) =>
            el('button.opt.nl', {
              text: label,
              onclick: () => {
                if (busy || order[i] !== q) return
                busy = true
                window.setTimeout(() => (busy = false), 250)
                const ok = k === opts.answer
                answers.push({ q, answer: label, ok })
                engine.record(q.word, 'reverse', ok ? 'correct' : 'wrong')
                app.saveEngine(engine)
                advance()
              },
            }),
          ),
        )
        form.classList.add('hidden')
        choices.classList.remove('hidden')
        input.blur()
        return
      }
      choices.classList.add('hidden')
      form.classList.remove('hidden')
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
      const check = isEn ? checkDutchAnswer(value, q.definition) : checkTyped(value, q.word)
      // On a test, spelling counts: almost is not right.
      const ok = check.result === 'correct'
      answers.push({ q, answer: value.trim(), ok })
      engine.record(q.word, 'type', ok ? 'correct' : check.result === 'almost' ? 'almost' : 'wrong')
      app.saveEngine(engine)
      advance()
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
        el('p.note', { html: `<strong>${correct} van de ${answers.length}</strong> goed${isEn ? '' : ' gespeld'}. Je verdient ${items.length} ${items.length === 1 ? 'blok' : 'blokken'} en ${clock(seconds)} bouwtijd.` }),
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
                  el('li', {}, a.answer ? el('span.given', { text: a.answer }) : el('span.given', { text: '(leeg)' }), el('span.good', { text: isEn ? a.q.definition : a.q.word }), el(`span${isEn ? '.en' : ''}`, { style: { fontWeight: '700', color: 'var(--ink-dim)', flexBasis: '100%' }, text: isEn ? a.q.word : a.q.definition })),
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
