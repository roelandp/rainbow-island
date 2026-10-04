import * as THREE from 'three'
import { loadOptionalGlb, normalizeModel } from './glb'
import { damp } from './tween'

/**
 * Katrien behind one interface. Three implementations, picked at runtime:
 *   1. `${base}models/katrien.glb` (a scan, animated as a whole in code)
 *   2. billboard sprites `${base}sprites/*.webp`
 *   3. a chunky kitten built from primitives
 * Debug: `?cat=primitive` or `?cat=sprite` (or `?cat=glb`) forces a path.
 *
 * The avatar object stands with its feet at y = 0 on its own origin. The scene owns the
 * root transform (position, hops, squash and stretch); the avatar does pose visuals,
 * idle motion and turning to face a direction.
 */

export type CatPose = 'idle' | 'happy' | 'jump' | 'sleep' | 'surprised'
export type CatKind = 'glb' | 'sprite' | 'primitive'

export interface CatAvatar {
  readonly object: THREE.Object3D
  readonly kind: CatKind
  setPose(p: CatPose): void
  update(dt: number, t: number): void
  /** Height of the head top above the feet (world units, current pose). */
  readonly height: number
  dispose(): void
  /** Camera used for billboarding and deciding left/right flips. */
  setView(camera: THREE.Camera): void
  /** Turn to face a horizontal world direction. */
  face(dx: number, dz: number): void
  setWalking(on: boolean): void
  /** Colour multiplier (sunset warmth) for unlit avatars. */
  setTint(c: THREE.Color): void
  /** Sprite avatar only: replace one pose's art with a composed canvas (dress-up). */
  setImage?(pose: CatPose, source: HTMLCanvasElement | null, inset?: ImageInset): void
  /** 3D avatars: hats and accessories as a camera-facing picture on the head (see ACCESSORY_* in dressup). */
  setAccessories?(canvas: HTMLCanvasElement | null): void
}

/**
 * Accessory canvas layout, shared with dressup.ts: the canvas is ASPECT times as tall as it
 * is wide, the head top sits at (0.5, ANCHOR_Y) of it and the head is HEAD_W of its width.
 */
export const ACCESSORY_ASPECT = 1.25
export const ACCESSORY_ANCHOR_Y = 0.48
export const ACCESSORY_HEAD_W = 0.5
const _acc = new THREE.Vector3()

export async function loadCat(base: string, tryGlb = true): Promise<CatAvatar> {
  let force = ''
  try {
    force = new URLSearchParams(location.search).get('cat') || ''
  } catch {
    /* no location (tests) */
  }
  if (force === 'glb' || (tryGlb && force !== 'primitive' && force !== 'sprite')) {
    const gltf = await loadOptionalGlb(`${base}models/katrien.glb`)
    if (gltf) return new GlbCat(gltf.scene, gltf.animations)
  }
  if (force !== 'primitive') {
    try {
      return await SpriteCat.load(base)
    } catch (err) {
      console.warn('[scene] cat sprites unavailable, using primitive kitten', err)
    }
  }
  return new PrimitiveCat()
}

// ---------------------------------------------------------------------------
// shared facing helper
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3()

function camAzimuth(camera: THREE.Camera | null): number {
  if (!camera) return Math.PI / 4
  camera.getWorldDirection(_v)
  return Math.atan2(-_v.x, -_v.z)
}

function approachAngle(cur: number, target: number, k: number): number {
  let d = target - cur
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return cur + d * k
}

// ---------------------------------------------------------------------------
// 2. Sprites
// ---------------------------------------------------------------------------

type SpriteKey = 'beg' | 'jump' | 'sleep' | 'confetti'
/**
 * Katja's art from Rainbow Kitten. hang.webp, happy.webp and surprised.webp lean against a
 * wall, so they are not used: happy shows the confetti art (standing, waving), surprised the
 * beg art plus a code-driven reaction in the scene. wake.webp is shipped but has no pose yet.
 */
const POSE_SPRITE: Record<CatPose, SpriteKey> = {
  idle: 'beg',
  happy: 'confetti',
  jump: 'jump',
  sleep: 'sleep',
  surprised: 'beg',
}
/** Height in tiles per sprite (art is drawn at different zoom levels; confetti has stars above her head). */
const SPRITE_HEIGHT: Record<SpriteKey, number> = {
  beg: 1.15,
  jump: 1.15,
  sleep: 0.72,
  confetti: 1.22,
}
const POSES: CatPose[] = ['idle', 'happy', 'jump', 'sleep', 'surprised']

/** A quad for one pose. w/h = plane size, ox/oy = plane offset from the feet point. */
interface SpriteFrame {
  mat: THREE.MeshBasicMaterial
  w: number
  h: number
  ox: number
  oy: number
  /** Height of the cat itself (head top), excluding decorations. */
  catH: number
  /** Crop of the original art inside its texture, in UV space. */
  crop: Crop
  base: THREE.Texture
}

interface Crop {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** Rect (fractions, origin top-left) where the original sprite sits inside a dress-up canvas. */
export interface ImageInset {
  x: number
  y: number
  w: number
  h: number
}

class SpriteCat implements CatAvatar {
  readonly kind = 'sprite' as const
  readonly object = new THREE.Group()
  private readonly mesh: THREE.Mesh
  private readonly frames: Record<CatPose, SpriteFrame>
  private pose: CatPose = 'idle'
  private camera: THREE.Camera | null = null
  private faceRight = false
  private faceX = 0
  private faceZ = 0
  private flip = 1
  private walking = false
  private breath = 1
  private readonly tint = new THREE.Color(1, 1, 1)

  static async load(base: string): Promise<SpriteCat> {
    const loader = new THREE.TextureLoader()
    const keys: SpriteKey[] = ['beg', 'jump', 'sleep', 'confetti']
    const results = await Promise.all(
      keys.map((k) =>
        loader.loadAsync(`${base}sprites/${k}.webp`).then(
          (t) => t,
          () => null,
        ),
      ),
    )
    const beg = results[0]
    if (!beg) throw new Error('beg.webp missing')
    const byKey = {} as Record<SpriteKey, { tex: THREE.Texture; crop: Crop; height: number }>
    keys.forEach((k, i) => {
      const tex = results[i] ?? beg
      prepTexture(tex)
      byKey[k] = { tex, crop: alphaCrop(tex.image as CanvasImageSource, imgW(tex), imgH(tex)), height: results[i] ? SPRITE_HEIGHT[k] : SPRITE_HEIGHT.beg }
    })
    const frames = {} as Record<CatPose, SpriteFrame>
    for (const p of POSES) {
      const src = byKey[POSE_SPRITE[p]]
      frames[p] = frameFor(src.tex, src.crop, src.crop, src.height)
    }
    return new SpriteCat(frames)
  }

  private constructor(frames: Record<CatPose, SpriteFrame>) {
    this.frames = frames
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.translate(0, 0.5, 0)
    this.mesh = new THREE.Mesh(geo, frames.idle.mat)
    this.mesh.name = 'katrien-sprite'
    this.mesh.renderOrder = 3
    this.object.add(this.mesh)
    this.object.name = 'katrien'
    this.applyScale()
  }

  get height(): number {
    return this.frames[this.pose].catH * this.breath
  }

  setPose(p: CatPose): void {
    this.pose = p
    this.mesh.material = this.frames[p].mat
    this.applyScale()
  }

  /**
   * Replaces the art of one pose with a composed canvas (dress-up). `inset` tells where the
   * original sprite sits inside the canvas so the feet and size stay aligned. null restores
   * the original art.
   */
  setImage(pose: CatPose, source: HTMLCanvasElement | null, inset?: ImageInset): void {
    const old = this.frames[pose]
    const base = old.base
    const baseCrop = alphaCropCached(base)
    let next: SpriteFrame
    if (!source) {
      next = frameFor(base, baseCrop, baseCrop, old.catH)
    } else {
      const tex = new THREE.CanvasTexture(source)
      prepTexture(tex)
      const r = inset ?? { x: 0, y: 0, w: 1, h: 1 }
      // the original crop expressed in canvas UV (v up)
      const feet: Crop = {
        u0: r.x + baseCrop.u0 * r.w,
        u1: r.x + baseCrop.u1 * r.w,
        v0: 1 - (r.y + (1 - baseCrop.v0) * r.h),
        v1: 1 - (r.y + (1 - baseCrop.v1) * r.h),
      }
      const shown = alphaCrop(source, source.width, source.height)
      const region: Crop = {
        u0: Math.min(shown.u0, feet.u0),
        u1: Math.max(shown.u1, feet.u1),
        v0: Math.min(shown.v0, feet.v0),
        v1: Math.max(shown.v1, feet.v1),
      }
      next = frameFor(tex, region, feet, old.catH, base)
    }
    if (old.mat.map && old.mat.map !== base) old.mat.map.dispose()
    old.mat.dispose()
    next.mat.color.copy(this.tint)
    this.frames[pose] = next
    if (pose === this.pose) this.setPose(pose)
  }

  setView(camera: THREE.Camera): void {
    this.camera = camera
  }

  face(dx: number, dz: number): void {
    const l = Math.hypot(dx, dz)
    if (l < 1e-4) return
    this.faceX = dx / l
    this.faceZ = dz / l
  }

  setWalking(on: boolean): void {
    this.walking = on
  }

  setTint(c: THREE.Color): void {
    this.tint.copy(c)
    for (const f of Object.values(this.frames)) f.mat.color.copy(c)
  }

  private applyScale(): void {
    const f = this.frames[this.pose]
    const breathX = 1 + (1 - this.breath) * 0.6
    this.mesh.scale.set(f.w * this.flip * breathX, f.h * this.breath, 1)
    this.mesh.position.set(f.ox * this.flip * breathX, f.oy * this.breath, 0)
  }

  update(dt: number, t: number): void {
    const az = camAzimuth(this.camera)
    this.object.rotation.y = az
    // screen-space side of the facing direction (camera right = (cos az, 0, -sin az))
    const sx = this.faceX * Math.cos(az) - this.faceZ * Math.sin(az)
    if (sx > 0.08) this.faceRight = true
    else if (sx < -0.08) this.faceRight = false
    // the sprites look left (or ahead) in the art; flip to look right (quick squeeze through zero)
    const target = this.faceRight ? -1 : 1
    const step = dt * 9
    if (this.flip < target) this.flip = Math.min(target, this.flip + step)
    else if (this.flip > target) this.flip = Math.max(target, this.flip - step)
    const rate = this.pose === 'sleep' ? 0.45 : 1.6
    const amp = this.pose === 'sleep' ? 0.035 : this.walking ? 0.01 : 0.025
    this.breath = 1 + amp * Math.sin(t * Math.PI * 2 * rate)
    this.applyScale()
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    const texs = new Set<THREE.Texture>()
    for (const f of Object.values(this.frames)) {
      if (f.mat.map) texs.add(f.mat.map)
      texs.add(f.base)
      f.mat.dispose()
    }
    for (const t of texs) t.dispose()
  }
}

function imgW(tex: THREE.Texture): number {
  const img = tex.image as HTMLImageElement
  return img.naturalWidth || img.width
}
function imgH(tex: THREE.Texture): number {
  const img = tex.image as HTMLImageElement
  return img.naturalHeight || img.height
}

function prepTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
}

const cropCache = new WeakMap<THREE.Texture, Crop>()
function alphaCropCached(tex: THREE.Texture): Crop {
  let c = cropCache.get(tex)
  if (!c) {
    c = alphaCrop(tex.image as CanvasImageSource, imgW(tex), imgH(tex))
    cropCache.set(tex, c)
  }
  return c
}

/** UV rect (v up) of the opaque pixels of an image. */
function alphaCrop(img: CanvasImageSource, iw: number, ih: number): Crop {
  const full: Crop = { u0: 0, u1: 1, v0: 0, v1: 1 }
  try {
    const cw = Math.max(1, Math.round(iw / 4))
    const ch = Math.max(1, Math.round(ih / 4))
    const cv = document.createElement('canvas')
    cv.width = cw
    cv.height = ch
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, cw, ch)
    const data = g.getImageData(0, 0, cw, ch).data
    let minX = cw
    let minY = ch
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 60) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < minX || maxY < minY) return full
    return { u0: minX / cw, u1: (maxX + 1) / cw, v0: 1 - (maxY + 1) / ch, v1: 1 - minY / ch }
  } catch {
    return full
  }
}

/**
 * Builds a frame showing `region` of the texture, scaled so that the `feet` rect (the
 * original art) is `height` tall with its bottom at y = 0 and centred on x = 0.
 */
function frameFor(tex: THREE.Texture, region: Crop, feet: Crop, height: number, base?: THREE.Texture): SpriteFrame {
  const iw = imgW(tex)
  const ih = imgH(tex)
  const upp = height / Math.max(1e-6, (feet.v1 - feet.v0) * ih)
  const t = tex.clone()
  t.offset.set(region.u0, region.v0)
  t.repeat.set(region.u1 - region.u0, region.v1 - region.v0)
  t.needsUpdate = true
  const mat = new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    alphaTest: 0.12,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  return {
    mat,
    w: (region.u1 - region.u0) * iw * upp,
    h: (region.v1 - region.v0) * ih * upp,
    ox: ((region.u0 + region.u1) / 2 - (feet.u0 + feet.u1) / 2) * iw * upp,
    oy: (region.v0 - feet.v0) * ih * upp,
    catH: height,
    crop: feet,
    base: base ?? tex,
  }
}


// ---------------------------------------------------------------------------
// shared base for 3D avatars (primitive + GLB): turning and pose transforms
// ---------------------------------------------------------------------------

abstract class Cat3D implements CatAvatar {
  abstract readonly kind: CatKind
  readonly object = new THREE.Group()
  /** Inner group that pose transforms act on (feet stay at origin). */
  protected readonly poseGroup = new THREE.Group()
  protected pose: CatPose = 'idle'
  protected walking = false
  protected camera: THREE.Camera | null = null
  protected yaw = Math.PI / 4
  protected targetYaw = Math.PI / 4
  protected poseT = 0
  protected baseHeight = 1
  /** Top of the head between the ears, in poseGroup space. */
  protected headTop = new THREE.Vector3(0, 0.95, 0.12)
  /** Head width in world units, for sizing hats. */
  protected headWidth = 0.42
  private accessory: THREE.Sprite | null = null

  constructor() {
    this.object.name = 'katrien'
    this.object.add(this.poseGroup)
  }

  setAccessories(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      if (this.accessory) {
        this.accessory.removeFromParent()
        this.accessory.material.map?.dispose()
        this.accessory.material.dispose()
        this.accessory = null
      }
      return
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    if (!this.accessory) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
      this.accessory = new THREE.Sprite(mat)
      this.accessory.renderOrder = 5
      this.poseGroup.add(this.accessory)
    } else {
      this.accessory.material.map?.dispose()
      this.accessory.material.map = tex
      this.accessory.material.needsUpdate = true
    }
    const size = this.headWidth / ACCESSORY_HEAD_W
    this.accessory.scale.set(size, size * (canvas.height / canvas.width), 1)
    // The canvas centre lies above the anchor by (ANCHOR_Y - 0.5) of its height.
    this.accessory.center.set(0.5, 1 - ACCESSORY_ANCHOR_Y)
  }

  /** Keeps the accessory on the head and a little towards the camera, so the head never covers it. */
  protected updateAccessory(): void {
    const a = this.accessory
    if (!a) return
    a.visible = this.pose !== 'sleep'
    if (!this.camera || !a.visible) return
    this.camera.getWorldDirection(_acc).negate()
    // Into the cat's own frame (it only turns around Y).
    _acc.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.object.rotation.y)
    a.position.copy(this.headTop).addScaledVector(_acc, this.headWidth * 0.75)
  }

  get height(): number {
    return this.pose === 'sleep' ? this.baseHeight * 0.55 : this.baseHeight
  }

  setPose(p: CatPose): void {
    if (p !== this.pose) this.poseT = 0
    this.pose = p
  }
  setView(camera: THREE.Camera): void {
    this.camera = camera
  }
  face(dx: number, dz: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return
    this.targetYaw = Math.atan2(dx, dz)
  }
  setWalking(on: boolean): void {
    this.walking = on
  }
  setTint(): void {
    /* lit avatars take the scene light */
  }

  /** Shared whole-body pose motion. */
  protected updatePose(dt: number, t: number): void {
    this.poseT += dt
    this.yaw = approachAngle(this.yaw, this.targetYaw, damp(dt, 0.08))
    this.object.rotation.y = this.yaw
    const g = this.poseGroup
    g.position.set(0, 0, 0)
    g.rotation.set(0, 0, 0)
    let sx = 1
    let sy = 1
    switch (this.pose) {
      case 'idle': {
        const b = Math.sin(t * Math.PI * 2 * 1.6)
        sy = 1 + 0.022 * b
        sx = 1 - 0.011 * b
        g.rotation.z = 0.03 * Math.sin(t * 1.3)
        break
      }
      case 'happy': {
        const b = Math.abs(Math.sin(t * 7))
        g.position.y = 0.06 * b
        sy = 1 + 0.05 * b
        sx = 1 - 0.03 * b
        g.rotation.z = 0.08 * Math.sin(t * 7)
        break
      }
      case 'jump':
        g.rotation.x = -0.15
        break
      case 'sleep': {
        const b = Math.sin(t * Math.PI * 2 * 0.45)
        sy = 0.6 + 0.02 * b
        sx = 1.18
        g.rotation.x = 0.2
        break
      }
      case 'surprised': {
        const k = Math.min(1, this.poseT / 0.25)
        g.rotation.x = -0.28 * k + 0.04 * Math.sin(this.poseT * 30) * (1 - k)
        sy = 1.05
        break
      }
    }
    g.scale.set(sx, sy, sx)
  }

  abstract update(dt: number, t: number): void
  abstract dispose(): void
}

// ---------------------------------------------------------------------------
// 3. Primitive kitten
// ---------------------------------------------------------------------------

/** Calico colours from Katja's character sheet. */
const WHITE = '#f7f3ee'
const PAW = '#efe6df'
const BLACK = '#34302f'
const ORANGE = '#ef9a45'
const PINK = '#f4a3b4'
const EYE = '#c8892f'
const PUPIL = '#2a1a10'

/** Katrien built from primitives: a white kitten with black and orange patches. */
class PrimitiveCat extends Cat3D {
  readonly kind = 'primitive' as const
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly mats: THREE.Material[] = []
  private readonly tail: THREE.Object3D[] = []
  private readonly head = new THREE.Group()
  private readonly eyes: THREE.Object3D[] = []
  private readonly ears: THREE.Object3D[] = []
  private readonly legs: THREE.Object3D[] = []

  constructor() {
    super()
    this.baseHeight = 1.0
    const fur = this.mat(WHITE)
    const paw = this.mat(PAW)
    const black = this.mat(BLACK)
    const orange = this.mat(ORANGE)
    const pink = this.mat(PINK)
    const eye = this.mat(EYE, 0.25)
    const pupil = this.mat(PUPIL, 0.1)
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    this.mats.push(white)
    const sph = this.geo(new THREE.SphereGeometry(1, 20, 16))
    const lowSph = this.geo(new THREE.SphereGeometry(1, 12, 10))
    const cone = this.geo(new THREE.ConeGeometry(1, 1, 12))
    const cyl = this.geo(new THREE.CylinderGeometry(1, 1, 1, 12))
    const g = this.poseGroup

    const part = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      p: [number, number, number],
      s: [number, number, number],
      r: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(...p)
      mesh.scale.set(...s)
      mesh.rotation.set(...r)
      // only the big shapes cast shadows (fewer draw calls in the shadow pass)
      mesh.castShadow = Math.min(s[0], s[1], s[2]) > 0.06
      parent.add(mesh)
      return mesh
    }

    // body: white with an orange patch on one side of the back and a black one on the other
    part(g, sph, fur, [0, 0.33, -0.02], [0.24, 0.23, 0.3])
    part(g, sph, orange, [-0.08, 0.41, 0.06], [0.17, 0.14, 0.17])
    part(g, sph, black, [0.09, 0.4, -0.15], [0.16, 0.15, 0.16])
    // legs + paws (one black back leg, like in the art)
    for (const [x, z] of [[-0.12, 0.14], [0.12, 0.14], [-0.12, -0.16], [0.12, -0.16]] as const) {
      const leg = new THREE.Group()
      leg.position.set(x, 0.2, z)
      g.add(leg)
      part(leg, cyl, x > 0 && z < 0 ? black : fur, [0, -0.08, 0], [0.072, 0.17, 0.072])
      part(leg, lowSph, paw, [0, -0.17, 0.02], [0.08, 0.05, 0.095])
      this.legs.push(leg)
    }
    // tail: a chain of segments in black and orange bands
    let parent: THREE.Object3D = g
    const tailBase = new THREE.Group()
    tailBase.position.set(0, 0.36, -0.3)
    tailBase.rotation.x = -0.9
    g.add(tailBase)
    parent = tailBase
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group()
      seg.position.set(0, i === 0 ? 0 : 0.085, 0)
      parent.add(seg)
      const r = 0.058 - i * 0.003
      part(seg, sph, i % 2 ? orange : black, [0, 0.045, 0], [r, 0.065, r])
      this.tail.push(seg)
      parent = seg
    }
    // head: white with a white blaze down the middle, black patch on one side, orange on the other
    this.head.position.set(0, 0.66, 0.1)
    g.add(this.head)
    const h = this.head
    part(h, sph, fur, [0, 0, 0], [0.29, 0.26, 0.26])
    part(h, sph, fur, [0, -0.07, 0.19], [0.13, 0.09, 0.08])
    part(h, sph, pink, [0, -0.03, 0.26], [0.03, 0.022, 0.02])
    for (const sx of [-1, 1]) {
      const patch = sx < 0 ? black : orange
      part(h, sph, patch, [sx * 0.11, 0.06, 0.03], [0.19, 0.2, 0.23])
      part(h, sph, fur, [sx * 0.045, -0.08, 0.235], [0.05, 0.04, 0.035])
      // amber eyes with a dark pupil and a highlight
      const e = new THREE.Group()
      e.position.set(sx * 0.11, 0.02, 0.215)
      h.add(e)
      part(e, sph, eye, [0, 0, 0], [0.052, 0.06, 0.03])
      part(e, sph, pupil, [0, 0, 0.012], [0.032, 0.042, 0.025])
      part(e, lowSph, white, [sx * -0.012 + 0.012, 0.022, 0.03], [0.017, 0.017, 0.01])
      this.eyes.push(e)
      // ears in the colour of their side, pink inside
      const ear = new THREE.Group()
      ear.position.set(sx * 0.16, 0.18, 0.0)
      ear.rotation.z = -sx * 0.32
      h.add(ear)
      part(ear, cone, patch, [0, 0.08, 0], [0.11, 0.2, 0.07])
      part(ear, cone, pink, [0, 0.07, 0.03], [0.07, 0.14, 0.035])
      this.ears.push(ear)
    }
    this.object.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.receiveShadow = true
    })
  }

  private mat(color: string, emissive = 0): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color })
    if (emissive) m.emissive.set(color).multiplyScalar(emissive)
    this.mats.push(m)
    return m
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g)
    return g
  }

  update(dt: number, t: number): void {
    this.updatePose(dt, t)
    const pose = this.pose
    const wagSpeed = pose === 'happy' ? 9 : pose === 'sleep' ? 0.8 : 3
    const wagAmp = pose === 'happy' ? 0.4 : pose === 'sleep' ? 0.05 : 0.22
    this.tail.forEach((seg, i) => {
      seg.rotation.z = wagAmp * Math.sin(t * wagSpeed - i * 0.6) * (0.5 + i * 0.25)
      seg.rotation.x = pose === 'sleep' ? 0.35 : -0.28 + 0.05 * Math.sin(t * 2 + i)
    })
    // eyes: blink, closed when sleeping/happy, wide when surprised
    const blink = t % 3.7 < 0.12
    const eyeY = pose === 'sleep' ? 0.12 : pose === 'happy' ? 0.35 : blink ? 0.1 : pose === 'surprised' ? 1.3 : 1
    for (const e of this.eyes) e.scale.set(pose === 'surprised' ? 1.2 : 1, eyeY, 1)
    this.head.rotation.set(
      pose === 'sleep' ? 0.35 : 0.06 * Math.sin(t * 0.8),
      0.15 * Math.sin(t * 0.5),
      0.08 * Math.sin(t * 0.9),
    )
    this.ears.forEach((ear, i) => {
      ear.rotation.x = pose === 'surprised' ? -0.2 : 0.05 * Math.sin(t * 5 + i)
    })
    const walkPhase = this.walking ? t * 14 : 0
    this.legs.forEach((leg, i) => {
      const s = i === 0 || i === 3 ? 1 : -1
      leg.rotation.x = this.walking ? 0.5 * Math.sin(walkPhase) * s : pose === 'jump' ? (i < 2 ? -0.5 : 0.5) : 0
    })
  }

  dispose(): void {
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }
}

// ---------------------------------------------------------------------------
// 1. GLB scan
// ---------------------------------------------------------------------------

/** Height of the GLB scan in tiles (feet to ear tips). */
const GLB_HEIGHT = 0.85

class GlbCat extends Cat3D {
  readonly kind = 'glb' as const
  private readonly mixer: THREE.AnimationMixer | null = null
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private readonly model: THREE.Group

  constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
    super()
    // Katrien's scan stands on four legs with a long tail: at one tile high she would be
    // almost a tile and a half long, so she is a bit smaller than a tile.
    this.baseHeight = GLB_HEIGHT
    this.model = normalizeModel(scene, GLB_HEIGHT)
    this.poseGroup.add(this.model)
    this.centreOnFeet()
    this.measureHead()
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(this.model)
      for (const clip of clips) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip))
      this.play(['idle', 'stand', 'breath'])
    }
  }

  /**
   * normalizeModel centres the bounding box, but the tail makes that box long at the back.
   * Centre the paws on the tile instead, so she stands on it and the tail hangs behind.
   */
  private centreOnFeet(): void {
    this.model.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    const feet = new THREE.Vector3()
    let n = 0
    this.model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const pos = m.geometry.getAttribute('position')
      const step = Math.max(1, Math.floor(pos.count / 6000))
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        if (v.y < GLB_HEIGHT * 0.08) {
          feet.add(v)
          n++
        }
      }
    })
    if (!n) return
    feet.multiplyScalar(1 / n)
    this.model.position.x -= feet.x
    this.model.position.z -= feet.z
  }

  /** Finds the top of the head between the ears from the mesh itself. */
  private measureHead(): void {
    this.model.updateMatrixWorld(true)
    const pts: THREE.Vector3[] = []
    let maxY = -Infinity
    const v = new THREE.Vector3()
    this.model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const pos = m.geometry.getAttribute('position')
      const step = Math.max(1, Math.floor(pos.count / 6000))
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        pts.push(v.clone())
        if (v.y > maxY) maxY = v.y
      }
    })
    if (!pts.length) return
    // The ears are the highest points; the band just below holds the skull.
    const band = pts.filter((p) => p.y > maxY * 0.8)
    const c = band.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / band.length)
    let minX = Infinity
    let maxX = -Infinity
    for (const p of band) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
    }
    // Katrien's ears are small: the skull top sits just below the ear tips.
    this.headTop.set(c.x, maxY * 0.93, c.z)
    this.headWidth = Math.max(0.25, Math.min(0.6, (maxX - minX) * 0.9))
  }

  private play(names: string[]): void {
    if (!this.mixer) return
    let next: THREE.AnimationAction | null = null
    for (const [name, action] of this.actions) {
      if (names.some((n) => name.includes(n))) {
        next = action
        break
      }
    }
    if (!next || next === this.current) return
    next.reset().fadeIn(0.2).play()
    this.current?.fadeOut(0.2)
    this.current = next
  }

  setWalking(on: boolean): void {
    if (on !== this.walking) this.play(on ? ['walk', 'run', 'move'] : ['idle', 'stand', 'breath'])
    super.setWalking(on)
  }

  update(dt: number, t: number): void {
    this.updatePose(dt, t)
    this.mixer?.update(dt)
    this.updateAccessory()
  }

  dispose(): void {
    this.mixer?.stopAllAction()
    this.model.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
  }
}
