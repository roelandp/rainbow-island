import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp01, easeInCubic, easeOutBack, hash2 } from './tween'
import { WATER_Y } from './water'

/**
 * The island ground: one rounded grass slab + dirt column per tile (InstancedMesh), a soft
 * sand beach rim around the footprint, and a few deterministic grass tufts and flowers.
 *
 * Coordinates: tile (x, z) occupies world [x, x+1] x [z, z+1], centre (x + 0.5, z + 0.5).
 * The footprint is x in [minX, minX + w - 1] with minX = -floor(w / 2) (same for z), so
 * existing tiles never move when the island grows. Ground top is y = 0.
 */

const MAX_TILES = 24 * 24
const RISE_FROM = -2.6
const RISE_DUR = 0.6
const STAGGER = 0.04
const SINK_DUR = 0.5

const GRASS = ['#a6dc8c', '#addf91', '#9fd788', '#b0e08f', '#a3da8e'].map((c) => new THREE.Color(c))
const DIRT = new THREE.Color('#d9b08c')
const SAND = new THREE.Color('#f5deaa')
const UNDERWATER = new THREE.Color('#9fd3ea')

interface TileRec {
  x: number
  z: number
  start: number
  splashed: boolean
}

interface RimPiece {
  owner: string
  key: string
  x: number
  z: number
  rotY: number
  len: number
  sinkStart: number // < 0 = not sinking
}

const tkey = (x: number, z: number): string => `${x},${z}`

export class Island {
  readonly group = new THREE.Group()
  w = 0
  d = 0
  minX = 0
  minZ = 0
  /** Called when a rising tile breaks the water surface (world centre x/z). */
  onSplash?: (x: number, z: number) => void

  private tiles = new Map<string, TileRec>()
  private rim: RimPiece[] = []
  private occupied = new Set<string>()
  private readonly top: THREE.InstancedMesh
  private readonly column: THREE.InstancedMesh
  private readonly rimMesh: THREE.InstancedMesh
  private readonly tufts: THREE.InstancedMesh
  private readonly flowers: THREE.InstancedMesh
  private now = 0
  private animUntil = -1
  private dirty = true
  private waiters: { at: number; resolve: () => void }[] = []
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly yAxis = new THREE.Vector3(0, 1, 0)

  constructor() {
    this.group.name = 'island'
    const topGeo = new RoundedBoxGeometry(1, 0.28, 1, 2, 0.1)
    topGeo.translate(0, -0.14, 0)
    const colGeo = new RoundedBoxGeometry(0.97, 1.2, 0.97, 1, 0.08)
    colGeo.translate(0, -0.26 - 0.6, 0)
    // underwater parts fade into the water colour so they read as depth, not as pillars
    depthGradient(colGeo, DIRT, UNDERWATER, -0.3, -1.4)
    const rimGeo = new RoundedBoxGeometry(1.24, 0.36, 0.64, 2, 0.16)
    rimGeo.translate(0, -0.1 - 0.18, 0)
    depthGradient(rimGeo, SAND, new THREE.Color('#d9e8d8'), -0.25, -0.46)

    const lambert = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) =>
      new THREE.MeshLambertMaterial({ color, ...extra })

    this.top = new THREE.InstancedMesh(topGeo, lambert('#ffffff'), MAX_TILES)
    this.top.receiveShadow = true
    this.column = new THREE.InstancedMesh(colGeo, lambert('#ffffff', { vertexColors: true }), MAX_TILES)
    this.column.receiveShadow = true
    this.rimMesh = new THREE.InstancedMesh(rimGeo, lambert('#ffffff', { vertexColors: true }), MAX_TILES)
    this.rimMesh.receiveShadow = true

    // grass tufts: three little blades
    const blades: THREE.BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const b = new THREE.ConeGeometry(0.028, 0.13, 4)
      b.translate(0, 0.065, 0)
      b.rotateZ((i - 1) * 0.35)
      b.rotateY(i * 2.1)
      b.translate((i - 1) * 0.03, 0, (i % 2) * 0.02)
      blades.push(b)
    }
    const tuftGeo = mergeGeometries(blades)!
    this.tufts = new THREE.InstancedMesh(tuftGeo, lambert('#86c56f'), MAX_TILES * 2)

    // flowers: five petals + a yellow heart (vertex colours, petals tinted per instance)
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 5; i++) {
      const p = new THREE.SphereGeometry(0.034, 6, 4)
      const a = (i / 5) * Math.PI * 2
      p.scale(1, 0.55, 1)
      p.translate(Math.cos(a) * 0.04, 0.06, Math.sin(a) * 0.04)
      parts.push(withColor(p, 1, 1, 1))
    }
    const heart = new THREE.SphereGeometry(0.03, 6, 4)
    heart.translate(0, 0.075, 0)
    parts.push(withColor(heart, 1, 0.82, 0.35))
    const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4)
    stem.translate(0, 0.03, 0)
    parts.push(withColor(stem, 0.55, 0.78, 0.45))
    this.flowers = new THREE.InstancedMesh(
      mergeGeometries(parts)!,
      lambert('#ffffff', { vertexColors: true }),
      MAX_TILES,
    )

    for (const mesh of [this.top, this.column, this.rimMesh, this.tufts, this.flowers]) {
      mesh.count = 0
      mesh.frustumCulled = false
      this.group.add(mesh)
    }
    this.top.name = 'island-top'
  }

  get centerX(): number {
    return this.minX + this.w / 2
  }
  get centerZ(): number {
    return this.minZ + this.d / 2
  }

  contains(x: number, z: number): boolean {
    return x >= this.minX && x < this.minX + this.w && z >= this.minZ && z < this.minZ + this.d
  }

  /** Grows (or sets) the footprint. New tiles rise out of the water when animate is true. */
  setSize(w: number, d: number, animate = false): Promise<void> {
    w = Math.max(1, Math.min(24, Math.round(w)))
    d = Math.max(1, Math.min(24, Math.round(d)))
    const minX = -Math.floor(w / 2)
    const minZ = -Math.floor(d / 2)
    const hadTiles = this.tiles.size > 0
    const next = new Map<string, TileRec>()
    const added: TileRec[] = []
    for (let x = minX; x < minX + w; x++) {
      for (let z = minZ; z < minZ + d; z++) {
        const k = tkey(x, z)
        const old = this.tiles.get(k)
        if (old) next.set(k, old)
        else {
          const rec: TileRec = { x, z, start: -1e9, splashed: true }
          next.set(k, rec)
          added.push(rec)
        }
      }
    }
    this.tiles = next
    this.w = w
    this.d = d
    this.minX = minX
    this.minZ = minZ

    let done = this.now
    if (animate && hadTiles && added.length) {
      // order: sweep along the ring so the new land rises like a wave
      const cx = this.centerX
      const cz = this.centerZ
      added.sort((a, b) => angleOf(a, cx, cz) - angleOf(b, cx, cz))
      added.forEach((rec, i) => {
        rec.start = this.now + 0.05 + i * STAGGER
        rec.splashed = false
      })
      done = this.now + 0.05 + (added.length - 1) * STAGGER + RISE_DUR
    }
    this.rebuildRim(animate && hadTiles)
    this.animUntil = Math.max(this.animUntil, done + SINK_DUR)
    this.dirty = true
    this.update(this.now)
    if (done <= this.now) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push({ at: done, resolve }))
  }

  /** Tiles covered by blocks/props/characters: no decorations there. */
  setOccupied(keys: Iterable<string>): void {
    this.occupied = new Set(keys)
    this.dirty = true
  }

  /** Current vertical offset of a tile (rise animation), 0 when settled. */
  tileOffset(x: number, z: number): number {
    const rec = this.tiles.get(tkey(x, z))
    return rec ? this.offsetOf(rec) : 0
  }

  private offsetOf(rec: TileRec): number {
    const k = (this.now - rec.start) / RISE_DUR
    if (k >= 1) return 0
    if (k <= 0) return RISE_FROM
    return RISE_FROM * (1 - easeOutBack(k, 1.4))
  }

  private rebuildRim(animate: boolean): void {
    const pieces: RimPiece[] = []
    const { minX, minZ, w, d } = this
    const maxX = minX + w - 1
    const maxZ = minZ + d - 1
    const off = 0.5 + 0.32 - 0.21
    for (let x = minX; x <= maxX; x++) {
      pieces.push(piece(x, minZ, x + 0.5, minZ + 0.5 - off, 0, 1))
      pieces.push(piece(x, maxZ, x + 0.5, maxZ + 0.5 + off, 0, 1))
    }
    for (let z = minZ; z <= maxZ; z++) {
      pieces.push(piece(minX, z, minX + 0.5 - off, z + 0.5, Math.PI / 2, 1))
      pieces.push(piece(maxX, z, maxX + 0.5 + off, z + 0.5, Math.PI / 2, 1))
    }
    const c = 0.62
    pieces.push(piece(minX, minZ, minX + 0.5 - off, minZ + 0.5 - off, 0, c))
    pieces.push(piece(maxX, minZ, maxX + 0.5 + off, minZ + 0.5 - off, 0, c))
    pieces.push(piece(minX, maxZ, minX + 0.5 - off, maxZ + 0.5 + off, 0, c))
    pieces.push(piece(maxX, maxZ, maxX + 0.5 + off, maxZ + 0.5 + off, 0, c))

    const keys = new Set(pieces.map((p) => p.key))
    const sinking = animate
      ? this.rim
          .filter((p) => !keys.has(p.key) && p.sinkStart < 0)
          .map((p) => ({ ...p, sinkStart: this.now }))
      : []
    const stillSinking = this.rim.filter((p) => p.sinkStart >= 0 && this.now - p.sinkStart < SINK_DUR)
    this.rim = pieces.concat(sinking, stillSinking)
  }

  update(t: number): void {
    this.now = t
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]
      if (t >= w.at) {
        this.waiters.splice(i, 1)
        w.resolve()
      }
    }
    const animating = t <= this.animUntil
    if (!animating && !this.dirty) return
    this.dirty = animating
    this.writeInstances()
  }

  private writeInstances(): void {
    const { m, q, v, s } = this
    let n = 0
    const col = new THREE.Color()
    for (const rec of this.tiles.values()) {
      const y = this.offsetOf(rec)
      if (!rec.splashed && y > WATER_Y - 0.28) {
        rec.splashed = true
        this.onSplash?.(rec.x + 0.5, rec.z + 0.5)
      }
      m.makeTranslation(rec.x + 0.5, y, rec.z + 0.5)
      this.top.setMatrixAt(n, m)
      this.column.setMatrixAt(n, m)
      const h = hash2(rec.x, rec.z, 3)
      col.copy(GRASS[Math.floor(h * GRASS.length)])
      this.top.setColorAt(n, col)
      const lv = 1 + (hash2(rec.x, rec.z, 9) - 0.5) * 0.06
      col.setRGB(lv, lv, lv)
      this.column.setColorAt(n, col)
      n++
    }
    this.top.count = n
    this.column.count = n
    markInstances(this.top)
    markInstances(this.column)

    // beach rim
    let r = 0
    this.rim = this.rim.filter((p) => p.sinkStart < 0 || this.now - p.sinkStart < SINK_DUR)
    for (const p of this.rim) {
      let y: number
      if (p.sinkStart >= 0) y = -0.7 * easeInCubic(clamp01((this.now - p.sinkStart) / SINK_DUR))
      else {
        const owner = this.tiles.get(p.owner)
        y = owner ? this.offsetOf(owner) : 0
      }
      q.setFromAxisAngle(this.yAxis, p.rotY)
      v.set(p.x, y, p.z)
      s.set(p.len, 1, 1)
      m.compose(v, q, s)
      this.rimMesh.setMatrixAt(r++, m)
    }
    this.rimMesh.count = r
    markInstances(this.rimMesh)

    // decorations
    let nt = 0
    let nf = 0
    const flowerColors = ['#ffffff', '#ffb3c8', '#fff1a0', '#d9c2ff', '#ffc9a3']
    for (const rec of this.tiles.values()) {
      if (this.occupied.has(tkey(rec.x, rec.z))) continue
      const y = this.offsetOf(rec)
      const tufts = Math.floor(hash2(rec.x, rec.z, 21) * 3)
      for (let i = 0; i < tufts; i++) {
        const a = hash2(rec.x, rec.z, 30 + i)
        const b = hash2(rec.x, rec.z, 40 + i)
        q.setFromAxisAngle(this.yAxis, a * 6.28)
        v.set(rec.x + 0.15 + a * 0.7, y, rec.z + 0.15 + b * 0.7)
        const sc = 0.8 + b * 0.5
        s.set(sc, sc, sc)
        m.compose(v, q, s)
        this.tufts.setMatrixAt(nt++, m)
      }
      if (hash2(rec.x, rec.z, 50) < 0.45) {
        const a = hash2(rec.x, rec.z, 51)
        const b = hash2(rec.x, rec.z, 52)
        q.setFromAxisAngle(this.yAxis, a * 6.28)
        v.set(rec.x + 0.18 + a * 0.64, y, rec.z + 0.18 + b * 0.64)
        s.set(1, 1, 1)
        m.compose(v, q, s)
        this.flowers.setMatrixAt(nf, m)
        col.set(flowerColors[Math.floor(hash2(rec.x, rec.z, 53) * flowerColors.length)])
        this.flowers.setColorAt(nf, col)
        nf++
      }
    }
    this.tufts.count = nt
    this.flowers.count = nf
    markInstances(this.tufts)
    markInstances(this.flowers)
  }

  dispose(): void {
    for (const mesh of [this.top, this.column, this.rimMesh, this.tufts, this.flowers]) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
  }
}

function piece(ox: number, oz: number, x: number, z: number, rotY: number, len: number): RimPiece {
  return {
    owner: tkey(ox, oz),
    key: `${x.toFixed(2)},${z.toFixed(2)},${len}`,
    x,
    z,
    rotY,
    len,
    sinkStart: -1,
  }
}

function angleOf(rec: TileRec, cx: number, cz: number): number {
  return Math.atan2(rec.z + 0.5 - cz, rec.x + 0.5 - cx)
}

function withColor(g: THREE.BufferGeometry, r: number, gr: number, b: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = r
    arr[i * 3 + 1] = gr
    arr[i * 3 + 2] = b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  // mergeGeometries needs matching attribute sets: drop uvs everywhere
  g.deleteAttribute('uv')
  return g
}

/** Vertex colours: `top` at y >= y0 blending to `bottom` at y <= y1. */
function depthGradient(g: THREE.BufferGeometry, top: THREE.Color, bottom: THREE.Color, y0: number, y1: number): void {
  const pos = g.getAttribute('position')
  const arr = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (y0 - pos.getY(i)) / (y0 - y1)))
    c.copy(top).lerp(bottom, k)
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

export function markInstances(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
