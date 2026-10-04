/**
 * Reads short lines aloud with the device's own Dutch voice. Without a Dutch
 * voice it stays silent: an English voice reading Dutch helps nobody.
 */
let voice: SpeechSynthesisVoice | null | undefined

function dutchVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice
  if (typeof speechSynthesis === 'undefined') return null
  const all = speechSynthesis.getVoices()
  const nl = all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('nl'))
  voice = nl.find((v) => /nl-nl/i.test(v.lang.replace('_', '-'))) ?? nl[0] ?? null
  return voice
}

export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined'
}

// Voices arrive asynchronously in some browsers.
if (canSpeak()) {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = undefined
    dutchVoice()
  })
}

export function speak(text: string): void {
  if (!canSpeak()) return
  const v = dutchVoice()
  if (!v) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/ x /g, ' keer ').replace(/ : /g, ' gedeeld door '))
  u.voice = v
  u.lang = v.lang
  u.rate = 0.95
  u.pitch = 1.15
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel()
}
