import * as THREE from 'three'
import * as Animals from './animals'
import { ANIMAL_TRAVEL, animateAnimal, buildAnimal, buildBoat, type AnimalId, type AnimalState } from './animals'
import { loadCat, type CatAvatar, type CatKind, type CatPose, type ImageInset } from './cat'
import { BlockLayer, type PlacedBlock } from './blocks'
import { PropLayer, PROP_HEIGHT, type PlacedProp } from './props'
import { Island } from './island'
import { Water, WATER_Y } from './water'
import { Effects, type BurstKind } from './effects'
import { Clouds, skyGradient } from './sky'
import { loadOptionalGlb, normalizeModel } from './glb'
import { Animator, damp, easeInCubic, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from './tween'


/** Pinch zoom limits: never so far out the island is a dot, never so close it falls apart. */
export const ZOOM_MIN = 0.75
export const ZOOM_MAX = 2.2
export type { CatPose, CatKind, ImageInset } from './cat'
export type { BlockType, PlacedBlock } from './blocks'
export type { PlacedProp } from './props'
export type { AnimalId } from './animals'
export type Mood = 'day' | 'sunset'
export interface SceneOptions {
  /** URL prefix ending in '/', e.g. new URL('./', location.href).href */
  base: string
  /**
   * Optional: names of the GLBs that exist in `${base}models/` (e.g. ['katrien', 'eend']).
   * When given, only those are fetched, so missing models cause no 404s in the console.
   * When omitted, every model is probed once (a 404 just means: use the fallback).
   */
  models?: string[]
}

/**
 * The island scene.
 *
 * Coordinates (1 unit = 1 tile):
 * - Tile (x, z) occupies world [x, x+1] x [z, z+1]; its centre is (x + 0.5, z + 0.5).
 * - Footprint: x in [-floor(w/2) .. ceil(w/2) - 1], same for z. Even sizes are centred on
 *   the origin, odd sizes are off by half a tile (existing tiles never move when growing).
 * - Ground top y = 0, water surface y = -0.3. Block layer k occupies y in [k, k+1].
 * - Default camera looks from +X+Z (azimuth 45 deg): screen right = +X-Z, towards the
 *   viewer = +X+Z.
 * - Katrien's home tile: (floor(cx) - 1, floor(cz) - 1), cx/cz = island centre, i.e. the
 *   back-middle of the island. The visitor spot is the island edge tile in the direction
 *   (of the 4 axis directions) closest to "screen right + towards the viewer" from the cat,
 *   in the same row/column as the cat. With the default camera that is (maxX, catZ).
 */

const ELEVATION = Math.atan(1 / Math.SQRT2) // 35.26 deg
const AZ0 = Math.PI / 4
const CAM_DIST = 40
const SINK: Partial<Record<AnimalId, number>> = { eend: 0.1, schildpad: 0.14, kikker: 0.12 }

type AnimateBoatFn = (boat: THREE.Group, t: number, rowing?: boolean) => void
const animateBoat = (Animals as unknown as Record<string, unknown>).animateBoat as AnimateBoatFn | undefined

interface Actor {
  id: AnimalId
  root: THREE.Group
  model: THREE.Object3D
  glb: boolean
  state: AnimalState
  alive: boolean
  spot: THREE.Vector3
  dir: THREE.Vector3
  travel: 'swim' | 'boat' | 'fly' | 'hop'
  boat: THREE.Group | null
  hop: number
}

export class IslandScene {
  readonly ready: Promise<void>
  private readonly host: HTMLElement
  private readonly base: string
  private readonly models: Set<string> | null
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 140)
  private readonly hemi: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private readonly water = new Water()
  private readonly island = new Island()
  private readonly blocks = new BlockLayer()
  private readonly props = new PropLayer()
  private readonly effects = new Effects()
  private readonly clouds = new Clouds()
  private readonly anim = new Animator()
  private readonly resizeObs: ResizeObserver
  private readonly onVisibility = () => this.syncLoop()

  private t = 0
  private raf = 0
  private lastTs = -1
  private paused = false
  private disposed = false
  private width = 1
  private height = 1
  private insetTop = 0
  private insetBottom = 0
  private zoom = 1
  private zoomCur = 1
  private rotIndex = 0
  private az = AZ0
  private frame = { s: 0.01, vx: 0, vy: 0, valid: false }
  private skyKey = ''
  private mood = 0
  private moodTarget = 0

  // cat
  private cat: CatAvatar | null = null
  private readonly catRoot = new THREE.Group()
  private readonly catSquash = new THREE.Group()
  private readonly blob: THREE.Mesh
  private readonly bang: THREE.Sprite
  private catTile = { x: -1, z: -1 }
  private catPos = new THREE.Vector3(-0.5, 0, -0.5)
  private catBaseY = 0
  private catHop = 0
  private catMoving = false
  private catSeq = 0
  private walkSeq = 0
  private pendingPose: CatPose = 'idle'
  private bangT = -1

  // animal
  private actor: Actor | null = null

  // scratch
  private readonly v1 = new THREE.Vector3()
  private readonly v2 = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()
  private readonly target = new THREE.Vector3()

  constructor(host: HTMLElement, opts: SceneOptions) {
    this.host = host
    this.base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const cv = this.renderer.domElement
    Object.assign(cv.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      touchAction: 'none',
    })
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.appendChild(cv)

    // lights
    this.hemi = new THREE.HemisphereLight('#e9e0ff', '#b9e3a4', 1.8)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff3e2', 2.1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.02
    this.sun.shadow.radius = 3
    this.scene.add(this.sun, this.sun.target)

    this.scene.add(this.water.mesh, this.island.group, this.blocks.group, this.props.group, this.effects.group, this.clouds.mesh)

    // cat rig: root (position) > squash (scale/lean around the feet) > avatar
    this.catRoot.name = 'cat-root'
    this.catRoot.add(this.catSquash)
    this.scene.add(this.catRoot)
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false, toneMapped: false }),
    )
    this.blob.renderOrder = 1
    this.blob.visible = false
    this.scene.add(this.blob)
    this.bang = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeBangTexture(), transparent: true, depthTest: false, toneMapped: false }),
    )
    this.bang.renderOrder = 20
    this.bang.visible = false
    this.scene.add(this.bang)

    this.island.onSplash = (x, z) => {
      this.effects.splashRing(x, WATER_Y + 0.02, z, 0.9, 0.7)
    }
    this.island.setSize(4, 4, false)
    this.placeCatHome()
    this.updateIslandBounds()
    this.applyMood()

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(host)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()

    this.models = opts.models ? new Set(opts.models) : null
    this.ready = loadCat(this.base, this.hasModel('katrien')).then((cat) => {
      if (this.disposed) {
        cat.dispose()
        return
      }
      this.cat = cat
      cat.setView(this.camera)
      cat.setPose(this.pendingPose)
      cat.face(1, 0)
      this.catSquash.add(cat.object)
      this.blob.visible = cat.kind === 'sprite'
      this.applyMood()
    })
    this.syncLoop()
  }

  // -------------------------------------------------------------------------
  // public API
  // -------------------------------------------------------------------------

  /** Which Katrien is in use ('primitive' until loading finished; await `ready`). */
  get catKind(): CatKind {
    return this.cat?.kind ?? 'primitive'
  }

  setIslandSize(w: number, d: number, animate = false): Promise<void> {
    const before = this.waterBounds()
    const p = this.island.setSize(w, d, animate)
    if (!this.island.contains(this.catTile.x, this.catTile.z)) this.placeCatHome()
    this.updateIslandBounds()
    if (animate) {
      // let the foam ring follow the rising land instead of jumping out at once
      const after = this.waterBounds()
      const n = Math.max(1, w * d - (before[2] - 0.42) * (before[3] - 0.42) * 4)
      const dur = 0.05 + n * 0.04 + 0.45
      this.anim.run(dur, (k) => {
        const e = easeInOutSine(k)
        this.water.setIsland(
          lerp(before[0], after[0], e),
          lerp(before[1], after[1], e),
          lerp(before[2], after[2], e),
          lerp(before[3], after[3], e),
        )
      })
    }
    this.refreshOccupancy()
    return p
  }

  setBlocks(blocks: PlacedBlock[]): void {
    this.blocks.set(
      blocks.filter((b) => this.island.contains(b.x, b.z)),
      this.t,
    )
    this.refreshOccupancy()
  }

  setProps(props: PlacedProp[]): void {
    this.props.set(props, this.t)
    this.refreshOccupancy()
    // Something was put down where Katrien stands: he hops aside.
    if (this.cat && this.blockedTile(this.catTile.x, this.catTile.z)) void this.catWalkTo(this.catTile.x, this.catTile.z)
  }

  /** Tiles Katrien and visitors do not stand on: furniture (except his basket) and ponds. */
  private blockedTile(x: number, z: number): boolean {
    let blocked = false
    this.props.forEach((p) => {
      if (p.x === x && p.z === z && p.type !== 'mand') blocked = true
    })
    if (blocked) return true
    const h = this.blocks.heightAt(x, z)
    return h - Math.floor(h) > 0.5
  }

  private inIsland(x: number, z: number): boolean {
    const i = this.island
    return x >= i.minX && x < i.minX + i.w && z >= i.minZ && z < i.minZ + i.d
  }

  /** The free tile closest to (x, z), or (x, z) itself when every tile is taken. */
  private nearestFree(x: number, z: number): { x: number; z: number } {
    if (!this.blockedTile(x, z)) return { x, z }
    let best: { x: number; z: number } | null = null
    let bestD = Infinity
    const i = this.island
    for (let tx = i.minX; tx < i.minX + i.w; tx++) {
      for (let tz = i.minZ; tz < i.minZ + i.d; tz++) {
        if (this.blockedTile(tx, tz)) continue
        const d = Math.hypot(tx - x, tz - z) + Math.hypot(tx - this.catTile.x, tz - this.catTile.z) * 0.01
        if (d < bestD) {
          bestD = d
          best = { x: tx, z: tz }
        }
      }
    }
    return best ?? { x, z }
  }

  /** Shortest 4-way path around furniture and ponds; a straight line when there is none. */
  private findPath(x0: number, z0: number, x1: number, z1: number): { x: number; z: number }[] {
    const key = (x: number, z: number) => `${x},${z}`
    const prev = new Map<string, string | null>([[key(x0, z0), null]])
    const queue: [number, number][] = [[x0, z0]]
    while (queue.length) {
      const [x, z] = queue.shift()!
      if (x === x1 && z === z1) {
        const out: { x: number; z: number }[] = []
        let k: string | null = key(x, z)
        while (k && k !== key(x0, z0)) {
          const [px, pz] = k.split(',').map(Number)
          out.unshift({ x: px, z: pz })
          k = prev.get(k) ?? null
        }
        return out
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const nz = z + dz
        const k = key(nx, nz)
        if (prev.has(k) || !this.inIsland(nx, nz)) continue
        if (this.blockedTile(nx, nz) && !(nx === x1 && nz === z1)) continue
        prev.set(k, key(x, z))
        queue.push([nx, nz])
      }
    }
    return tilePath(x0, z0, x1, z1)
  }

  setInsets(top: number, bottom: number): void {
    this.insetTop = Math.max(0, top)
    this.insetBottom = Math.max(0, bottom)
  }

  rotate(dir: 1 | -1): void {
    this.rotIndex += dir
    const from = this.az
    const to = AZ0 + (this.rotIndex * Math.PI) / 2
    this.anim.run(0.45, (k) => {
      this.az = lerp(from, to, easeInOutCubic(k))
    })
  }

  setZoom(z: number): void {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
  }
  getZoom(): number {
    return this.zoom
  }

  setMood(m: Mood): void {
    this.moodTarget = m === 'sunset' ? 1 : 0
  }

  catPose(p: CatPose): void {
    this.catSeq++
    this.pendingPose = p
    this.cat?.setPose(p)
    this.catHop = 0
    this.catSquash.scale.set(1, 1, 1)
    this.catSquash.rotation.set(0, 0, 0)
    this.catSquash.position.set(0, 0, 0)
  }

  catJump(): void {
    const seq = ++this.catSeq
    const alive = () => seq === this.catSeq && !this.disposed
    const sq = this.catSquash.scale
    void (async () => {
      this.setPoseRaw('idle')
      await this.anim.run(0.1, (k) => sq.set(1 + 0.12 * k, 1 - 0.2 * k, 1 + 0.12 * k), alive)
      if (!alive()) return
      this.setPoseRaw('jump')
      await this.anim.run(
        0.46,
        (k) => {
          this.catHop = 0.45 * 4 * k * (1 - k)
          const st = k < 0.5 ? 1.14 - 0.28 * k : 1 + 0.1 * (k - 0.5)
          sq.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st))
        },
        alive,
      )
      if (!alive()) return
      this.catHop = 0
      this.setPoseRaw('happy')
      await this.anim.run(
        0.18,
        (k) => {
          const e = 1 - 0.2 * (1 - easeOutBack(k, 2.5))
          sq.set(1 + (1 - e) * 0.6, e, 1 + (1 - e) * 0.6)
        },
        alive,
      )
      if (!alive()) return
      sq.set(1, 1, 1)
      await this.anim.wait(1.0, alive)
      if (!alive()) return
      this.setPoseRaw('idle')
    })()
  }

  catSurprised(): void {
    const seq = ++this.catSeq
    const alive = () => seq === this.catSeq && !this.disposed
    this.setPoseRaw('surprised')
    this.bangT = this.t
    const awayX = -this.camScreenSide()
    void (async () => {
      await this.anim.run(
        0.32,
        (k) => {
          this.catHop = 0.14 * 4 * k * (1 - k)
          const lean = 0.17 * Math.min(1, k * 3)
          this.setLean(lean * awayX, 0.06 * awayX * Math.sin(k * Math.PI))
          const st = 1 + 0.08 * Math.sin(k * Math.PI)
          this.catSquash.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st))
        },
        alive,
      )
      if (!alive()) return
      this.catHop = 0
      await this.anim.run(
        0.45,
        (k) => {
          const shake = 0.06 * Math.sin(k * 26) * (1 - k)
          this.setLean((0.17 - 0.07 * k) * awayX + shake, 0.06 * awayX)
          this.catSquash.scale.set(1, 1, 1)
        },
        alive,
      )
    })()
  }

  /** Walks Katrien to a tile centre, hopping up/down block heights. */
  async catWalkTo(x: number, z: number): Promise<void> {
    await this.ready
    const seq = ++this.walkSeq
    const alive = () => seq === this.walkSeq && !this.disposed
    const minX = this.island.minX
    const minZ = this.island.minZ
    x = Math.max(minX, Math.min(minX + this.island.w - 1, Math.round(x)))
    z = Math.max(minZ, Math.min(minZ + this.island.d - 1, Math.round(z)))
    // Never stand inside a tree, a bench or a pond: stop on the nearest free tile.
    const free = this.nearestFree(x, z)
    x = free.x
    z = free.z
    const path = this.findPath(this.catTile.x, this.catTile.z, x, z)
    if (!path.length) return
    this.catMoving = true
    this.cat?.setWalking(true)
    try {
      for (const step of path) {
        if (!alive()) return
        const fromX = this.catPos.x
        const fromZ = this.catPos.z
        const toX = step.x + 0.5
        const toZ = step.z + 0.5
        this.cat?.face(toX - fromX, toZ - fromZ)
        const h0 = this.catBaseY
        const h1 = this.surfaceAt(step.x, step.z)
        const climb = Math.abs(h1 - h0) > 0.05
        const dur = climb ? 0.42 : 0.3
        const apex = Math.max(h0, h1) + 0.32
        await this.anim.run(
          dur,
          (k) => {
            const e = climb ? easeInOutSine(k) : k
            this.catPos.x = lerp(fromX, toX, e)
            this.catPos.z = lerp(fromZ, toZ, e)
            if (climb) {
              // parabola through h0 -> apex -> h1
              const y = quadArc(h0, apex, h1, k)
              this.catBaseY = y
              this.catHop = 0
              const st = 1 + 0.12 * Math.sin(k * Math.PI)
              this.catSquash.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st))
            } else {
              this.catBaseY = lerp(h0, h1, k)
              this.catHop = 0.07 * Math.abs(Math.sin(k * Math.PI))
              const sq = 1 - 0.06 * Math.pow(Math.cos(k * Math.PI), 8)
              this.catSquash.scale.set(1 + (1 - sq), sq, 1 + (1 - sq))
            }
          },
          alive,
        )
        if (!alive()) return
        this.catTile = { x: step.x, z: step.z }
        this.catBaseY = h1
      }
    } finally {
      if (seq === this.walkSeq) {
        this.catMoving = false
        this.catHop = 0
        this.catSquash.scale.set(1, 1, 1)
        this.cat?.setWalking(false)
        // Arrived: turn back to the viewer (three-quarter view), so he never stays with his back to Wyne.
        if (alive()) this.cat?.face(-this.fwd.x + this.right.x * 0.45, -this.fwd.z + this.right.z * 0.45)
      }
    }
  }

  catPosition(): { x: number; z: number } {
    return { x: this.catTile.x, z: this.catTile.z }
  }

  /** Dress-up for 3D avatars: hats as a picture on the head. */
  setCatAccessories(canvas: HTMLCanvasElement | null): void {
    this.cat?.setAccessories?.(canvas)
  }

  /** Dress-up: replace the sprite art of one pose (sprite avatar only; no-op otherwise). */
  setCatImage(pose: CatPose, source: HTMLCanvasElement | null, inset?: ImageInset): void {
    this.cat?.setImage?.(pose, source, inset)
  }

  async animalArrives(id: AnimalId): Promise<void> {
    if (this.actor) this.removeActor(this.actor)
    const gltf = this.hasModel(id) ? await loadOptionalGlb(`${this.base}models/${id}.glb`) : null
    if (this.disposed) return
    if (this.actor) this.removeActor(this.actor)

    const model = gltf ? normalizeModel(gltf.scene, 0.7) : buildAnimal(id)
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    const root = new THREE.Group()
    root.name = `animal-${id}`
    root.add(model)
    const { spot, dir } = this.visitorSpot()
    const actor: Actor = {
      id,
      root,
      model,
      glb: !!gltf,
      state: 'idle',
      alive: true,
      spot,
      dir,
      travel: ANIMAL_TRAVEL[id] ?? 'swim',
      boat: null,
      hop: 0,
    }
    this.actor = actor
    const alive = () => actor.alive && !this.disposed
    const faceToward = (dx: number, dz: number) => {
      root.rotation.y = Math.atan2(dx, dz)
    }
    const shore = spot.clone().addScaledVector(dir, 1.25)
    shore.y = WATER_Y - (SINK[id] ?? 0.1)
    const far = spot.clone().addScaledVector(dir, 8)
    far.y = shore.y

    switch (actor.travel) {
      case 'swim': {
        this.scene.add(root)
        actor.state = 'swim'
        faceToward(-dir.x, -dir.z)
        await this.anim.run(
          1.8,
          (k) => {
            const e = easeOutCubic(k)
            root.position.lerpVectors(far, shore, e)
            root.position.y = shore.y + 0.03 * Math.sin(this.t * 3)
            root.position.addScaledVector(this.v1.set(-dir.z, 0, dir.x), 0.25 * Math.sin(k * Math.PI * 2) * (1 - k))
          },
          alive,
        )
        if (!alive()) return
        this.burstAt('splash', root.position.clone().setY(WATER_Y + 0.02))
        await this.hopActor(actor, spot, 0.45, 0.45)
        break
      }
      case 'boat': {
        const boat = buildBoat()
        boat.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true
        })
        actor.boat = boat
        const seat = (boat.userData.seat as THREE.Object3D | undefined) ?? boat
        seat.add(root)
        root.position.set(0, 0, 0)
        root.rotation.set(0, 0, 0)
        this.scene.add(boat)
        const bShore = spot.clone().addScaledVector(dir, 1.55)
        bShore.y = WATER_Y - 0.06
        const bFar = spot.clone().addScaledVector(dir, 8.5)
        bFar.y = bShore.y
        boat.rotation.y = Math.atan2(-dir.x, -dir.z)
        actor.state = 'idle'
        await this.anim.run(
          2.0,
          (k) => {
            boat.position.lerpVectors(bFar, bShore, easeOutCubic(k))
            boat.position.y = bShore.y + 0.025 * Math.sin(this.t * 2.6)
            boat.rotation.z = 0.04 * Math.sin(this.t * 2.1)
            animateBoat?.(boat, this.t, k < 0.92)
          },
          alive,
        )
        if (!alive()) return
        this.scene.attach(root)
        await this.hopActor(actor, spot, 0.45, 0.4)
        break
      }
      case 'fly': {
        this.scene.add(root)
        actor.state = 'fly'
        const start = spot.clone().addScaledVector(dir, 7.5)
        start.y = 3.6
        const ctrl = spot.clone().addScaledVector(dir, 2.6)
        ctrl.y = 2.6
        const end = spot.clone()
        await this.anim.run(
          2.3,
          (k) => {
            const e = easeInOutSine(k)
            bezier(start, ctrl, end, e, root.position)
            bezierTangent(start, ctrl, end, e, this.v1)
            faceToward(this.v1.x, this.v1.z)
            root.rotation.x = 0
            if (k > 0.86) actor.state = 'idle'
          },
          alive,
        )
        if (!alive()) return
        root.position.copy(end)
        break
      }
      case 'hop': {
        this.scene.add(root)
        faceToward(-dir.x, -dir.z)
        const hops = 5
        let from = far.clone()
        from.y = WATER_Y - 0.05
        root.position.copy(from)
        for (let i = 0; i < hops; i++) {
          const to = far.clone().lerp(shore, (i + 1) / hops)
          to.y = from.y
          await this.hopActor(actor, to, 0.36, 0.4)
          if (!alive()) return
          this.effects.splashRing(to.x, WATER_Y + 0.02, to.z, 0.55, 0.6)
          from = to
        }
        await this.hopActor(actor, spot, 0.45, 0.42)
        break
      }
    }
    if (!alive()) return
    actor.state = 'idle'
    this.faceActorHome(actor)
    this.cat?.face(spot.x - this.catPos.x, spot.z - this.catPos.z)
  }

  animalState(s: 'idle' | 'talk' | 'happy'): void {
    if (this.actor) this.actor.state = s
  }

  async animalLeaves(): Promise<void> {
    const actor = this.actor
    if (!actor) return
    const alive = () => actor.alive && !this.disposed
    const root = actor.root
    actor.state = 'happy'
    await this.hopActor(actor, root.position.clone(), 0.3, 0.32)
    if (!alive()) return
    const { dir, spot } = actor
    const shore = spot.clone().addScaledVector(dir, 1.25)
    shore.y = WATER_Y - (SINK[actor.id] ?? 0.1)
    const far = spot.clone().addScaledVector(dir, 8)
    far.y = shore.y
    switch (actor.travel) {
      case 'swim': {
        root.rotation.y = Math.atan2(dir.x, dir.z)
        await this.hopActor(actor, shore, 0.4, 0.42)
        if (!alive()) return
        this.burstAt('splash', shore.clone().setY(WATER_Y + 0.02))
        actor.state = 'swim'
        await this.anim.run(
          1.7,
          (k) => {
            root.position.lerpVectors(shore, far, easeInCubic(k))
            root.position.y = shore.y + 0.03 * Math.sin(this.t * 3)
            root.scale.setScalar(k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1)
          },
          alive,
        )
        break
      }
      case 'boat': {
        const boat = actor.boat
        if (!boat) break
        const seat = (boat.userData.seat as THREE.Object3D | undefined) ?? boat
        seat.updateMatrixWorld()
        const seatPos = seat.getWorldPosition(new THREE.Vector3())
        await this.hopActor(actor, seatPos, 0.4, 0.4)
        if (!alive()) return
        seat.attach(root)
        root.position.set(0, 0, 0)
        root.rotation.set(0, 0, 0)
        actor.state = 'idle'
        const r0 = boat.rotation.y
        const start = boat.position.clone()
        const bFar = spot.clone().addScaledVector(dir, 8.5)
        bFar.y = start.y
        await this.anim.run(
          0.5,
          (k) => {
            boat.rotation.y = r0 + Math.PI * easeInOutCubic(k)
            animateBoat?.(boat, this.t, true)
          },
          alive,
        )
        if (!alive()) return
        await this.anim.run(
          1.9,
          (k) => {
            boat.position.lerpVectors(start, bFar, easeInCubic(k))
            boat.position.y = start.y + 0.025 * Math.sin(this.t * 2.6)
            boat.scale.setScalar(k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1)
            animateBoat?.(boat, this.t, true)
          },
          alive,
        )
        break
      }
      case 'fly': {
        actor.state = 'fly'
        const start = root.position.clone()
        const ctrl = spot.clone().addScaledVector(dir, 2.4)
        ctrl.y = 2.4
        const end = spot.clone().addScaledVector(dir, 7.5)
        end.y = 4
        await this.anim.run(
          2.0,
          (k) => {
            const e = easeInCubic(k)
            bezier(start, ctrl, end, e, root.position)
            bezierTangent(start, ctrl, end, Math.max(0.02, e), this.v1)
            root.rotation.y = Math.atan2(this.v1.x, this.v1.z)
            root.scale.setScalar(k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1)
          },
          alive,
        )
        break
      }
      case 'hop': {
        root.rotation.y = Math.atan2(dir.x, dir.z)
        let from = shore.clone()
        from.y = WATER_Y - 0.05
        await this.hopActor(actor, from, 0.4, 0.4)
        for (let i = 0; i < 5 && alive(); i++) {
          const to = shore.clone().lerp(far, (i + 1) / 5)
          to.y = from.y
          this.effects.splashRing(from.x, WATER_Y + 0.02, from.z, 0.55, 0.6)
          await this.hopActor(actor, to, 0.36, 0.38)
          if (i >= 3) root.scale.setScalar(Math.max(0.01, 1 - (i - 2) * 0.45))
          from = to
        }
        break
      }
    }
    if (this.actor === actor) this.removeActor(actor)
  }

  burst(kind: BurstKind, at: 'cat' | 'animal'): void {
    const p = new THREE.Vector3()
    if (at === 'animal' && this.actor) {
      this.actor.root.getWorldPosition(p)
      p.y += kind === 'splash' ? 0.05 : 0.55
    } else {
      p.copy(this.catRoot.position)
      p.y += kind === 'splash' ? 0.05 : (this.cat?.height ?? 1) * 0.7
    }
    this.burstAt(kind, p)
  }

  catScreenPos(): { x: number; y: number } {
    this.catRoot.updateMatrixWorld()
    this.v1.copy(this.catRoot.position)
    this.v1.y += (this.cat?.height ?? 1) * 0.82
    this.camera.updateMatrixWorld()
    this.v1.project(this.camera)
    return { x: ((this.v1.x + 1) / 2) * this.width, y: ((1 - this.v1.y) / 2) * this.height }
  }

  pick(clientX: number, clientY: number): { x: number; z: number; topY: number } | null {
    const rect = this.host.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    this.camera.updateMatrixWorld()
    ray.setFromCamera(ndc, this.camera)
    const box = new THREE.Box3()
    let best: { x: number; z: number; topY: number } | null = null
    let bestD = Infinity
    const { minX, minZ, w, d } = this.island
    for (let x = minX; x < minX + w; x++) {
      for (let z = minZ; z < minZ + d; z++) {
        const top = this.blocks.heightAt(x, z)
        box.min.set(x, WATER_Y, z)
        box.max.set(x + 1, top, z + 1)
        const hit = ray.ray.intersectBox(box, this.v1)
        if (!hit) continue
        const dist = hit.distanceToSquared(ray.ray.origin)
        if (dist < bestD) {
          bestD = dist
          best = { x, z, topY: top }
        }
      }
    }
    return best
  }

  tiles(): { w: number; d: number; minX: number; minZ: number } {
    return { w: this.island.w, d: this.island.d, minX: this.island.minX, minZ: this.island.minZ }
  }

  pause(): void {
    this.paused = true
    this.syncLoop()
  }
  resume(): void {
    this.paused = false
    this.syncLoop()
  }

  /** Renderer stats for debugging (draw calls, triangles). */
  stats(): { calls: number; triangles: number } {
    const r = this.renderer.info.render
    return { calls: r.calls, triangles: r.triangles }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.anim.clear()
    if (this.actor) this.removeActor(this.actor)
    this.cat?.dispose()
    this.water.dispose()
    this.island.dispose()
    this.blocks.dispose()
    this.props.dispose()
    this.effects.dispose()
    this.clouds.dispose()
    this.blob.geometry.dispose()
    ;(this.blob.material as THREE.MeshBasicMaterial).map?.dispose()
    ;(this.blob.material as THREE.Material).dispose()
    this.bang.material.map?.dispose()
    this.bang.material.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.host.style.background = ''
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private hasModel(name: string): boolean {
    return !this.models || this.models.has(name)
  }

  private setPoseRaw(p: CatPose): void {
    this.pendingPose = p
    this.cat?.setPose(p)
  }

  /** +1 when the cat faces screen-right (towards the visitor), else -1. */
  private camScreenSide(): number {
    const a = this.actor
    if (!a) return 1
    this.v2.subVectors(a.spot, this.catRoot.position)
    return this.v2.x * Math.cos(this.az) - this.v2.z * Math.sin(this.az) >= 0 ? 1 : -1
  }

  /** Lean in screen space: roll about the view axis, plus a small offset. */
  private setLean(roll: number, shift: number): void {
    // view axis on the ground = horizontal forward; rolling around it tilts left/right on screen
    const fx = -Math.sin(this.az)
    const fz = -Math.cos(this.az)
    this.catSquash.quaternion.setFromAxisAngle(this.v2.set(fx, 0, fz), roll)
    this.catSquash.position.set(Math.cos(this.az) * -shift, 0, -Math.sin(this.az) * -shift)
  }

  private placeCatHome(): void {
    const cx = this.island.centerX
    const cz = this.island.centerZ
    const x = Math.max(this.island.minX, Math.floor(cx) - 1)
    const z = Math.max(this.island.minZ, Math.floor(cz) - 1)
    this.catTile = { x, z }
    this.catPos.set(x + 0.5, 0, z + 0.5)
    this.catBaseY = this.surfaceAt(x, z)
  }

  private surfaceAt(x: number, z: number): number {
    return this.blocks.heightAt(x, z) + this.island.tileOffset(x, z)
  }

  private visitorSpot(): { spot: THREE.Vector3; dir: THREE.Vector3 } {
    const az = AZ0 + (this.rotIndex * Math.PI) / 2
    // screen right + towards viewer, on the ground
    const sx = Math.cos(az) + Math.sin(az)
    const sz = -Math.sin(az) + Math.cos(az)
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]
    let best = dirs[0]
    let bestS = -Infinity
    for (const d of dirs) {
      const s = d[0] * sx + d[1] * sz
      if (s > bestS) {
        bestS = s
        best = d
      }
    }
    const { minX, minZ, w, d } = this.island
    const maxX = minX + w - 1
    const maxZ = minZ + d - 1
    let tx = this.catTile.x
    let tz = this.catTile.z
    if (best[0] === 1) tx = maxX
    if (best[0] === -1) tx = minX
    if (best[1] === 1) tz = maxZ
    if (best[1] === -1) tz = minZ
    if (tx === this.catTile.x && tz === this.catTile.z) {
      // cat already stands on that edge: move one tile sideways along the edge
      if (best[0] !== 0) tz = tz + 1 <= maxZ ? tz + 1 : tz - 1
      else tx = tx + 1 <= maxX ? tx + 1 : tx - 1
    }
    // Not inside a tree or bench: slide along the edge to the nearest free tile.
    if (this.blockedTile(tx, tz)) {
      const alongX = best[0] === 0
      for (let step = 1; step < Math.max(w, d); step++) {
        let found = false
        for (const s of [step, -step]) {
          const nx = alongX ? tx + s : tx
          const nz = alongX ? tz : tz + s
          if (this.inIsland(nx, nz) && !this.blockedTile(nx, nz) && !(nx === this.catTile.x && nz === this.catTile.z)) {
            tx = nx
            tz = nz
            found = true
            break
          }
        }
        if (found) break
      }
    }
    const spot = new THREE.Vector3(tx + 0.5, this.surfaceAt(tx, tz), tz + 0.5)
    return { spot, dir: new THREE.Vector3(best[0], 0, best[1]) }
  }

  private faceActorHome(actor: Actor): void {
    // between looking at the cat and looking at the camera
    const toCat = this.v1.subVectors(this.catRoot.position, actor.spot).setY(0).normalize()
    const toCam = this.v2.set(Math.sin(this.az), 0, Math.cos(this.az))
    toCat.multiplyScalar(1).addScaledVector(toCam, 0.9)
    actor.root.rotation.set(0, Math.atan2(toCat.x, toCat.z), 0)
  }

  /** Parabolic hop of an actor's root from where it is to `to`. */
  private hopActor(actor: Actor, to: THREE.Vector3, height: number, dur: number): Promise<void> {
    const root = actor.root
    const from = root.position.clone()
    const apex = Math.max(from.y, to.y) + height
    const dx = to.x - from.x
    const dz = to.z - from.z
    if (Math.abs(dx) + Math.abs(dz) > 0.05) root.rotation.y = Math.atan2(dx, dz)
    const prev = actor.state
    if (actor.state !== 'happy') actor.state = 'walk'
    return this.anim
      .run(
        dur,
        (k) => {
          root.position.x = lerp(from.x, to.x, k)
          root.position.z = lerp(from.z, to.z, k)
          root.position.y = quadArc(from.y, apex, to.y, k)
          const st = 1 + 0.12 * Math.sin(k * Math.PI)
          root.scale.set(root.scale.x, root.scale.x * st, root.scale.x)
        },
        () => actor.alive && !this.disposed,
      )
      .then(() => {
        root.scale.y = root.scale.x
        if (actor.state === 'walk') actor.state = prev === 'swim' || prev === 'fly' ? 'idle' : prev
      })
  }

  private removeActor(actor: Actor): void {
    actor.alive = false
    actor.root.removeFromParent()
    actor.boat?.removeFromParent()
    disposeTree(actor.root)
    if (actor.boat) disposeTree(actor.boat)
    if (this.actor === actor) this.actor = null
  }

  private burstAt(kind: BurstKind, p: THREE.Vector3): void {
    this.right.set(Math.cos(this.az), 0, -Math.sin(this.az))
    this.effects.burst(kind, p, this.right)
  }

  private refreshOccupancy(): void {
    const keys: string[] = []
    this.blocks.forEachColumn((x, z) => keys.push(`${x},${z}`))
    this.props.forEach((p) => keys.push(`${p.x},${p.z}`))
    keys.push(`${this.catTile.x},${this.catTile.z}`)
    this.island.setOccupied(keys)
  }

  private waterBounds(): [number, number, number, number] {
    const isl = this.island
    return [isl.centerX, isl.centerZ, isl.w / 2 + 0.42, isl.d / 2 + 0.42]
  }

  private updateIslandBounds(): void {
    const { w, d } = this.island
    const cx = this.island.centerX
    const cz = this.island.centerZ
    this.water.setIsland(...this.waterBounds())
    this.target.set(cx, 0, cz)
    const r = Math.max(w, d) / 2 + 3
    const cam = this.sun.shadow.camera
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.5
    cam.far = 40
    cam.updateProjectionMatrix()
  }

  private applyMood(): void {
    const k = easeInOutSine(this.mood)
    const c = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), k)
    this.hemi.color.copy(c('#e9e0ff', '#f9e2f0'))
    this.hemi.groundColor.copy(c('#b9e3a4', '#c8bfe0'))
    this.hemi.intensity = lerp(1.8, 1.95, k)
    this.sun.color.copy(c('#fff3e2', '#ffd0ab'))
    this.sun.intensity = lerp(2.1, 1.9, k)
    const day = new THREE.Vector3(-0.38, 1.0, 0.62).normalize()
    const dusk = new THREE.Vector3(-0.85, 0.5, 0.35).normalize()
    const dir = day.lerp(dusk, k).normalize()
    this.sun.position.copy(this.target).addScaledVector(dir, 14)
    this.sun.target.position.copy(this.target)
    this.water.setMood(k)
    this.props.setGlow(k)
    this.clouds.setMood(k)
    this.cat?.setTint(c('#ffffff', '#ffd9c4'))
    this.skyKey = ''
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    if (w === this.width && h === this.height && this.frame.valid) return
    this.width = w
    this.height = h
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(w, h, false)
    this.frame.valid = false
    this.skyKey = ''
    if (!this.raf) this.renderFrame(0)
  }

  private syncLoop(): void {
    const run = !this.paused && !this.disposed && document.visibilityState !== 'hidden'
    if (run && !this.raf) {
      this.lastTs = -1
      this.raf = requestAnimationFrame(this.tick)
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private readonly tick = (ts: number): void => {
    this.raf = 0
    if (this.paused || this.disposed || document.visibilityState === 'hidden') return
    const dt = this.lastTs < 0 ? 1 / 60 : Math.min(0.05, (ts - this.lastTs) / 1000)
    this.lastTs = ts
    this.renderFrame(dt)
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Advances the scene by dt seconds and renders. */
  private renderFrame(dt: number): void {
    this.t += dt
    const t = this.t
    this.anim.update(dt)

    if (this.mood !== this.moodTarget) {
      const step = dt / 2
      this.mood = this.mood < this.moodTarget ? Math.min(this.moodTarget, this.mood + step) : Math.max(this.moodTarget, this.mood - step)
      this.applyMood()
    }

    this.island.update(t)
    this.blocks.update(t)
    this.props.update(t)
    this.water.update(t)
    this.updateCamera(dt)
    this.updateCat(dt, t)
    this.updateActor(dt, t)
    this.effects.update(dt, t)
    this.renderer.render(this.scene, this.camera)
  }

  private updateCat(dt: number, t: number): void {
    if (!this.catMoving) {
      const target = this.surfaceAt(this.catTile.x, this.catTile.z)
      this.catBaseY = lerp(this.catBaseY, target, damp(dt, 0.06))
    }
    this.catRoot.position.set(this.catPos.x, this.catBaseY + this.catHop, this.catPos.z)
    this.cat?.update(dt, t)
    const ground = this.catMoving ? this.catBaseY : this.surfaceAt(this.catTile.x, this.catTile.z)
    const lift = Math.max(0, this.catRoot.position.y - ground)
    const bs = 0.62 * (1 - Math.min(0.5, lift * 0.8))
    this.blob.position.set(this.catPos.x, ground + 0.015, this.catPos.z)
    this.blob.scale.set(bs, 1, bs * 0.8)
    ;(this.blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - Math.min(0.6, lift))

    // "!" above the head after a surprise
    if (this.bangT >= 0) {
      const k = (t - this.bangT) / 1.3
      if (k >= 1) {
        this.bangT = -1
        this.bang.visible = false
      } else {
        this.bang.visible = true
        const pop = k < 0.15 ? easeOutBack(k / 0.15, 3) : 1
        const h = (this.cat?.height ?? 1) + 0.18 + 0.12 * k
        this.bang.position.set(this.catPos.x, this.catRoot.position.y + h, this.catPos.z)
        this.bang.scale.set(0.28 * pop, 0.42 * pop, 1)
        this.bang.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
        this.bang.material.rotation = 0.15 * Math.sin(t * 12) * (1 - k)
      }
    }
  }

  private updateActor(dt: number, t: number): void {
    const a = this.actor
    if (!a) return
    if (a.glb) animateWhole(a.model, a.state, t)
    else animateAnimal(a.model as THREE.Group, a.state, t, dt)
    if (a.boat && a.boat.parent && a.root.parent !== a.boat && a.root.parent?.parent !== a.boat) {
      // boat waiting at the shore
      a.boat.position.y = WATER_Y - 0.06 + 0.025 * Math.sin(t * 2.6)
      a.boat.rotation.z = 0.04 * Math.sin(t * 2.1)
      animateBoat?.(a.boat, t, false)
    }
  }

  private updateCamera(dt: number): void {
    const az = this.az
    const el = ELEVATION
    const camDir = this.v1.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    this.right.set(Math.cos(az), 0, -Math.sin(az))
    this.fwd.set(-Math.sin(az), 0, -Math.cos(az))
    // screen up = (fwd * sin(el)) + (Y * cos(el))
    this.up.copy(this.fwd).multiplyScalar(Math.sin(el)).setY(Math.cos(el))

    const T = this.target
    this.camera.position.copy(T).addScaledVector(camDir, CAM_DIST)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(T)

    // --- framing: bounding box of interesting points in view coordinates
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const addPt = (x: number, y: number, z: number) => {
      const dx = x - T.x
      const dy = y - T.y
      const dz = z - T.z
      const vx = dx * this.right.x + dz * this.right.z
      const vy = dx * this.up.x + dy * this.up.y + dz * this.up.z
      if (vx < minX) minX = vx
      if (vx > maxX) maxX = vx
      if (vy < minY) minY = vy
      if (vy > maxY) maxY = vy
    }
    const isl = this.island
    const r = 0.45
    for (const x of [isl.minX - r, isl.minX + isl.w + r]) {
      for (const z of [isl.minZ - r, isl.minZ + isl.d + r]) {
        addPt(x, WATER_Y - 0.05, z)
        addPt(x, 0.1, z)
      }
    }
    const catH = (this.cat?.height ?? 1.1) + 0.1
    addPt(this.catPos.x, this.catBaseY + catH, this.catPos.z)
    const spot = this.actor?.spot ?? this.visitorSpot().spot
    addPt(spot.x, spot.y + 0.95, spot.z)
    this.blocks.forEachColumn((x, z, top) => {
      addPt(x + 0.5, top + 0.05, z + 0.5)
    })
    this.props.forEach((p) => addPt(p.x + 0.5, p.y + (PROP_HEIGHT[p.type] ?? 0.6), p.z + 0.5))

    const W = this.width
    const H = this.height
    const top = Math.min(this.insetTop, H * 0.6)
    const bottom = Math.min(this.insetBottom, H - top - 40)
    const Hv = Math.max(40, H - top - bottom)
    const margin = Math.max(10, Math.min(44, Math.min(W, Hv) * 0.05))
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    this.zoomCur = lerp(this.zoomCur, this.zoom, this.frame.valid ? damp(dt, 0.1) : 1)
    const s = Math.max(spanX / Math.max(20, W - 2 * margin), spanY / Math.max(20, Hv - 2 * margin)) / this.zoomCur
    const vx = (minX + maxX) / 2
    // with vertical room to spare, sit the island a bit lower so a band of sky shows on top
    const slackPx = Hv - 2 * margin - spanY / (s * this.zoomCur)
    const vy = (minY + maxY) / 2 + (slackPx > 0 ? slackPx * 0.22 * s : 0)
    const f = this.frame
    const k = f.valid ? damp(dt, 0.09) : 1
    f.s = lerp(f.s, s, k)
    f.vx = lerp(f.vx, vx, k)
    f.vy = lerp(f.vy, vy, k)
    f.valid = true

    const cam = this.camera
    cam.left = f.vx - (W / 2) * f.s
    cam.right = f.vx + (W / 2) * f.s
    cam.top = f.vy + (top + Hv / 2) * f.s
    cam.bottom = cam.top - H * f.s
    cam.updateProjectionMatrix()

    // --- horizon: where the water fades into the CSS sky
    const sinE = Math.sin(el)
    const horizonViewY = cam.top - (top + Hv * 0.22) * f.s
    const hx = isl.w / 2 + 0.6
    const hz = isl.d / 2 + 0.6
    const islandFar = Math.abs(this.fwd.x) * hx + Math.abs(this.fwd.z) * hz
    const fadeEnd = Math.max(islandFar + 2.3, horizonViewY / sinE)
    const fadeStart = fadeEnd - 2.0
    this.water.setView(this.fwd.x, this.fwd.z, fadeStart, fadeEnd)
    const realHorizonY = fadeEnd * sinE
    const horizonPx = (cam.top - realHorizonY) / f.s
    const pct = (horizonPx / H) * 100
    const key = `${pct.toFixed(0)}|${this.mood.toFixed(2)}`
    if (key !== this.skyKey) {
      this.skyKey = key
      this.host.style.background = skyGradient(easeInOutSine(this.mood), pct)
    }
    this.clouds.update(dt, T, this.right, this.fwd, el, fadeEnd + 3, cam.left, cam.right, realHorizonY + 0.3, cam.top - top * f.s, f.s)
    this.effects.setScale((1 / f.s) * this.renderer.getPixelRatio())
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function quadArc(y0: number, apex: number, y1: number, k: number): number {
  // smooth parabola-like arc through y0 (k=0), apex (around the middle), y1 (k=1)
  const base = lerp(y0, y1, k)
  const lift = apex - Math.max(y0, y1) + Math.abs(y1 - y0) / 2
  return base + 4 * lift * k * (1 - k)
}

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - k
  return out.set(
    u * u * a.x + 2 * u * k * b.x + k * k * c.x,
    u * u * a.y + 2 * u * k * b.y + k * k * c.y,
    u * u * a.z + 2 * u * k * b.z + k * k * c.z,
  )
}

function bezierTangent(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - k
  return out.set(
    2 * u * (b.x - a.x) + 2 * k * (c.x - b.x),
    2 * u * (b.y - a.y) + 2 * k * (c.y - b.y),
    2 * u * (b.z - a.z) + 2 * k * (c.z - b.z),
  )
}

/** 4-connected path, alternating axes so it looks roughly diagonal. */
function tilePath(x0: number, z0: number, x1: number, z1: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  let x = x0
  let z = z0
  let guard = 0
  while ((x !== x1 || z !== z1) && guard++ < 200) {
    const dx = x1 - x
    const dz = z1 - z
    if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) x += Math.sign(dx)
    else z += Math.sign(dz)
    out.push({ x, z })
  }
  return out
}

/** Whole-model animation for GLB animals (no known rig). */
function animateWhole(model: THREE.Object3D, state: AnimalState, t: number): void {
  const inner = model.children[0] ?? model
  inner.position.set(0, 0, 0)
  inner.rotation.set(0, 0, 0)
  inner.scale.set(1, 1, 1)
  switch (state) {
    case 'idle':
      inner.scale.y = 1 + 0.025 * Math.sin(t * 2.4)
      break
    case 'talk':
      inner.position.y = 0.03 * Math.abs(Math.sin(t * 6))
      inner.rotation.z = 0.05 * Math.sin(t * 3)
      break
    case 'happy':
      inner.position.y = 0.12 * Math.abs(Math.sin(t * 6))
      inner.rotation.y = 0.2 * Math.sin(t * 6)
      break
    case 'swim':
      inner.rotation.z = 0.08 * Math.sin(t * 2.5)
      break
    case 'fly':
      inner.position.y = 0.05 * Math.sin(t * 9)
      inner.rotation.z = 0.12 * Math.sin(t * 4.5)
      break
    case 'walk':
      inner.rotation.z = 0.1 * Math.sin(t * 10)
      break
  }
}

function disposeTree(obj: THREE.Object3D): void {
  // animals.ts caches shared geometries; disposing only frees GPU memory, three re-uploads
  // them automatically if they are used again.
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}

function makeBlobTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(70,60,110,0.55)')
  grd.addColorStop(0.55, 'rgba(70,60,110,0.3)')
  grd.addColorStop(1, 'rgba(70,60,110,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBangTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 96
  const g = cv.getContext('2d')!
  g.font = '900 84px system-ui, -apple-system, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 10
  g.lineJoin = 'round'
  g.strokeStyle = '#ffffff'
  g.strokeText('!', 32, 50)
  g.fillStyle = '#ff8a5c'
  g.fillText('!', 32, 50)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

