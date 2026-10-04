type Voice = 'right' | 'wrong' | 'reward' | 'streak' | 'roundEnd' | 'tap' | 'grow' | 'place' | 'remove' | 'start' | 'purr' | 'meow'

const EFFECT_GAIN = 0.5

/** Recordings that are used when present; the synth fills in otherwise. */
const SAMPLES: Record<string, string> = {
  correct: 'sounds/game-correct.mp3',
  victory: 'sounds/game-victory.mp3',
  start: 'sounds/game-gamestart.mp3',
  purr: 'sounds/purr.mp3',
  'meow-1': 'sounds/meow-1.mp3',
  'meow-2': 'sounds/meow-2.mp3',
}

/**
 * WebAudio synth plus a few real recordings. Everything is short and friendly:
 * the wrong-answer cue is a soft questioning "hm?", never a buzzer.
 */
export class Audio {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private samples = new Map<string, AudioBuffer>()
  private loading = new Set<string>()
  private lastMeow = 0
  private base: string

  effects = true

  constructor(base: string) {
    this.base = base
  }

  get ready(): boolean {
    return this.ctx?.state === 'running'
  }

  /** Must run inside a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    // "playback" makes sound come out with the iOS silent switch flipped.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') {
      try {
        session.type = 'playback'
      } catch {
        // Not settable here; the rest still works when unmuted.
      }
    }
    if (this.ctx) {
      // iOS reports 'interrupted' after a call, Siri or a locked screen.
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.bus = this.ctx.createGain()
    this.bus.gain.value = EFFECT_GAIN
    this.bus.connect(this.ctx.destination)
    for (const name of Object.keys(SAMPLES)) void this.load(name)
  }

  private async load(name: string): Promise<void> {
    if (!this.ctx || this.samples.has(name) || this.loading.has(name)) return
    this.loading.add(name)
    try {
      const res = await fetch(`${this.base}${SAMPLES[name]}`)
      if (!res.ok) return
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer())
      this.samples.set(name, buf)
    } catch {
      // Missing or undecodable: the synth covers it.
    } finally {
      this.loading.delete(name)
    }
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', bend = 0): void {
    if (!this.ctx || !this.bus) return
    const t = this.ctx.currentTime + start
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + bend), t + dur)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(env).connect(this.bus)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private shot(name: string, gain = 0.7): boolean {
    const buf = this.samples.get(name)
    if (!buf || !this.ctx || !this.bus) return false
    const src = this.ctx.createBufferSource()
    const env = this.ctx.createGain()
    env.gain.value = gain
    src.buffer = buf
    src.connect(env).connect(this.bus)
    src.start()
    return true
  }

  play(voice: Voice, n = 0): void {
    if (!this.effects) return
    this.unlock()
    if (!this.ctx) return
    switch (voice) {
      case 'right':
        if (!this.shot('correct', 0.55)) {
          this.tone(660, 0, 0.14, 0.18, 'triangle')
          this.tone(990, 0.09, 0.22, 0.16, 'sine')
        }
        break
      case 'wrong':
        // A soft two-note question, rising at the end. No buzzer, no sting.
        this.tone(300, 0, 0.13, 0.13, 'sine')
        this.tone(380, 0.12, 0.2, 0.13, 'sine', 40)
        break
      case 'reward':
        for (let i = 0; i < 4; i++) this.tone(900 + i * 240, i * 0.05, 0.2, 0.08, 'sine')
        break
      case 'streak': {
        const steps = Math.min(n, 8)
        for (let i = 0; i < 3; i++) this.tone(660 * Math.pow(2, (steps + i * 3) / 12), i * 0.07, 0.16, 0.14, 'sine')
        if (n >= 5) this.shot('purr', 0.35)
        break
      }
      case 'roundEnd':
        if (!this.shot('victory', 0.5)) {
          ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.3, 0.16, 'triangle'))
        }
        break
      case 'grow':
        ;[392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.35, 0.12, 'triangle'))
        break
      case 'place':
        this.tone(220, 0, 0.09, 0.2, 'triangle', 80)
        this.tone(520, 0.02, 0.05, 0.06, 'sine')
        break
      case 'remove':
        this.tone(480, 0, 0.1, 0.12, 'triangle', -200)
        break
      case 'start':
        if (!this.shot('start', 0.4)) this.tone(523, 0, 0.2, 0.14, 'triangle')
        break
      case 'tap':
        this.tone(520, 0, 0.04, 0.07, 'sine')
        break
      case 'purr':
        if (!this.shot('purr', 0.7)) this.tone(90, 0, 0.6, 0.1, 'sawtooth')
        break
      case 'meow': {
        this.lastMeow = this.lastMeow === 1 ? 2 : 1
        if (!this.shot(`meow-${this.lastMeow}`, 0.75)) {
          this.tone(440, 0, 0.22, 0.14, 'triangle', 120)
          this.tone(560, 0.18, 0.3, 0.12, 'sine', -80)
        }
        break
      }
    }
  }
}
