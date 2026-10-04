import type { App, Screen } from '../app'
import { animalById } from '../content/animals'
import type { ItemId } from '../content/blocks'
import type { Question } from '../content/types'
import { checkDutchAnswer, checkTyped, type AlmostReason } from '../engine/answer'
import type { Pick } from '../engine/engine'
import { makeRng } from '../engine/rng'
import { alternatives, closestDutch, diffMarks, gapForm, letterHint, letterHintFirst, splitArticle, stripNlArticle, type Lang } from '../engine/text'
import type { Outcome } from '../engine/words'
import { finishRound } from '../game/day'
import { addItems, nextStreak, rewardFor } from '../game/rewards'
import { EXTENSION_SECONDS, LEARNED_BONUS, UNLOCK_RIGHT, addTime, clock, nextRun, secondsFor } from '../game/buildtime'
import { inventoryChip, sleep, speakButton, updateInventoryChip, watchInsets } from './common'
import { el } from './dom'

/** Ten questions: a good pace for a 7-year-old. */
export const ROUND_LENGTH = 10

export interface RoundResult {
  earned: ItemId[]
  /** Build time earned this round, in seconds. */
  seconds: number
  learned: string[]
  weak: string[]
  right: number
  total: number
}

const KIND_LABEL: Record<Pick['type'], string> = {
  recognize: 'Welk woord hoort bij deze betekenis?',
  reverse: 'Wat betekent dit woord?',
  sentence: 'Welk woord past in de zin?',
  type: 'Typ het woord dat hierbij hoort',
}

/** English lists only ask English to Dutch: choose the Dutch or type it. */
const KIND_LABEL_EN: Record<Pick['type'], string> = {
  recognize: 'Wat betekent dit?',
  reverse: 'Wat betekent dit?',
  sentence: 'Wat betekent dit?',
  type: 'Typ het in het Nederlands',
}

/** The gap sentence with the word filled in, for reading aloud (first alternative only). */
export function filledSentence(q: Question): string {
  return (q.sentence ?? '').replace('___', alternatives(q.word)[0])
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function pickLine(lines: string[], word?: string): string {
  const line = lines[Math.floor(Math.random() * lines.length)] ?? ''
  return line.replace('{woord}', word ? `"${word}"` : 'dit woord')
}

/** The correct word with the letters that went wrong highlighted. English lists: `word` is the Dutch translation. */
export function markedWord(answer: string, word: string, lang: Lang = 'nl'): HTMLElement {
  if (lang === 'en') {
    const wrap = el('div.answer')
    const target = answer.trim() ? closestDutch(stripNlArticle(answer.trim().toLowerCase()), word) : word
    const marks = answer.trim() ? diffMarks(answer.trim(), target) : [...target].map((ch) => ({ ch, ok: true }))
    for (const m of marks) {
      if (m.ok) wrap.appendChild(document.createTextNode(m.ch))
      else wrap.appendChild(el('span.x', { text: m.ch }))
    }
    return wrap
  }
  const wrap = el('div.answer')
  // Compare against the form the player aimed at: with article if they typed one.
  const { article } = splitArticle(word)
  const typedArticle = /^(de|het|een)\s/i.test(answer.trim())
  const target = article && !typedArticle && answer.trim() ? gapForm(word) : word
  const marks = answer.trim() ? diffMarks(answer.trim(), target) : [...target].map((ch) => ({ ch, ok: true }))
  for (const m of marks) {
    if (m.ok) wrap.appendChild(document.createTextNode(m.ch))
    else wrap.appendChild(el('span.x', { text: m.ch }))
  }
  return wrap
}

const ALMOST_TEXT: Record<AlmostReason, string> = {
  article: 'Bijna goed! Let op het lidwoord.',
  accent: 'Bijna goed! Let op de puntjes of het streepje.',
  typo: 'Bijna goed! Er is één letter anders.',
}

/** `{ unlock: true }`: a short round of 5 right answers that unlocks building again. */
export interface RoundOptions {
  unlock?: boolean
}

export function roundScreen(app: App, payload?: unknown): Screen {
  const unlock = Boolean((payload as RoundOptions | undefined)?.unlock)
  const length = unlock ? UNLOCK_RIGHT : ROUND_LENGTH
  const engine = app.makeEngine()
  engine.avoid(app.lastWord)
  const lang = engine.lang
  const en = lang === 'en'
  const rng = makeRng(Date.now() & 0x7fffffff)
  const earned: ItemId[] = []
  const learned: string[] = []
  const asked = new Set<string>()
  let index = 0
  let right = 0
  let seconds = 0
  /** Unlock round: right answers in a row. */
  let run = 0
  let streak = 0
  let disposed = false
  let leaving: Promise<void> = Promise.resolve()

  app.scene.setMood('day')
  app.scene.catPose('idle')

  const dots = el('div.progress')
  for (let i = 0; i < length; i++) dots.appendChild(el('i'))
  const streakChip = el('div.chip.hidden')
  const invChip = inventoryChip(app.store.profile.inventory)
  const top = el(
    'div.topbar',
    {},
    el('button.btn.small.ghost', { onclick: () => app.go('menu') }, '✕ Stoppen'),
    dots,
    el('div.spacer'),
    streakChip,
    invChip,
  )
  const card = el('div.card.sheet')
  const root = el('div.screen', {}, top, el('div.spacer'), card)
  const unwatch = watchInsets(app, top, card)

  function updateTop(): void {
    ;[...dots.children].forEach((d, i) => {
      // The unlock round counts right answers, a normal round counts questions.
      const at = unlock ? run : index
      d.className = i < at ? 'done' : i === at ? 'now' : ''
    })
    streakChip.classList.toggle('hidden', streak < 2)
    streakChip.textContent = `⭐ ${streak} op een rij`
    updateInventoryChip(invChip, app.store.profile.inventory)
  }

  function record(q: Question, type: Pick['type'], outcome: Outcome): ItemId[] {
    answered = true
    const { before, after } = engine.record(q.word, type, outcome)
    asked.add(q.word)
    if (after === 'geleerd' && before !== 'geleerd' && !learned.includes(q.word)) learned.push(q.word)
    if (outcome === 'correct' || outcome === 'hint') right++
    if (unlock) {
      const before = run
      run = nextRun(run, outcome)
      if (before > 0 && run === 0) app.toast('Oeps, nog een keer! 5 goed op een rij en je mag weer bouwen.')
    }
    streak = nextStreak(streak, outcome)
    const items = rewardFor(type, outcome, streak, rng)
    earned.push(...items)
    // The unlock round pays a fixed extension at the end instead of time per answer.
    const time = unlock ? 0 : secondsFor(outcome) + (learned.includes(q.word) && after === 'geleerd' && before !== 'geleerd' ? LEARNED_BONUS : 0)
    seconds += time
    app.saveEngine(engine)
    app.lastWord = q.word
    app.store.update((p) => {
      p.inventory = addItems(p.inventory, items)
      p.stats.answers++
      p.buildTime = addTime(p.buildTime, time)
    })
    return items
  }

  async function celebrate(items: ItemId[], outcome: Outcome): Promise<void> {
    app.audio.play('right')
    app.scene.catJump()
    app.scene.animalState('happy')
    app.scene.burst('sparkle', 'cat')
    if (streak > 0 && streak % 5 === 0 && (outcome === 'correct' || outcome === 'hint')) {
      app.audio.play('streak', streak)
      app.toast(`${streak} op een rij! Een meubelstuk voor het eiland!`)
      app.scene.burst('stars', 'cat')
    } else if (streak > 0 && streak % 3 === 0 && (outcome === 'correct' || outcome === 'hint')) {
      app.audio.play('streak', streak)
      app.toast(`${streak} op een rij! Een vissnoepje voor Katrien!`)
    }
    window.setTimeout(() => app.audio.play('reward'), 350)
    await app.flyRewards(items, invChip)
    updateTop()
  }

  function finish(): void {
    if (unlock) {
      // Back to building straight away; this short round is not a daily round.
      app.store.update((p) => {
        p.buildTime = Math.max(p.buildTime, EXTENSION_SECONDS)
        p.extensionUsed = true
      })
      app.toast(`Goed zo! Je mag nog ${clock(EXTENSION_SECONDS)} bouwen.`)
      app.go('bouwen')
      return
    }
    app.store.update((p) => {
      p.extensionUsed = false
      p.days = finishRound(p.days, Date.now())
      p.stats.rounds++
    })
    const result: RoundResult = {
      earned,
      seconds,
      learned,
      weak: engine.weakest(3, [...asked]).map((q) => q.word),
      right,
      total: length,
    }
    app.go('result', result)
  }

  async function next(): Promise<void> {
    if (disposed) return
    if (unlock ? run >= length : index >= length) {
      finish()
      return
    }
    updateTop()
    const pick = engine.next()
    const animal = animalById(app.nextAnimal())
    currentAnimal = animal
    // English lists always show the English, so the line may name it.
    const line = en || pick.type === 'reverse' ? pickLine(animal.askWord, pick.q.word) : pickLine(animal.ask)
    const who = showQuestion(pick, `${animal.naam} komt eraan...`)
    const my = ++seq
    answered = false
    arrival = leaving.then(async () => {
      if (disposed || my !== seq) return
      app.scene.catPose('idle')
      await app.scene.animalArrives(animal.id)
      if (disposed || my !== seq) return
      if (!answered) app.scene.animalState('talk')
      if (who.isConnected) who.textContent = `${animal.naam}: "${line}"`
    })
  }

  let currentAnimal = animalById(app.nextAnimal())
  /** Bumped per question, so a late arrival never acts on a newer question. */
  let seq = 0
  let answered = false
  let arrival: Promise<void> = Promise.resolve()

  async function done(): Promise<void> {
    answered = true
    await sleep(1300)
    if (disposed) return
    index++
    // Let the visitor finish arriving before it waves goodbye.
    const arrived = arrival
    leaving = arrived.then(() => (disposed ? undefined : app.scene.animalLeaves()))
    void next()
  }

  function promptFor(pick: Pick): HTMLElement {
    const q = pick.q
    // English lists: always the English, big, in the rounded font.
    if (en) return el(`div.q-prompt${engine.isSentence(q.word) ? lengthClass(q.word) : '.word'}.en`, { text: q.word })
    if (pick.type === 'reverse') return el('div.q-prompt.word', { text: q.word })
    if (pick.type === 'sentence' && q.sentence) {
      const [a, b] = q.sentence.split('___')
      return el(`div.q-prompt${lengthClass(q.sentence)}`, { html: `${escapeHtml(a)}<span class="gap">&nbsp;</span>${escapeHtml(b ?? '')}` })
    }
    return el(`div.q-prompt${lengthClass(q.definition)}`, { text: q.definition })
  }

  function lengthClass(text: string): string {
    return text.length > 130 ? '.xlong' : text.length > 80 ? '.long' : ''
  }

  /** What the speaker button reads. English lists: always the English, never Dutch. */
  function speakTextFor(pick: Pick): string {
    if (en) return pick.q.word
    if (pick.type === 'reverse') return pick.q.word
    if (pick.type === 'sentence' && pick.q.sentence) return pick.q.sentence.replace('___', '... hm ...')
    return pick.q.definition
  }

  /** English lists: the English is read again after every answer (never the Dutch). */
  function sayAfter(pick: Pick): void {
    if (en) app.say(pick.q.word)
  }

  function showQuestion(pick: Pick, intro: string): HTMLElement {
    card.replaceChildren()
    const who = el('div.q-who', { text: intro })
    const head = el('div.q-head', {}, who, speakButton(app, () => speakTextFor(pick)))
    const prompt = promptFor(pick)
    const feedback = el('div.feedback')
    const learnBox = el('div.learn.hidden')
    const body = pick.type === 'type' ? typeBody(pick, feedback, learnBox) : choiceBody(pick, prompt, feedback, learnBox)
    card.append(el('div.sheet-scroll', {}, head, el('div.q-kind', { text: (en ? KIND_LABEL_EN : KIND_LABEL)[pick.type] }), prompt, learnBox, feedback, body))
    // English lists: the English is read straight away.
    if (en) app.say(pick.q.word)
    return who
  }

  function showLearn(learnBox: HTMLElement, pick: Pick, answer: string, label: string): void {
    const q = pick.q
    // English lists: the Dutch answer big (school handwriting), the English small under it.
    learnBox.replaceChildren(
      el('div.label', { text: label }),
      en ? markedWord(answer, q.definition, lang) : markedWord(answer, q.word, lang),
      en ? el('div.def.en', { text: q.word }) : el('div.def', { text: q.definition }),
    )
    learnBox.classList.remove('hidden')
    if (en) sayAfter(pick)
    else app.say(`${q.word}. ${q.definition}`)
  }

  function fillGap(prompt: HTMLElement, q: Question): void {
    const gap = prompt.querySelector('.gap')
    if (gap) gap.textContent = gapForm(q.word)
  }

  function choiceBody(pick: Pick, prompt: HTMLElement, feedback: HTMLElement, learnBox: HTMLElement): HTMLElement {
    const opts = pick.options!
    // English lists: the options are Dutch, in school handwriting.
    const optLang = en ? '.nl' : ''
    const long = en ? opts.labels.some((l) => l.length > 26) : pick.type === 'reverse'
    const wrap = el(`div.options${long ? '.long' : ''}${en ? '.big' : ''}`)
    let state: 'ask' | 'learn' | 'done' = 'ask'
    const buttons = opts.labels.map((label, i) =>
      el(`button.opt${optLang}`, {
        text: label,
        onclick: () => choose(i),
      }),
    )
    wrap.append(...buttons)

    function choose(i: number): void {
      if (state === 'done') return
      app.audio.play('tap')
      const isRight = i === opts.answer
      if (state === 'ask') {
        if (isRight) {
          state = 'done'
          buttons[i].classList.add('right')
          buttons.forEach((b, k) => k !== i && b.classList.add('dim'))
          if (pick.type === 'sentence') fillGap(prompt, pick.q)
          feedback.textContent = pickLine(currentAnimal.happy)
          sayAfter(pick)
          const items = record(pick.q, pick.type, 'correct')
          void celebrate(items, 'correct')
          void done()
        } else {
          state = 'learn'
          record(pick.q, pick.type, 'wrong')
          buttons[i].classList.add('tried')
          buttons[opts.answer].classList.add('show')
          buttons.forEach((b, k) => k !== i && k !== opts.answer && b.classList.add('dim'))
          app.audio.play('wrong')
          app.scene.catSurprised()
          app.scene.animalState('idle')
          showLearn(learnBox, pick, '', 'Het goede antwoord is')
          feedback.textContent = ''
          wrap.before(el('p.note', { text: 'Tik nu op het goede antwoord.' }))
          updateTop()
        }
        return
      }
      // Learning: only the right one moves on, a mis-tap just gets a soft tap.
      if (isRight) {
        state = 'done'
        buttons[i].classList.remove('show')
        buttons[i].classList.add('right')
        if (pick.type === 'sentence') fillGap(prompt, pick.q)
        feedback.textContent = pickLine(currentAnimal.learn)
        app.scene.catPose('idle')
        app.scene.animalState('happy')
        app.audio.play('reward')
        void done()
      }
    }
    return wrap
  }

  function typeBody(pick: Pick, feedback: HTMLElement, learnBox: HTMLElement): HTMLElement {
    const q = pick.q
    let hints = 0
    let state: 'ask' | 'learn' | 'done' = 'ask'
    let retries = 0
    const input = el('input.type-input', {
      type: 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
      enterkeyhint: 'done',
      lang: 'nl',
      placeholder: en ? 'Typ het Nederlands...' : 'Typ hier...',
      'aria-label': 'Jouw antwoord',
    }) as HTMLInputElement
    const ok = el('button.btn.green', { type: 'submit' }, 'Klaar')
    const form = el('form.type-row', {}, input, ok)
    const hintBtn = el('button.btn.small.lila', { type: 'button' }, '💡 Hint')
    const hintBox = el('div.hint-box.hidden')
    const skip = el('button.btn.small.hidden', { type: 'button' }, 'Verder')
    const hintRow = el('div.hint-row', {}, hintBtn, hintBox, skip)
    const wrap = el('div', {}, form, hintRow)

    hintBtn.addEventListener('click', () => {
      if (state !== 'ask' || hints >= 2) return
      hints++
      app.audio.play('tap')
      hintBox.classList.remove('hidden')
      if (hints === 1 && en) {
        // English lists, hint 1: the English example sentence, or the first Dutch letter.
        if (q.sentence) {
          hintBox.classList.add('en')
          hintBox.textContent = filledSentence(q)
        } else {
          const first = [...stripNlArticle(alternatives(q.definition)[0].toLowerCase())][0] ?? ''
          hintBox.textContent = `Het begint met een '${first}'`
        }
      } else if (hints === 1 && q.hint) {
        hintBox.textContent = q.hint
      } else {
        hintBox.classList.remove('en')
        hintBox.classList.add('letters')
        hintBox.textContent = en ? letterHintFirst(q.definition, 2) : letterHint(q.word, hints === 1 ? 2 : 3)
      }
      hintBtn.textContent = hints >= 2 ? '💡 Geen hints meer' : '💡 Nog een hint'
      if (hints >= 2) hintBtn.setAttribute('disabled', 'true')
      input.focus()
    })

    skip.addEventListener('click', () => {
      if (state === 'done') return
      state = 'done'
      app.scene.catPose('idle')
      void done()
    })

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const value = input.value
      if (state === 'done' || value.trim() === '') {
        input.focus()
        return
      }
      const check = en ? checkDutchAnswer(value, q.definition) : checkTyped(value, q.word)
      if (state === 'ask') {
        if (check.result === 'correct') {
          state = 'done'
          const outcome: Outcome = hints > 0 ? 'hint' : 'correct'
          input.classList.add('good')
          input.blur()
          feedback.textContent = pickLine(currentAnimal.happy)
          hintRow.classList.add('hidden')
          sayAfter(pick)
          const items = record(q, 'type', outcome)
          void celebrate(items, outcome)
          void done()
          return
        }
        state = 'learn'
        const outcome: Outcome = check.result === 'almost' ? 'almost' : 'wrong'
        const items = record(q, 'type', outcome)
        hintBtn.classList.add('hidden')
        hintBox.classList.add('hidden')
        if (outcome === 'almost') {
          app.audio.play('tap')
          app.scene.animalState('idle')
          showLearn(learnBox, pick, value, ALMOST_TEXT[check.reason ?? 'typo'])
          void app.flyRewards(items, invChip).then(updateTop)
        } else {
          app.audio.play('wrong')
          app.scene.catSurprised()
          app.scene.animalState('idle')
          showLearn(learnBox, pick, '', 'Het goede woord is')
        }
        feedback.textContent = ''
        input.value = ''
        input.placeholder = en ? 'Typ het goede Nederlands' : 'Typ het goede woord'
        updateTop()
        input.focus()
        return
      }
      // Learning: type it once the right way.
      if (check.result === 'correct') {
        state = 'done'
        input.classList.add('good')
        input.blur()
        feedback.textContent = pickLine(currentAnimal.learn)
        app.scene.catPose('idle')
        app.scene.animalState('happy')
        app.audio.play('reward')
        void done()
      } else {
        retries++
        input.value = ''
        app.audio.play('tap')
        input.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 })
        if (retries >= 2) skip.classList.remove('hidden')
        input.focus()
      }
    })
    return wrap
  }

  if (unlock) window.setTimeout(() => !disposed && app.toast(`Doe ${UNLOCK_RIGHT} woorden goed op een rij, dan mag je weer bouwen!`), 400)
  void next()

  return {
    root,
    dispose: () => {
      disposed = true
      unwatch()
    },
  }
}
