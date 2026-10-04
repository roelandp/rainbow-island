import { EMPTY_LOOK, capeById, hatById, type Look } from '../content/looks'
import { ACCESSORY_ANCHOR_Y, ACCESSORY_ASPECT, ACCESSORY_HEAD_W } from './cat'
import { DRAWN_HATS, paintCape, paintPattern } from './dressart'

/**
 * Where the head sits in each sprite, measured on Katja's art from Rainbow
 * Kitten. `head` is the top of the skull between the ears, `face` sits between
 * the eyes, `neck` is where a cape is tied (none when she is curled up), all as
 * fractions of the sprite. `headW` is the skull width as a fraction of the
 * sprite width, rotations are the head tilt in degrees.
 */
interface Anchor {
  headW: number
  rot: number
  head: { x: number; y: number }
  face: { x: number; y: number }
  faceRot: number
  neck?: { x: number; y: number; rot: number }
}

interface SpriteDef {
  file: string
  w: number
  h: number
  anchor: Anchor
}

const SPRITES: Record<string, SpriteDef> = {
  beg: { file: 'sprites/beg.webp', w: 460, h: 768, anchor: { headW: 0.72, rot: 0, head: { x: 0.52, y: 0.05 }, face: { x: 0.535, y: 0.29 }, faceRot: 0, neck: { x: 0.5, y: 0.45, rot: 0 } } },
  jump: { file: 'sprites/jump.webp', w: 456, h: 768, anchor: { headW: 0.5, rot: 20, head: { x: 0.5, y: 0.07 }, face: { x: 0.435, y: 0.165 }, faceRot: 16, neck: { x: 0.6, y: 0.275, rot: 15 } } },
  sleep: { file: 'sprites/sleep.webp', w: 782, h: 768, anchor: { headW: 0.52, rot: -22, head: { x: 0.27, y: 0.27 }, face: { x: 0.36, y: 0.545 }, faceRot: -22 } },
  confetti: { file: 'sprites/confetti.webp', w: 534, h: 768, anchor: { headW: 0.58, rot: 18, head: { x: 0.54, y: 0.15 }, face: { x: 0.47, y: 0.285 }, faceRot: 18, neck: { x: 0.53, y: 0.43, rot: 10 } } },
}

/**
 * Island poses onto sprites. Katja's hang, happy and surprised art leans against a
 * wall, so happy uses the confetti art and surprised the beg art. Keep in sync with
 * POSE_SPRITE in cat.ts.
 */
export const POSE_SPRITE: Record<string, string> = {
  idle: 'beg',
  surprised: 'beg',
  happy: 'confetti',
  jump: 'jump',
  sleep: 'sleep',
}

/** Rainbow Kitten's cape art: the knot sits at this fraction of the picture. */
const CAPE_PIVOT = { x: 0.08, y: 0.12 }

/** Transparent margin around the sprite, so a tall hat is never clipped. */
const PAD_TOP = 0.36
const PAD_SIDE = 0.15
const PAD_BOTTOM = 0.04

export interface Dressed {
  canvas: HTMLCanvasElement
  /** Where the original sprite sits inside the padded canvas, in fractions. */
  inset: { x: number; y: number; w: number; h: number }
  version: number
}

interface Entry extends Dressed {
  base: HTMLImageElement | null
  def: SpriteDef
  padX: number
  padY: number
  dirty: boolean
}

/**
 * Composes Katrien with hats and a cape into one canvas per
 * sprite. The scene turns that canvas into a texture, the dress-up screen into
 * an image, so both show the same outfit.
 */
export class CatDresser {
  private base: string
  private current: Look = { ...EMPTY_LOOK }
  private entries = new Map<string, Entry>()
  private hatImages = new Map<string, HTMLImageElement | null>()
  private listeners = new Set<() => void>()

  constructor(base: string) {
    this.base = base
  }

  get look(): Look {
    return this.current
  }

  get isPlain(): boolean {
    return this.current.hats.length === 0 && !this.current.cape && !this.current.pattern
  }

  setLook(look: Look): void {
    if (JSON.stringify(look) === JSON.stringify(this.current)) return
    this.current = { hats: [...look.hats], pattern: look.pattern, cape: look.cape }
    this.invalidate()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** The composed canvas for a sprite name (beg, jump, sleep, confetti), or null while it loads. */
  dressed(sprite: string): Dressed | null {
    const entry = this.entry(sprite)
    if (!entry || !entry.base) return null
    if (entry.dirty) this.compose(entry)
    return entry
  }

  /**
   * Only the hats and accessories, laid out around a virtual head (see ACCESSORY_*
   * in cat.ts), for 3D avatars. Capes never go on the 3D model.
   */
  accessoryCanvas(): HTMLCanvasElement | null {
    if (this.current.hats.length === 0) return null
    // Taller than wide, so a bow tie under the chin still fits.
    const width = 512
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round(width * ACCESSORY_ASPECT)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const headW = width * ACCESSORY_HEAD_W
    for (const id of this.current.hats) {
      const hat = hatById(id)
      if (!hat) continue
      ctx.save()
      // The face sits a third of a head below the top of the head.
      ctx.translate(width / 2, canvas.height * ACCESSORY_ANCHOR_Y + (hat.mount === 'face' ? headW * 0.42 : 0))
      ctx.rotate((hat.rot * Math.PI) / 180)
      ctx.translate(hat.dx * headW, hat.dy * headW)
      const w = headW * hat.scale
      if (hat.source === 'draw') {
        DRAWN_HATS[hat.id]?.(ctx, w)
      } else {
        const img = this.hatImage(hat.id)
        if (img) {
          const h = (w * img.naturalHeight) / img.naturalWidth
          ctx.drawImage(img, -w / 2, hat.mount === 'face' ? -h / 2 : -h * 0.82, w, h)
        }
      }
      ctx.restore()
    }
    return canvas
  }

  /** The pose as a trimmed PNG for plain `<img>` use. Null while the art loads. */
  dataUrl(sprite: string): string | null {
    const d = this.dressed(sprite)
    return d ? trim(d.canvas).toDataURL('image/png') : null
  }

  private invalidate(): void {
    for (const entry of this.entries.values()) entry.dirty = true
    for (const fn of this.listeners) fn()
  }

  private entry(sprite: string): Entry | null {
    const found = this.entries.get(sprite)
    if (found) return found
    const def = SPRITES[sprite]
    if (!def) return null
    const padX = Math.round(def.w * PAD_SIDE)
    const padY = Math.round(def.h * PAD_TOP)
    const canvas = document.createElement('canvas')
    canvas.width = def.w + padX * 2
    canvas.height = def.h + padY + Math.round(def.h * PAD_BOTTOM)
    const entry: Entry = {
      canvas,
      inset: { x: padX / canvas.width, y: padY / canvas.height, w: def.w / canvas.width, h: def.h / canvas.height },
      version: 0,
      base: null,
      def,
      padX,
      padY,
      dirty: true,
    }
    this.entries.set(sprite, entry)
    const img = new Image()
    img.onload = () => {
      entry.base = img
      entry.dirty = true
      for (const fn of this.listeners) fn()
    }
    img.src = `${this.base}${def.file}`
    return entry
  }

  private hatImage(id: string): HTMLImageElement | null {
    if (this.hatImages.has(id)) {
      const cached = this.hatImages.get(id)!
      return cached && cached.naturalWidth > 0 ? cached : null
    }
    const img = new Image()
    img.onload = () => this.invalidate()
    img.onerror = () => this.hatImages.set(id, null)
    img.src = `${this.base}items/${id}.webp`
    this.hatImages.set(id, img)
    return null
  }

  private compose(entry: Entry): void {
    const ctx = entry.canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
    entry.dirty = false
    if (!entry.base) return
    const { w, h } = entry.def
    if (this.current.cape) this.applyCape(ctx, entry, this.current.cape)
    ctx.drawImage(entry.base, entry.padX, entry.padY, w, h)
    if (this.current.pattern) this.applyPattern(ctx, entry, this.current.pattern)
    for (const hatId of this.current.hats) this.applyHat(ctx, entry, hatId)
    entry.version++
  }

  private applyCape(ctx: CanvasRenderingContext2D, entry: Entry, capeId: string): void {
    const capeDef = capeById(capeId)
    const neck = entry.def.anchor.neck
    if (!capeDef || !neck) return
    const { w: sw, h: sh, anchor } = entry.def
    ctx.save()
    ctx.translate(entry.padX + neck.x * sw, entry.padY + neck.y * sh)
    ctx.rotate((neck.rot * Math.PI) / 180)
    if (capeDef.item) {
      const img = this.hatImage(capeDef.item)
      if (img) {
        const cw = anchor.headW * sw * 1.3
        const ch = (cw * img.naturalHeight) / img.naturalWidth
        ctx.drawImage(img, -CAPE_PIVOT.x * cw, -CAPE_PIVOT.y * ch, cw, ch)
      }
    } else {
      paintCape(ctx, capeDef.color, sw)
    }
    ctx.restore()
  }

  private applyPattern(ctx: CanvasRenderingContext2D, entry: Entry, id: string): void {
    const { width, height } = entry.canvas
    ctx.save()
    // source-atop keeps the paint inside the silhouette that is already there.
    ctx.globalCompositeOperation = 'source-atop'
    paintPattern(ctx, id, width, height)
    ctx.restore()

    // Draw the face back over the pattern, feathered, so eyes and mouth stay clean.
    const mask = document.createElement('canvas')
    mask.width = width
    mask.height = height
    const mctx = mask.getContext('2d')
    if (!mctx || !entry.base) return
    const { w, h, anchor } = entry.def
    mctx.drawImage(entry.base, entry.padX, entry.padY, w, h)
    mctx.globalCompositeOperation = 'destination-in'
    const fx = entry.padX + anchor.face.x * w
    const fy = entry.padY + anchor.face.y * h
    const r = anchor.headW * w * 0.6
    const grad = mctx.createRadialGradient(fx, fy, r * 0.42, fx, fy, r)
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    mctx.fillStyle = grad
    mctx.fillRect(0, 0, width, height)
    ctx.drawImage(mask, 0, 0)
  }

  private applyHat(ctx: CanvasRenderingContext2D, entry: Entry, id: string): void {
    const hat = hatById(id)
    if (!hat) return
    const { w: sw, h: sh, anchor } = entry.def
    const headW = anchor.headW * sw
    const mount = hat.mount === 'face' ? anchor.face : anchor.head
    ctx.save()
    ctx.translate(entry.padX + mount.x * sw, entry.padY + mount.y * sh)
    const tilt = hat.mount === 'face' ? anchor.faceRot : anchor.rot
    ctx.rotate(((tilt + hat.rot) * Math.PI) / 180)
    ctx.translate(hat.dx * headW, hat.dy * headW)
    const w = headW * hat.scale
    if (hat.source === 'draw') {
      DRAWN_HATS[hat.id]?.(ctx, w)
    } else {
      const img = this.hatImage(hat.id)
      if (img) {
        const h = (w * img.naturalHeight) / img.naturalWidth
        ctx.drawImage(img, -w / 2, hat.mount === 'face' ? -h / 2 : -h * 0.82, w, h)
      }
    }
    ctx.restore()
  }
}

/** Cuts the transparent margin off, so an `<img>` shows the kitten at full size. */
function trim(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d')
  if (!ctx) return source
  const { width, height } = source
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return source
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')?.drawImage(source, -minX, -minY)
  return out
}
