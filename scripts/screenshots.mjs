#!/usr/bin/env node
/**
 * Layout check: screenshots of every screen at three viewports, plus in-page checks
 * for scrollbars, clipped text and forbidden words ("Nugget", "Viggo", "hem/hij" about Katrien).
 *
 * Usage:
 *   node scripts/screenshots.mjs                    # builds a snapshot and serves it on :4179 (unless :4179 is already up)
 *   DEV=1 node scripts/screenshots.mjs              # use the vite dev server instead (reloads on edits)
 *   node scripts/screenshots.mjs http://localhost:4179/
 *   ONLY=820x1180 node scripts/screenshots.mjs      # one viewport
 *   STEPS=start,q-gap node scripts/screenshots.mjs  # only steps whose name contains one of these
 *
 * Output: screenshots/<viewport>/<nn>-<step>.png and screenshots/report.json.
 * Exit code 1 when problems were found (missing steps count as problems too).
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire('/Users/roelandp/Code/Claude/projects/kit-nugget-klimt/node_modules/')
const { chromium } = require('playwright-core')

const CHROMIUM = (() => {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  const candidates = [
    join(base, 'chromium-1033/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    ...(existsSync(base)
      ? readdirSync(base)
          .filter((d) => d.startsWith('chromium-'))
          .map((d) => join(base, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'))
      : []),
  ]
  return candidates.find((p) => existsSync(p))
})()

const PORT = 4179
const URL_ARG = process.argv[2]
const VIEWPORTS = [
  { name: '820x1180', width: 820, height: 1180 },
  { name: '1180x820', width: 1180, height: 820 },
  { name: '390x844', width: 390, height: 844 },
].filter((v) => !process.env.ONLY || process.env.ONLY.split(',').includes(v.name))
const STEP_FILTER = process.env.STEPS ? process.env.STEPS.split(',') : null
const OUT = join(ROOT, 'screenshots')

// The words of every list, so a "hij" inside a word card ("Wie is hij?") is not reported as being about Katrien.
const CONTENT = []
const DEF_TO_WORD = {}
const WORD_TO_DEF = {}
/** What to type or tap for a prompt: English prompt -> the Dutch, Dutch prompt -> the English. */
const answerForPrompt = (prompt) => {
  const t = prompt.replace(/\s+/g, ' ').trim()
  if (WORD_TO_DEF[t] !== undefined) return { label: WORD_TO_DEF[t], typed: typedForm(WORD_TO_DEF[t]) }
  if (DEF_TO_WORD[t] !== undefined) return { label: DEF_TO_WORD[t], typed: typedForm(DEF_TO_WORD[t]) }
  return null
}
for (const f of readdirSync(join(ROOT, 'src/content/toetsen')).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(ROOT, 'src/content/toetsen', f), 'utf8'))
  for (const t of Object.values(raw)) {
    for (const q of t.questions ?? []) {
      CONTENT.push(q.word, q.definition, q.hint ?? '', q.sentence ?? '')
      DEF_TO_WORD[q.definition.trim()] = q.word
      WORD_TO_DEF[q.word.trim()] = q.definition
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

// ---------- server ----------

async function reachable(url) {
  try {
    const r = await fetch(url)
    return r.ok
  } catch {
    return false
  }
}

/**
 * Without a URL: builds a snapshot of the current code (vite build, no tsc, into a temp dir)
 * and serves it with `vite preview`, so edits made during the run cannot reload the page
 * halfway. DEV=1 uses the vite dev server instead.
 */
async function ensureServer() {
  if (URL_ARG) return { url: URL_ARG, stop: () => {} }
  const url = `http://localhost:${PORT}/`
  if (await reachable(url)) {
    log(`Something already listens on ${PORT}; using it.`)
    return { url, stop: () => {} }
  }
  let args = ['vite', '--port', String(PORT), '--strictPort']
  if (!process.env.DEV) {
    const outDir = join(tmpdir(), 'rainbow-island-screenshots-dist')
    log('Building a snapshot of the current code...')
    const code = await new Promise((res) => {
      const b = spawn('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' })
      b.on('exit', res)
    })
    if (code !== 0) throw new Error('vite build failed')
    args = ['vite', 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort']
  }
  log(`Starting ${args.slice(0, 2).join(' ')} on port ${PORT}...`)
  const child = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true })
  const stop = () => {
    try {
      process.kill(-child.pid)
    } catch {
      child.kill()
    }
  }
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    if (await reachable(url)) return { url, stop }
  }
  stop()
  throw new Error('vite did not start')
}

// ---------- seed ----------

const HOUR = 3_600_000
function seedSave() {
  const now = Date.now()
  const raw = JSON.parse(readFileSync(join(ROOT, 'src/content/toetsen/engels_familie.json'), 'utf8'))
  const id = Object.keys(raw)[0]
  const words = {}
  raw[id].questions.forEach((q, i) => {
    // A spread of states so the word map shows every colour.
    if (i % 4 === 0) words[q.word] = { seen: 6, correct: 6, box: 4, typedClean: 2, dueAt: now + 48 * HOUR, lastSeen: now - 2 * HOUR, right: { recognize: 1, reverse: 1, sentence: 1, type: 2 }, dirClean: { recognize: 2, reverse: 2 } }
    else if (i % 4 === 1) words[q.word] = { seen: 3, correct: 3, box: 3, dueAt: now + 24 * HOUR, lastSeen: now - 3 * HOUR, right: { recognize: 1, reverse: 1, sentence: 1, type: 0 } }
    else if (i % 4 === 2) words[q.word] = { seen: 2, correct: 1, wrong: 1, box: 1, dueAt: now - HOUR, lastSeen: now - 5 * HOUR, last: 'wrong', right: { recognize: 1, reverse: 0, sentence: 0, type: 0 } }
  })
  return {
    schemaVersion: 1,
    activeProfile: 'wyne',
    profiles: {
      wyne: {
        naam: 'Wyne',
        words: { [id]: words },
        island: { blocks: [{ x: 0, z: 0, y: 0, type: 'gras' }, { x: 1, z: 0, y: 0, type: 'mand', rot: 1 }], seenStep: 0, lighthouses: [] },
        inventory: { gras: 7, zand: 4, steen: 3, hout: 5, water: 2, bloemen: 3, mand: 1, krabpaal: 1, voerbak: 1, lantaarn: 1, bankje: 1, boompje: 2, hek: 2, vis: 4 },
        look: { hats: [], pattern: null, cape: null },
        days: { played: 3, lastDay: null, lastAt: now - 3 * HOUR, roundsToday: 0 },
        tests: [{ at: now - 26 * HOUR, toets: id, total: 55, correct: 41, grade: 7.6, wrong: [] }],
        settings: { toets: null, sound: false, speak: false },
        stats: { rounds: 9, fed: 2, answers: 110 },
        buildTime: 200,
        extensionUsed: false,
      },
    },
  }
}

// ---------- in-page checks ----------

/** Runs in the page. Returns a list of problems for the current screen. */
function pageChecks(content) {
  const problems = []
  const se = document.scrollingElement || document.documentElement
  if (se.scrollHeight > innerHeight + 1) problems.push({ kind: 'page-scroll-y', detail: `${se.scrollHeight} > ${innerHeight}` })
  if (se.scrollWidth > innerWidth + 1) problems.push({ kind: 'page-scroll-x', detail: `${se.scrollWidth} > ${innerWidth}` })

  const visible = (e) => {
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const cs = getComputedStyle(e)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const label = (e) => {
    const cls = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''
    const text = (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 50)
    return `${e.tagName.toLowerCase()}${cls} "${text}"`
  }

  // Inner scroll areas that actually need scrolling (allowed, but worth knowing on a question card).
  for (const e of document.querySelectorAll('#screens *')) {
    const cs = getComputedStyle(e)
    if (!/(auto|scroll)/.test(cs.overflowY) || !visible(e)) continue
    if (e.scrollHeight > e.clientHeight + 2) problems.push({ kind: 'inner-scroll', detail: `${label(e).slice(0, 40)} ${e.scrollHeight} > ${e.clientHeight}` })
  }

  // Text that does not fit its box.
  const sideScrollers = new Set()
  const sel = 'button, .chip, .opt, .q-prompt, .q-who, .q-kind, h1, h2, .note, .tile, .slot, label, .grow-label, input, .wordlist span, .loot span, .hint-box, .answer, .time-badge, .toast'
  for (const e of document.querySelectorAll(sel)) {
    if (!visible(e)) continue
    const cs = getComputedStyle(e)
    if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') problems.push({ kind: 'text-clipped-x', detail: `${label(e)} ${e.scrollWidth} > ${e.clientWidth}` })
    else if (e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'INPUT') problems.push({ kind: 'text-overflows-x', detail: `${label(e)} ${e.scrollWidth} > ${e.clientWidth}` })
    if (e.scrollHeight > e.clientHeight + 2 && /(BUTTON|LABEL)/.test(e.tagName) && cs.overflowY !== 'auto') problems.push({ kind: 'text-overflows-y', detail: `${label(e)} ${e.scrollHeight} > ${e.clientHeight}` })
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) problems.push({ kind: 'ellipsis', detail: label(e) })
    const r = e.getBoundingClientRect()
    let sc = e.parentElement
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowX)) sc = sc.parentElement
    if (sc) {
      // Inside a horizontal scroller (like the build bar) it may sit off screen; report once that it scrolls.
      if (sc.scrollWidth > sc.clientWidth + 1 && !sideScrollers.has(sc)) {
        sideScrollers.add(sc)
        problems.push({ kind: 'inner-scroll', detail: `${label(sc).slice(0, 40)} scrolls sideways ${sc.scrollWidth} > ${sc.clientWidth}` })
      }
    } else if (r.right > innerWidth + 1 || r.left < -1) problems.push({ kind: 'off-screen-x', detail: `${label(e)} left ${Math.round(r.left)} right ${Math.round(r.right)}` })
  }
  // Text inside a button that sticks out of the button.
  for (const b of document.querySelectorAll('button')) {
    if (!visible(b)) continue
    const br = b.getBoundingClientRect()
    for (const c of b.querySelectorAll('*')) {
      if (!visible(c)) continue
      const r = c.getBoundingClientRect()
      if (r.right > br.right + 2 || r.left < br.left - 2 || r.bottom > br.bottom + 2) {
        problems.push({ kind: 'child-outside-button', detail: `${label(c)} in ${label(b)}` })
        break
      }
    }
  }
  // Small tap targets (the spec asks for 64 px answer buttons).
  for (const b of document.querySelectorAll('.opt')) {
    if (!visible(b)) continue
    const r = b.getBoundingClientRect()
    if (r.height < 63.5) problems.push({ kind: 'small-answer-button', detail: `${label(b)} ${Math.round(r.height)}px high` })
  }

  // Forbidden words. A "hij"/"hem" inside a word or sentence from the list is content, not about Katrien.
  const known = new Set(content.map((s) => s.trim()).filter(Boolean))
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const rx = [/nugget/i, /viggo/i, /\bhem\b/i, /\bhij\b/i, /\bzijn\b(?= (snor|staart|poot|pootjes|kop|oren|vacht|mand))/i, /\bde kat\b/i, /—/]
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent ?? ''
    const p = n.parentElement
    if (!p || !visible(p) || p.closest('script, style')) continue
    for (const r of rx) {
      const m = t.match(r)
      if (!m) continue
      const whole = (p.innerText || t).trim()
      const isContent = [...known].some((k) => k && (whole.includes(k) || k.includes(t.trim()))) && !/nugget|viggo/i.test(m[0])
      if (isContent && r !== rx[6]) continue
      problems.push({ kind: 'forbidden-text', detail: `${m[0]} in "${t.trim().slice(0, 90)}"` })
    }
  }
  return problems
}

// ---------- driving the app ----------

/** Waits until window.__app exists and the scene had a moment to draw. */
async function boot(page, url, seed) {
  // ?cat=glb forces the 3D Katrien (CAT=sprite or CAT=primitive for the others).
  const cat = process.env.CAT ?? 'glb'
  if (cat) url = `${url}${url.includes('?') ? '&' : '?'}cat=${cat}`
  await page.goto(url, { waitUntil: 'load' })
  await page.evaluate(([key, data]) => {
    localStorage.clear()
    localStorage.setItem(key, JSON.stringify(data))
  }, ['rainbow-island.v1', seed])
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 30000 })
  await sleep(2500)
}

/**
 * Makes the next round ask `word` as `type` (recognize, reverse, sentence, type), every
 * question. Also remembers each pick on window.__pick, so the bot knows the right answer.
 */
async function forceQuestion(page, word, type) {
  await page.evaluate(([word, type]) => {
    const app = window.__app
    if (!app.__origMakeEngine) app.__origMakeEngine = app.makeEngine.bind(app)
    app.makeEngine = (t) => {
      const e = app.__origMakeEngine(t)
      const next = e.next.bind(e)
      e.next = () => {
        const q = word ? e.questions.find((x) => x.word === word) : null
        const pick = q ? e.make(q, 'new', type) : next()
        window.__pick = pick
        window.__lang = e.lang
        return pick
      }
      return e
    }
  }, [word, type])
}

async function spyQuestions(page) {
  await forceQuestion(page, null, null)
}

async function goTo(page, id, payload) {
  await page.evaluate(([id, payload]) => window.__app.go(id, payload), [id, payload ?? null])
}

/**
 * Changes the saved profile. Goes to the start screen first: leaving the build screen
 * saves its own clock on dispose, which would overwrite a seeded build time.
 */
async function profile(page, fn) {
  await goTo(page, 'menu')
  await page.evaluate((src) => {
    const f = new Function('p', src)
    window.__app.store.update((p) => f(p))
  }, fn)
}

const rightLabel = (page) =>
  page.evaluate(() => {
    const p = window.__pick
    if (!p) return null
    const typed = (window.__lang === 'en' ? p.q.definition : p.q.word).split('/')[0].trim()
    return { type: p.type, label: p.options ? p.options.labels[p.options.answer] : null, word: p.q.word, typed }
  })

/**
 * Clicks an answer button (".opt") in the page itself, so a dimmed or moving button never
 * blocks the bot. wantRight true: the right answer of window.__pick; false: any other one.
 * `label` overrides the right answer (for the practice test, which has no __pick).
 */
async function clickOption(page, wantRight, label) {
  const info = label ? { label } : await rightLabel(page)
  return page.evaluate(([want, label]) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim()
    const opts = [...document.querySelectorAll('.opt')]
    const hit = opts.find((b) => (label != null && norm(b.innerText) === norm(label)) === want)
    if (!hit) return false
    hit.click()
    return true
  }, [wantRight, info?.label ?? null])
}

/** First alternative of "mum / mother". */
function typedForm(word) {
  return word.split('/')[0].trim()
}

async function typeAnswer(page, text) {
  const ok = await page.evaluate((text) => {
    const input = document.querySelector('input.type-input')
    if (!input) return false
    input.focus()
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const form = input.closest('form')
    if (form) form.requestSubmit()
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return true
  }, text)
  if (!ok) throw new Error('no input.type-input')
}

// ---------- steps ----------

// English lists ask EN -> NL only: choose the Dutch (reverse) or type the Dutch (type).
// (Dutch lists also have recognize and sentence questions; not shot here.)
const LONG = {
  choiceWord: 'swimming pool',
  choiceSentence: 'He works in a swimming pool.', // four Dutch sentences as buttons
  choiceSentenceLong: 'They are my cousins.', // "Zij zijn mijn neven/nichten."
  type: 'grandpa / grandfather', // type "opa"
  typeLong: 'wife', // "vrouw / echtgenote"
  typeWrong: 'teacher', // "leerkracht"
  almost: 'daughter', // "dochter"
}

function steps() {
  const q = (name, word, type, after) => ({
    name,
    run: async (page) => {
      await forceQuestion(page, word, type)
      await goTo(page, 'round')
      // The visitor walks in, then says its line ("Eend: ..."); slow under SwiftShader.
      await page.waitForFunction(() => /:/.test(document.querySelector('.q-who')?.textContent ?? ''), null, { timeout: 9000 }).catch(() => {})
      await sleep(600)
      if (after) await after(page)
    },
  })
  return [
    { name: 'start', run: async (page) => { await goTo(page, 'menu'); await sleep(1500) } },
    q('q-choice-word', LONG.choiceWord, 'reverse'),
    q('q-choice-sentence', LONG.choiceSentence, 'reverse'),
    q('q-choice-sentence-long', LONG.choiceSentenceLong, 'reverse'),
    q('q-choice-answered', LONG.choiceSentenceLong, 'reverse', async (page) => { await clickOption(page, true); await sleep(500) }),
    q('q-type', LONG.type, 'type'),
    q('q-type-long', LONG.typeLong, 'type'),
    q('q-type-hints', LONG.type, 'type', async (page) => {
      const hint = page.locator('.hint-row button').first()
      await hint.click()
      await sleep(200)
      await hint.click().catch(() => {})
      await sleep(300)
    }),
    q('q-type-answered', LONG.typeLong, 'type', async (page) => { await typeAnswer(page, 'vrouw'); await sleep(500) }),
    q('wrong-choice', LONG.choiceSentence, 'reverse', async (page) => { await clickOption(page, false); await sleep(900) }),
    q('wrong-choice-long', LONG.choiceSentenceLong, 'reverse', async (page) => { await clickOption(page, false); await sleep(900) }),
    q('wrong-type', LONG.typeWrong, 'type', async (page) => { await typeAnswer(page, 'juf'); await sleep(900) }),
    q('wrong-type-long', LONG.typeLong, 'type', async (page) => { await typeAnswer(page, 'moeder'); await sleep(900) }),
    q('almost-type', LONG.almost, 'type', async (page) => { await typeAnswer(page, 'dochtr'); await sleep(900) }),
    {
      name: 'round-autoplay',
      shots: false,
      run: async (page, ctx) => {
        await spyQuestions(page)
        await goTo(page, 'round')
        let answered = 0
        let lastWord = null
        const t0 = Date.now()
        while (Date.now() - t0 < 120_000) {
          const screen = await page.evaluate(() => (document.querySelector('.sheet.result') ? 'result' : document.querySelector('.opt, input.type-input') ? 'q' : 'other'))
          if (screen === 'result') break
          const info = await rightLabel(page)
          if (screen !== 'q' || !info || info.word === lastWord) {
            await sleep(250)
            continue
          }
          lastWord = info.word
          answered++
          const wrong = answered === 3 // one miss, to see the learning step in a real round
          await sleep(400)
          if (info.type === 'type') {
            await typeAnswer(page, wrong ? 'xx' : info.typed)
            if (wrong) { await sleep(500); await typeAnswer(page, info.typed) }
          } else {
            await clickOption(page, !wrong)
            if (wrong) { await sleep(500); await clickOption(page, true) }
          }
          // Two words in a row can be the same only via the force patch; the engine avoids it.
          await page.waitForFunction((w) => !window.__pick || window.__pick.q.word !== w || document.querySelector('.sheet.result'), info.word, { timeout: 15000 }).catch(() => {})
        }
        ctx.note(`autoplay answered ${answered} questions in ${Math.round((Date.now() - t0) / 1000)}s`)
        await sleep(1800) // growth bar animates
        const onResult = await page.evaluate(() => Boolean(document.querySelector('.sheet.result')))
        if (!onResult) throw new Error('autoplay did not reach the result screen')
        await ctx.shot('result')
        const grow = await page.evaluate(() => Boolean(document.querySelector('.grow-track')))
        if (!grow) ctx.problem('result', { kind: 'missing', detail: 'no growth bar (.grow-track) on the result screen' })
      },
    },
    {
      name: 'build',
      run: async (page) => {
        await profile(page, 'p.buildTime = 200; p.extensionUsed = false')
        await goTo(page, 'bouwen')
        await sleep(1500)
      },
    },
    {
      name: 'build-block-chosen',
      run: async (page) => {
        await profile(page, 'p.buildTime = 25; p.extensionUsed = false')
        await goTo(page, 'bouwen')
        await sleep(600)
        await page.locator('.slot').nth(6).click().catch(() => {})
        await sleep(1200)
      },
    },
    {
      name: 'build-time-up',
      run: async (page) => {
        await profile(page, 'p.buildTime = 0; p.extensionUsed = false')
        await goTo(page, 'bouwen')
        await sleep(1200)
      },
    },
    {
      name: 'build-time-up-extended',
      run: async (page) => {
        await profile(page, 'p.buildTime = 0; p.extensionUsed = true')
        await goTo(page, 'bouwen')
        await sleep(1200)
      },
    },
    {
      name: 'unlock-round',
      run: async (page) => {
        await forceQuestion(page, LONG.choiceSentenceLong, 'reverse')
        await goTo(page, 'round', { unlock: true })
        await sleep(3200)
      },
    },
    { name: 'proeftoets-intro', run: async (page) => { await profile(page, 'p.buildTime = 200'); await goTo(page, 'toets'); await sleep(800) } },
    {
      name: 'proeftoets-question',
      run: async (page) => {
        await goTo(page, 'toets')
        await sleep(400)
        await page.locator('.screen button.btn.primary').first().click()
        await sleep(600)
      },
    },
    {
      name: 'proeftoets-result',
      run: async (page, ctx) => {
        // Continues from the question: answer everything, a few on purpose wrong.
        let i = 0
        for (; i < 120; i++) {
          const prompt = await page.locator('.q-prompt').first().innerText({ timeout: 2000 }).catch(() => null)
          if (prompt === null) break
          const ans = answerForPrompt(prompt)
          const wrong = i % 9 === 4 || !ans
          if (!ans) ctx.note(`proeftoets: unknown prompt "${prompt}"`)
          const label = ans?.label ?? '\u0000'
          if (await page.locator('input.type-input:visible').count()) {
            await typeAnswer(page, wrong ? 'oeps' : ans.typed)
          } else if (await page.locator('.opt:visible').count()) {
            if (!(await clickOption(page, !wrong, label))) break
          } else break
          await sleep(320)
          // Choice questions may wait for a tap on the right one after a miss.
          if (wrong && (await page.locator('.opt:visible').count())) await clickOption(page, true, label)
          await sleep(wrong ? 900 : 0)
        }
        ctx.note(`proeftoets: answered ${i} questions`)
        await sleep(800)
      },
    },
    { name: 'woordenkaart', run: async (page) => { await goTo(page, 'kaart'); await sleep(800) } },
    {
      name: 'woordenkaart-detail',
      run: async (page) => {
        await goTo(page, 'kaart')
        await sleep(400)
        const tiles = page.locator('.tile')
        const n = await tiles.count()
        for (let i = 0; i < n; i++) {
          if ((await tiles.nth(i).innerText()).includes('family tree')) { await tiles.nth(i).click(); break }
        }
        await sleep(600)
      },
    },
    {
      name: 'woordenkaart-detail-sentence',
      run: async (page) => {
        await goTo(page, 'kaart')
        await sleep(400)
        const tiles = page.locator('.tile')
        const n = await tiles.count()
        for (let i = 0; i < n; i++) {
          if ((await tiles.nth(i).innerText()).includes('He works in a swimming pool.')) { await tiles.nth(i).click(); break }
        }
        await sleep(600)
      },
    },
    { name: 'aankleden', run: async (page) => { await goTo(page, 'aankleden'); await sleep(1500) } },
    { name: 'instellingen', run: async (page) => { await goTo(page, 'instellingen'); await sleep(800) } },
    {
      name: 'katrien-hats',
      shots: false,
      run: async (page, ctx) => {
        await profile(page, "p.look = { hats: ['party-hat', 'bow'], pattern: null, cape: null }")
        await goTo(page, 'menu')
        await sleep(2500)
        const kind = await page.evaluate(() => window.__app.sceneKind)
        if (process.env.CAT !== 'sprite' && kind !== 'glb') ctx.problem('katrien-hats', { kind: 'katrien', detail: `scene shows Katrien as "${kind}", expected "glb"` })
        await ctx.shot('katrien-hats')
        // A close-up around Katrien, to see whether the hats sit on her head.
        await page.evaluate(() => window.__app.scene.setZoom(3))
        await sleep(1500)
        const box = await page.evaluate(() => {
          const s = window.__app.stage.getBoundingClientRect()
          const c = window.__app.scene.catScreenPos()
          return { x: s.left + c.x, y: s.top + c.y }
        })
        const vw = page.viewportSize()
        const w = Math.min(360, vw.width)
        const h = Math.min(360, vw.height)
        const clip = { x: Math.max(0, Math.min(vw.width - w, box.x - w / 2)), y: Math.max(0, Math.min(vw.height - h, box.y - h * 0.75)), width: w, height: h }
        await ctx.shot('katrien-hats-closeup', clip)
        await page.evaluate(() => window.__app.scene.setZoom(1))
        await profile(page, 'p.look = { hats: [], pattern: null, cape: null }')
        await page.evaluate(() => window.__app.applyLook())
      },
    },
    {
      name: 'ollie-visit',
      run: async (page) => {
        await page.evaluate(() => {
          const app = window.__app
          if (!app.__origNextAnimal) app.__origNextAnimal = app.nextAnimal.bind(app)
          app.nextAnimal = () => 'olifant'
        })
        await forceQuestion(page, 'swimming pool', 'reverse')
        await goTo(page, 'round')
        await page.waitForFunction(() => /:/.test(document.querySelector('.q-who')?.textContent ?? ''), null, { timeout: 9000 }).catch(() => {})
        await sleep(800)
        await page.evaluate(() => (window.__app.nextAnimal = window.__app.__origNextAnimal))
      },
    },
    {
      name: 'start-tired',
      run: async (page) => {
        await profile(page, `p.days = { played: 4, lastDay: (${dayKeySrc})(Date.now()), lastAt: Date.now() - 60000, roundsToday: 2 }`)
        await goTo(page, 'menu')
        await sleep(1500)
      },
    },
    {
      name: 'start-asleep',
      run: async (page) => {
        await profile(page, 'p.days = { played: 4, lastDay: "2020-01-01", lastAt: Date.now() - 30 * 3600000, roundsToday: 2 }')
        await goTo(page, 'menu')
        await sleep(1500)
      },
    },
  ]
}

const dayKeySrc = 't => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") }'

// ---------- main ----------

async function main() {
  if (!CHROMIUM) throw new Error('Chromium not found under ~/Library/Caches/ms-playwright')
  const server = await ensureServer()
  log(`App: ${server.url}`)
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  })
  const report = { url: server.url, at: new Date().toISOString(), viewports: {}, failures: [], notes: [] }
  try {
    for (const vp of VIEWPORTS) {
      const dir = join(OUT, vp.name)
      mkdirSync(dir, { recursive: true })
      const vr = (report.viewports[vp.name] = {})
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 1000, locale: 'nl-NL' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 200)}`))
      log(`\n== ${vp.name}`)
      try {
        await boot(page, server.url, seedSave())
      } catch (e) {
        report.failures.push({ viewport: vp.name, step: 'boot', error: String(e) })
        log(`  boot failed: ${e}`)
        await context.close()
        continue
      }
      let nr = 0
      for (const step of steps()) {
        if (STEP_FILTER && !STEP_FILTER.some((s) => step.name.includes(s))) continue
        const ctx = {
          shot: async (name, clip) => {
            const file = `${String(++nr).padStart(2, '0')}-${name}.png`
            await page.screenshot({ path: join(dir, file), ...(clip ? { clip } : {}) })
            const problems = await page.evaluate(pageChecks, CONTENT).catch((e) => [{ kind: 'check-failed', detail: String(e) }])
            vr[file] = problems
            const shown = problems.filter((p) => p.kind !== 'inner-scroll')
            log(`  ${file}${shown.length ? `  ${shown.length} problem(s)` : ''}${problems.length > shown.length ? `  (${problems.length - shown.length} inner scroll)` : ''}`)
            for (const p of problems) log(`     - ${p.kind}: ${p.detail}`)
          },
          problem: (name, p) => {
            const key = `${String(nr).padStart(2, '0')}-${name}.png`
            ;(vr[key] ??= []).push(p)
          },
          note: (s) => {
            report.notes.push(`${vp.name}: ${s}`)
            log(`  note: ${s}`)
          },
        }
        try {
          // Leave overlays and toasts of the previous step behind.
          await page.evaluate(() => document.querySelectorAll('.overlay, .toast').forEach((e) => e.remove()))
          await step.run(page, ctx)
          if (step.shots !== false) await ctx.shot(step.name)
        } catch (e) {
          report.failures.push({ viewport: vp.name, step: step.name, error: String(e).split('\n')[0] })
          log(`  FAILED ${step.name}: ${String(e).split('\n')[0]}`)
          await page.screenshot({ path: join(dir, `${String(++nr).padStart(2, '0')}-${step.name}-FAILED.png`) }).catch(() => {})
        }
      }
      if (errors.length) report.failures.push({ viewport: vp.name, step: 'console', error: [...new Set(errors)].slice(0, 20) })
      await context.close()
    }
  } finally {
    await browser.close()
    server.stop()
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  const counts = {}
  for (const shots of Object.values(report.viewports)) {
    for (const ps of Object.values(shots)) for (const p of ps) counts[p.kind] = (counts[p.kind] ?? 0) + 1
  }
  log('\n== Summary')
  log(Object.keys(counts).length ? counts : 'no layout problems')
  if (report.failures.length) log('Failures:', JSON.stringify(report.failures, null, 2))
  log(`Report: ${join(OUT, 'report.json')}`)
  const serious = Object.entries(counts).some(([k]) => k !== 'inner-scroll') || report.failures.length > 0
  process.exitCode = serious ? 1 : 0
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
