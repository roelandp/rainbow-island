import { Audio } from './audio/audio'
import { speak, stopSpeaking } from './audio/speak'
import { itemInfo, type ItemId } from './content/blocks'
import { activeToets, TOETSEN, type Toets } from './content'
import { ANIMAL_IDS, type AnimalId } from './scene/animals'
import { IslandScene, type BlockType } from './scene/scene'
import { WordEngine } from './engine/engine'
import { statusOf } from './engine/words'
import { islandSize, sizeForStep } from './game/island'
import { turnTop } from './game/build'
import { unlimited } from './game/buildtime'
import { Store } from './storage/store'
import { CatDresser, POSE_SPRITE } from './scene/dressup'
import { sanitiseLook, type LookProgress } from './content/looks'
import { clear, el } from './ui/dom'

export type ScreenId = 'menu' | 'round' | 'result' | 'toets' | 'kaart' | 'instellingen' | 'bouwen' | 'aankleden'

export interface Screen {
  root: HTMLElement
  dispose?: () => void
}

export type ScreenFactory = (app: App, payload?: unknown) => Screen

/** The scene API the screens use. A no-op stand-in keeps the game playable without WebGL. */
export type SceneApi = Pick<
  IslandScene,
  | 'setIslandSize'
  | 'setBlocks'
  | 'setProps'
  | 'setInsets'
  | 'rotate'
  | 'setZoom'
  | 'getZoom'
  | 'setMood'
  | 'catPose'
  | 'catJump'
  | 'catSurprised'
  | 'catWalkTo'
  | 'catPosition'
  | 'animalArrives'
  | 'animalState'
  | 'animalLeaves'
  | 'burst'
  | 'catScreenPos'
  | 'pick'
  | 'tiles'
  | 'pause'
  | 'resume'
>

function nullScene(): SceneApi {
  return new Proxy({} as SceneApi, {
    get(_t, key) {
      if (key === 'catScreenPos') return () => ({ x: window.innerWidth / 2, y: window.innerHeight / 3 })
      if (key === 'catPosition') return () => ({ x: 0, z: 0 })
      if (key === 'pick') return () => null
      if (key === 'getZoom') return () => 1
      if (key === 'tiles') return () => ({ w: 4, d: 4, minX: -2, minZ: -2 })
      return () => Promise.resolve()
    },
  })
}

/** Holds everything long-lived: storage, sound, the island scene, and the current screen. */
export class App {
  readonly store = new Store()
  readonly audio: Audio
  readonly base: string
  readonly scene: SceneApi
  readonly sceneKind: string
  readonly root: HTMLElement
  readonly stage: HTMLElement
  /** Composes Katrien with her outfit, for the scene and the dress-up screen. */
  readonly dresser: CatDresser

  private screens = new Map<ScreenId, ScreenFactory>()
  private current: Screen | null = null
  private host: HTMLElement
  private lastAnimal: AnimalId | null = null
  private currentId: ScreenId | null = null
  private held = false
  /** The word the last round ended on, so the next round does not open with it. */
  lastWord: string | null = null
  /** Katrien was sent somewhere by Wyne: no wandering off on her own until then. */
  catHoldUntil = 0
  /** Set when a new version is waiting; applied on the start screen, never mid-round. */
  private pendingUpdate: (() => void) | null = null

  constructor(mount: HTMLElement) {
    this.base = new URL('./', location.href).href
    this.audio = new Audio(this.base)
    this.audio.effects = this.store.profile.settings.sound
    this.root = mount
    this.stage = el('div', { id: 'stage' })
    this.host = el('div', { id: 'screens' })
    mount.append(this.stage, this.host)

    let scene: SceneApi
    let kind = 'geen 3D'
    try {
      const real = new IslandScene(this.stage, { base: this.base, models: __MODELS__ })
      scene = real
      kind = 'laden'
      // The avatar loads asynchronously; read the kind once it settled.
      void real.ready.then(() => {
        ;(this as { sceneKind: string }).sceneKind = real.catKind
        this.applyLook()
      })
    } catch (err) {
      console.warn('Geen WebGL, het spel draait zonder eiland', err)
      scene = nullScene()
    }
    this.scene = scene
    this.sceneKind = kind
    this.dresser = new CatDresser(this.base)
    this.dresser.subscribe(() => this.pushLook())
    this.applyLook()
    this.syncIsland(false)

    // iOS needs a real gesture before any sound.
    const gestures = ['pointerdown', 'touchend', 'click', 'keydown'] as const
    const kick = () => {
      this.audio.unlock()
      if (!this.audio.ready) return
      for (const type of gestures) document.removeEventListener(type, kick)
    }
    for (const type of gestures) document.addEventListener(type, kick)

    this.listenForSwipes()

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.scene.pause()
      else if (!this.held) this.scene.resume()
    })
  }

  /**
   * On every screen, also during a round: a horizontal swipe over the island
   * turns it a quarter, two fingers pinch to zoom in and out (within limits),
   * and a trackpad pinch or mouse wheel zooms too.
   */
  private listenForSwipes(): void {
    const active = new Map<number, { x: number; y: number; t: number }>()
    const now = new Map<number, { x: number; y: number }>()
    let multi = false
    let pinchStart = 0
    let zoomStart = 1
    const spread = () => {
      const [a, b] = [...now.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    this.stage.addEventListener('pointerdown', (e) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
      now.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (active.size > 1) {
        multi = true
        pinchStart = spread()
        zoomStart = this.scene.getZoom()
      }
    })
    window.addEventListener('pointermove', (e) => {
      if (!now.has(e.pointerId)) return
      now.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (now.size === 2 && pinchStart > 0) this.scene.setZoom(zoomStart * (spread() / pinchStart))
    })
    this.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        // Trackpad pinch arrives as a wheel event with ctrlKey and small deltas.
        const k = e.ctrlKey ? 0.012 : 0.0015
        this.scene.setZoom(this.scene.getZoom() * Math.exp(-e.deltaY * k))
      },
      { passive: false },
    )
    const end = (e: PointerEvent) => {
      now.delete(e.pointerId)
      if (now.size < 2) pinchStart = 0
      const start = active.get(e.pointerId)
      active.delete(e.pointerId)
      const wasMulti = multi
      if (active.size === 0) multi = false
      if (!start || wasMulti || e.type === 'pointercancel') return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - start.t < 800) {
        this.audio.play('tap')
        this.scene.rotate(dx > 0 ? -1 : 1)
      }
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  register(id: ScreenId, factory: ScreenFactory): void {
    this.screens.set(id, factory)
  }

  go(id: ScreenId, payload?: unknown): void {
    const factory = this.screens.get(id)
    if (!factory) return
    stopSpeaking()
    this.current?.dispose?.()
    clear(this.host)
    this.current = factory(this, payload)
    this.currentId = id
    this.host.appendChild(this.current.root)
    if (id === 'menu') this.applyUpdate()
  }

  /** Full-screen panels stop the 3D scene to save battery. */
  holdScene(on: boolean): void {
    this.held = on
    if (on) this.scene.pause()
    else this.scene.resume()
  }

  /** A new version is ready: reload now when on the start screen, else when it is next shown. */
  updateReady(apply: () => void): void {
    this.pendingUpdate = apply
    if (this.currentId === 'menu') this.applyUpdate()
  }

  private applyUpdate(): void {
    const apply = this.pendingUpdate
    if (!apply) return
    this.pendingUpdate = null
    const note = el('div.update-note.bubble', { text: 'Nieuwe versie, even opnieuw laden' })
    document.body.appendChild(note)
    window.setTimeout(apply, 700)
  }

  // ---------- words ----------

  get toets(): Toets {
    return activeToets(this.store.profile.settings.toets)
  }

  makeEngine(toets = this.toets): WordEngine {
    return new WordEngine({ toets, states: this.store.profile.words[toets.id] })
  }

  saveEngine(engine: WordEngine): void {
    this.store.update((p) => {
      p.words[engine.toets.id] = engine.snapshot()
    })
  }

  /** Learned words over every test, for the island size. */
  learnedTotal(): number {
    let n = 0
    for (const t of TOETSEN) {
      const words = this.store.profile.words[t.id] ?? {}
      for (const q of t.questions) if (words[q.word] && statusOf(words[q.word]) === 'geleerd') n++
    }
    return n
  }

  /** Every word of the active test learned: building has no time limit any more. */
  buildUnlimited(): boolean {
    return unlimited(this.learnedIn(), this.toets.questions.length)
  }

  /** Words over every test that are almost learned (the 'bijna' status). */
  almostTotal(): number {
    let n = 0
    for (const t of TOETSEN) {
      const words = this.store.profile.words[t.id] ?? {}
      for (const q of t.questions) if (words[q.word] && statusOf(words[q.word]) === 'bijna') n++
    }
    return n
  }

  learnedIn(toets = this.toets): number {
    const words = this.store.profile.words[toets.id] ?? {}
    return toets.questions.filter((q) => words[q.word] && statusOf(words[q.word]) === 'geleerd').length
  }

  // ---------- island ----------

  /**
   * Pushes island size and placed items to the scene. The island only ever
   * grows: a learned word that slips back does not take land away. Growth is
   * shown (risen from the water) the first time a screen asks for it.
   * Returns true when it grew just now.
   */
  syncIsland(animate: boolean): boolean {
    const current = islandSize(this.learnedTotal()).step
    const seen = this.store.profile.island.seenStep
    const grew = animate && current > seen
    const size = sizeForStep(grew ? current : seen)
    void this.scene.setIslandSize(size.w, size.d, grew)
    if (grew) {
      this.store.update((pp) => {
        pp.island.seenStep = current
      })
    }
    this.pushPlaced()
    return grew
  }

  pushPlaced(): void {
    const placed = this.store.profile.island.blocks
    const blocks = placed.filter((b) => itemInfo(b.type)?.kind === 'block').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type as BlockType }))
    const props = placed.filter((b) => itemInfo(b.type)?.kind === 'furniture').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type, rot: b.rot ?? 0 }))
    this.scene.setBlocks(blocks)
    this.scene.setProps(props)
  }

  // ---------- dressing up ----------

  get is3d(): boolean {
    return this.sceneKind === 'glb' || this.sceneKind === 'primitive'
  }

  lookProgress(): LookProgress {
    const p = this.store.profile
    return { learned: this.learnedTotal(), rounds: p.stats.rounds, days: p.days.played, fed: p.stats.fed }
  }

  /** Applies the stored outfit (minus anything not unlocked) to the scene. */
  applyLook(): void {
    let look = sanitiseLook(this.store.profile.look, this.lookProgress())
    // The 3D Katrien wears hats only; capes and fur patterns are painted on the picture version.
    if (this.is3d) look = { ...look, cape: null, pattern: null }
    this.dresser.setLook(look)
    this.pushLook()
  }

  private pushLook(): void {
    if (this.sceneKind === 'glb' || this.sceneKind === 'primitive') {
      ;(this.scene as unknown as { setCatAccessories?: (c: HTMLCanvasElement | null) => void }).setCatAccessories?.(this.dresser.accessoryCanvas())
      return
    }
    const set = (this.scene as unknown as { setCatImage?: (pose: string, c: HTMLCanvasElement | null, inset?: { x: number; y: number; w: number; h: number }) => void }).setCatImage
    if (!set) return
    for (const [pose, sprite] of Object.entries(POSE_SPRITE)) {
      if (this.dresser.isPlain) {
        set.call(this.scene, pose, null)
        continue
      }
      const d = this.dresser.dressed(sprite)
      if (d) set.call(this.scene, pose, d.canvas, d.inset)
    }
  }

  /** Turns the furniture on top of a tile a quarter. Returns false when there is none. */
  turnFurnitureAt(x: number, z: number): boolean {
    const turned = turnTop(this.store.profile.island.blocks, x, z)
    if (!turned) return false
    this.store.update((p) => {
      p.island.blocks = turned
    })
    this.audio.play('place')
    this.pushPlaced()
    return true
  }

  nextAnimal(): AnimalId {
    const options = ANIMAL_IDS.filter((a) => a !== this.lastAnimal)
    const pick = options[Math.floor(Math.random() * options.length)]
    this.lastAnimal = pick
    return pick
  }

  // ---------- small shared effects ----------

  say(text: string): void {
    if (!this.store.profile.settings.speak) return
    speak(text)
  }

  /** Reward icons fly from Katrien to a target element. */
  flyRewards(items: ItemId[], target: HTMLElement | null): Promise<void> {
    if (items.length === 0) return Promise.resolve()
    const stageRect = this.stage.getBoundingClientRect()
    const from = this.scene.catScreenPos()
    const sx = stageRect.left + from.x
    const sy = stageRect.top + from.y
    const t = target?.getBoundingClientRect()
    const tx = t ? t.left + t.width / 2 : window.innerWidth - 40
    const ty = t ? t.top + t.height / 2 : 40
    const flights = items.map(
      (id, i) =>
        new Promise<void>((resolve) => {
          const icon = el('div.flyer', { text: itemInfo(id)?.icon ?? '⭐' })
          icon.style.left = `${sx - 18}px`
          icon.style.top = `${sy - 18}px`
          document.body.appendChild(icon)
          const dx = tx - sx
          const dy = ty - sy
          const lift = -60 - Math.random() * 50
          const spread = (i - (items.length - 1) / 2) * 34
          const anim = icon.animate(
            [
              { transform: 'translate(0,0) scale(0.4)', opacity: 0 },
              { transform: `translate(${spread}px, ${lift}px) scale(1.15)`, opacity: 1, offset: 0.35 },
              { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
            ],
            { duration: 900 + i * 90, delay: i * 110, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' },
          )
          anim.onfinish = () => {
            icon.remove()
            target?.classList.remove('bump')
            void target?.offsetWidth
            target?.classList.add('bump')
            resolve()
          }
        }),
    )
    return Promise.all(flights).then(() => undefined)
  }

  toast(text: string, parent: HTMLElement = this.host): void {
    const t = el('div.toast.bubble', { text })
    parent.appendChild(t)
    window.setTimeout(() => t.remove(), 2700)
  }
}
