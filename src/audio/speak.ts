/**
 * English pronunciation through SpeechSynthesis. Only English is ever spoken:
 * Dutch on screen is read by Wyne herself.
 */

let voice: SpeechSynthesisVoice | null = null
let unlocked = false

export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined'
}

function pickVoice(): void {
  if (!canSpeak()) return
  const voices = speechSynthesis.getVoices()
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-')
  voice =
    voices.find((v) => lang(v) === 'en-GB' && /female|serena|kate|martha|daniel/i.test(v.name)) ??
    voices.find((v) => lang(v) === 'en-GB') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
}

/** Call inside a tap handler once, so iOS allows speech later on. */
export function unlockSpeech(): void {
  if (unlocked || !canSpeak()) return
  unlocked = true
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  speechSynthesis.speak(u)
}

// Voices arrive asynchronously in some browsers; the first tap anywhere unlocks speech.
if (canSpeak()) {
  pickVoice()
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
  if (typeof document !== 'undefined') {
    const first = () => {
      unlockSpeech()
      document.removeEventListener('pointerdown', first, true)
      document.removeEventListener('keydown', first, true)
    }
    document.addEventListener('pointerdown', first, true)
    document.addEventListener('keydown', first, true)
  }
}

/** Makes the text nicer to hear: "mum / mother" is read as "mum, mother", "…" and gaps are dropped. */
export function speakable(text: string): string {
  return text
    .replace(/_{2,}/g, ', ')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/…|\.\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function voiceInfo(): string {
  if (!canSpeak()) return 'Deze browser kan niet voorlezen.'
  const en = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')).length
  return voice ? `Stem: ${voice.name} (${voice.lang}), ${en} Engelse stemmen` : `Geen Engelse stem gevonden (${en})`
}

/** Strong references: WebKit can garbage-collect an utterance mid-sentence and cut it off. */
const alive = new Set<SpeechSynthesisUtterance>()

/**
 * Speaks English. Resolves when done (or after a safety timeout), so callers can
 * wait for a whole sentence. Pass English only.
 */
export function speak(text: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve()
  const words = speakable(text)
  if (words === '') return Promise.resolve()
  if (!voice) pickVoice()
  // iOS sometimes drops an utterance spoken right after cancel(), so only cancel when needed.
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  if (speechSynthesis.paused) speechSynthesis.resume()
  return new Promise((resolve) => {
    let finished = false
    const end = () => {
      if (finished) return
      finished = true
      resolve()
    }
    const say = (withVoice: boolean) => {
      const u = new SpeechSynthesisUtterance(words)
      u.lang = voice?.lang ?? 'en-GB'
      if (withVoice && voice) u.voice = voice
      u.rate = 0.85
      alive.add(u)
      u.onend = () => {
        alive.delete(u)
        end()
      }
      u.onerror = (e) => {
        alive.delete(u)
        // A chosen voice that is not installed fails on some iPads: try once more with only the language.
        const err = (e as SpeechSynthesisErrorEvent).error
        if (withVoice && err !== 'interrupted' && err !== 'canceled') say(false)
        else end()
      }
      speechSynthesis.speak(u)
    }
    say(true)
    // Some browsers never fire onend; never wait forever.
    setTimeout(end, 1500 + words.length * 110)
  })
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel()
}
