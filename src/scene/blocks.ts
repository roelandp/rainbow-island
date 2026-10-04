import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { clamp01, easeOutBack, hash2 } from './tween'
import { markInstances } from './island'

export type BlockType = 'gras' | 'zand' | 'steen' | 'hout' | 'water' | 'bloemen'
/** y = layer index above the island surface: layer k occupies world y in [k, k + 1]. */
export interface PlacedBlock {
  x: number
  z: number
  y: number
  type: BlockType
}

/** Water blocks are a bit lower than a full block. */
export const WATER_BLOCK_H = 0.85
const POP_DUR = 0.3

const COLORS = {
  dirt: new THREE.Color('#d9b08c'),
  zand: new THREE.Color('#f2dca6'),
  steen: new THREE.Color('#c9c5cf'),
  grass: new THREE.Color('#a6dc8c'),
}
const FLOWER_COLORS = ['#ff9ec0', '#fff1a0', '#ffffff', '#c9b3ff', '#ffb98a'].map((c) => new THREE.Color(c))

const bkey = (b: { x: number; y: number; z: number }): string => `${b.x},${b.y},${b.z}`

/**
 * User-built blocks, one InstancedMesh per visual (plain bodies tinted per instance, grass
 * caps, flower dots, wood, water). Five draw calls whatever the number of blocks.
 */
export class BlockLayer {
  readonly group = new THREE.Group()
  private blocks: PlacedBlock[] = []
  private popStart = new Map<string, number>()
  private tops = new Map<string, number>()
  private now = 0
  private animUntil = -1
  private plain!: THREE.InstancedMesh
  private caps!: THREE.InstancedMesh
  private dots!: THREE.InstancedMesh
  private wood!: THREE.InstancedMesh
  private water!: THREE.InstancedMesh
  private capacity = 0
  private readonly geos: THREE.BufferGeometry[]
  private readonly mats: THREE.Material[]
  private readonly woodTex: THREE.CanvasTexture
  /** All water blocks as one seamless body: no walls between neighbours, one surface. */
  private readonly pond: THREE.Mesh
  private readonly pondMat: THREE.MeshLambertMaterial

  constructor() {
    this.group.name = 'blocks'
    const body = new RoundedBoxGeometry(1, 1, 1, 2, 0.09)
    body.translate(0, 0.5, 0)
    const cap = new RoundedBoxGeometry(1.02, 0.26, 1.02, 2, 0.1)
    cap.translate(0, 1 - 0.13 + 0.006, 0)
    const dot = new THREE.SphereGeometry(0.065, 8, 6)
    dot.scale(1, 0.7, 1)
    const waterGeo = new RoundedBoxGeometry(0.98, WATER_BLOCK_H, 0.98, 2, 0.1)
    waterGeo.translate(0, WATER_BLOCK_H / 2, 0)
    this.geos = [body, cap, dot, waterGeo]

    this.woodTex = makeWoodTexture()
    this.mats = [
      new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      new THREE.MeshLambertMaterial({ color: COLORS.grass }),
      new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      new THREE.MeshLambertMaterial({ color: '#ffffff', map: this.woodTex }),
      new THREE.MeshLambertMaterial({
        color: '#8fd0ee',
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    ]
    this.allocate(32)
    this.pondMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.pond = new THREE.Mesh(new THREE.BufferGeometry(), this.pondMat)
    this.pond.renderOrder = 2
    this.pond.receiveShadow = true
    this.group.add(this.pond)
  }

  /**
   * Builds the water body: a top face per water block, and side faces only
   * where the neighbour on that layer is not water, so a row of water blocks
   * reads as one pond.
   */
  private rebuildPond(): void {
    const water = new Set(this.blocks.filter((b) => b.type === 'water').map(bkey))
    const pos: number[] = []
    const col: number[] = []
    const top = new THREE.Color('#a6def4')
    const side = new THREE.Color('#7ec4e8')
    const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
      for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b)
    }
    for (const b of this.blocks) {
      if (b.type !== 'water') continue
      const x0 = b.x
      const x1 = b.x + 1
      const z0 = b.z
      const z1 = b.z + 1
      const y0 = b.y
      // A water block with water on top of it fills up to the next layer.
      const y1 = water.has(bkey({ x: b.x, y: b.y + 1, z: b.z })) ? b.y + 1 : b.y + WATER_BLOCK_H
      if (y1 < b.y + 1) quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top)
      const open = (dx: number, dz: number) => !water.has(bkey({ x: b.x + dx, y: b.y, z: b.z + dz }))
      if (open(-1, 0)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side)
      if (open(1, 0)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side)
      if (open(0, -1)) quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side)
      if (open(0, 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.computeVertexNormals()
    this.pond.geometry.dispose()
    this.pond.geometry = geo
    this.pond.visible = pos.length > 0
  }

  private allocate(cap: number): void {
    for (const mesh of [this.plain, this.caps, this.dots, this.wood, this.water]) {
      if (mesh) {
        this.group.remove(mesh)
        mesh.dispose()
      }
    }
    const [body, capGeo, dot, waterGeo] = this.geos
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, n)
      m.count = 0
      m.castShadow = shadow
      m.receiveShadow = true
      m.frustumCulled = false
      this.group.add(m)
      return m
    }
    this.capacity = cap
    this.plain = mk(body, this.mats[0], cap)
    this.caps = mk(capGeo, this.mats[1], cap, false)
    this.dots = mk(dot, this.mats[2], cap * 5, false)
    this.wood = mk(body, this.mats[3], cap)
    this.water = mk(waterGeo, this.mats[4], cap, false)
    // instanceColor buffers must exist before the first render
    const white = new THREE.Color(1, 1, 1)
    this.plain.setColorAt(0, white)
    this.dots.setColorAt(0, white)
  }

  set(blocks: PlacedBlock[], now: number): void {
    const before = new Set(this.blocks.map(bkey))
    const seen = new Set<string>()
    this.blocks = []
    for (const b of blocks) {
      const k = bkey(b)
      if (seen.has(k)) continue
      seen.add(k)
      this.blocks.push({ ...b })
      if (before.size && !before.has(k)) {
        this.popStart.set(k, now)
        this.animUntil = now + POP_DUR
      }
    }
    for (const k of [...this.popStart.keys()]) if (!seen.has(k)) this.popStart.delete(k)
    this.tops.clear()
    for (const b of this.blocks) {
      const top = b.y + (b.type === 'water' ? WATER_BLOCK_H : 1)
      const ck = `${b.x},${b.z}`
      this.tops.set(ck, Math.max(this.tops.get(ck) ?? 0, top))
    }
    if (this.blocks.length > this.capacity) {
      let c = this.capacity
      while (c < this.blocks.length) c *= 2
      this.allocate(c)
    }
    this.rebuildPond()
    this.now = now
    this.write()
  }

  /** Top surface height of the column (0 = bare ground). */
  heightAt(x: number, z: number): number {
    return this.tops.get(`${x},${z}`) ?? 0
  }

  /** Highest block surface, for camera framing. */
  forEachColumn(fn: (x: number, z: number, top: number) => void): void {
    for (const [k, top] of this.tops) {
      const [x, z] = k.split(',').map(Number)
      fn(x, z, top)
    }
  }

  update(t: number): void {
    this.now = t
    if (t > this.animUntil + 0.05) {
      if (this.popStart.size) {
        this.popStart.clear()
        this.write()
      }
      return
    }
    this.write()
  }

  private write(): void {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    let np = 0
    let nc = 0
    let nd = 0
    let nw = 0
    let nwa = 0
    for (const b of this.blocks) {
      const k = bkey(b)
      const ps = this.popStart.get(k)
      let sc = 1
      if (ps !== undefined) sc = 0.35 + 0.65 * easeOutBack(clamp01((this.now - ps) / POP_DUR), 2.2)
      m.makeScale(sc, sc, sc).setPosition(b.x + 0.5, b.y, b.z + 0.5)
      switch (b.type) {
        case 'gras':
        case 'bloemen':
          c.copy(COLORS.dirt)
          this.plain.setMatrixAt(np, m)
          this.plain.setColorAt(np++, c)
          this.caps.setMatrixAt(nc++, m)
          if (b.type === 'bloemen') {
            for (let i = 0; i < 5; i++) {
              const a = hash2(b.x * 7 + b.y, b.z, 60 + i)
              const bb = hash2(b.x, b.z * 5 + b.y, 70 + i)
              const dm = new THREE.Matrix4().makeTranslation(
                (0.18 + a * 0.64 - 0.5) * sc,
                (1.02 + 0.02) * sc,
                (0.18 + bb * 0.64 - 0.5) * sc,
              )
              dm.premultiply(new THREE.Matrix4().makeTranslation(b.x + 0.5, b.y, b.z + 0.5))
              this.dots.setMatrixAt(nd, dm)
              this.dots.setColorAt(nd++, FLOWER_COLORS[(i + Math.floor(a * 5)) % FLOWER_COLORS.length])
            }
          }
          break
        case 'zand':
        case 'steen':
          c.copy(COLORS[b.type]).offsetHSL(0, 0, (hash2(b.x, b.z, b.y) - 0.5) * 0.04)
          this.plain.setMatrixAt(np, m)
          this.plain.setColorAt(np++, c)
          break
        case 'hout':
          this.wood.setMatrixAt(nw++, m)
          break
        case 'water':
          // Drawn as one seamless pond, see rebuildPond.
          break
      }
    }
    this.plain.count = np
    this.caps.count = nc
    this.dots.count = nd
    this.wood.count = nw
    this.water.count = nwa
    for (const mesh of [this.plain, this.caps, this.dots, this.wood, this.water]) markInstances(mesh)
  }

  dispose(): void {
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
    this.woodTex.dispose()
    this.pond.geometry.dispose()
    this.pondMat.dispose()
    for (const mesh of [this.plain, this.caps, this.dots, this.wood, this.water]) mesh.dispose()
  }
}

function makeWoodTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  g.fillStyle = '#d9a46c'
  g.fillRect(0, 0, 128, 128)
  // soft grain
  g.globalAlpha = 0.18
  g.strokeStyle = '#b98352'
  g.lineWidth = 1.5
  for (let i = 0; i < 14; i++) {
    const y = 4 + i * 9 + (i % 3)
    g.beginPath()
    g.moveTo(0, y)
    g.bezierCurveTo(40, y + 2, 80, y - 2, 128, y + 1)
    g.stroke()
  }
  // plank seams
  g.globalAlpha = 0.55
  g.strokeStyle = '#a8713f'
  g.lineWidth = 2.5
  for (let i = 1; i < 4; i++) {
    g.beginPath()
    g.moveTo(0, i * 32)
    g.lineTo(128, i * 32)
    g.stroke()
  }
  g.globalAlpha = 0.4
  for (let i = 0; i < 4; i++) {
    const x = ((i * 53) % 100) + 14
    g.beginPath()
    g.moveTo(x, i * 32)
    g.lineTo(x, i * 32 + 32)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
