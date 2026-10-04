import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp01, easeOutBack } from './tween'

/** Furniture placed on the island. `rot` is a number of quarter turns (0..3). */
export interface PlacedProp {
  x: number
  z: number
  y: number
  type: string
  rot?: number
}

export const PROP_TYPES = [
  'mand',
  'krabpaal',
  'voerbak',
  'lantaarn',
  'bankje',
  'boompje',
  'hek',
  'vuurtoren',
  'hartjeslamp',
  'eenhoorn',
  'hemelbed',
  'regenboogboog',
  'lollyboom',
  'kasteeltoren',
] as const

/** Approximate heights, used for camera framing. */
export const PROP_HEIGHT: Record<string, number> = {
  mand: 0.3,
  krabpaal: 1.0,
  voerbak: 0.15,
  lantaarn: 0.95,
  bankje: 0.55,
  boompje: 1.1,
  hek: 0.45,
  vuurtoren: 2.3,
  hartjeslamp: 1.0,
  eenhoorn: 1.0,
  hemelbed: 1.15,
  regenboogboog: 0.6,
  lollyboom: 1.2,
  kasteeltoren: 1.75,
}

const POP_DUR = 0.35

// shared materials ---------------------------------------------------------
const matCache = new Map<string, THREE.MeshLambertMaterial>()
function mat(color: string): THREE.MeshLambertMaterial {
  let m = matCache.get(color)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color })
    matCache.set(color, m)
  }
  return m
}

/** Lamp glass: emissive, glow strength driven by mood. */
const lampMat = new THREE.MeshLambertMaterial({ color: '#fff4c8', emissive: '#ffcf6e', emissiveIntensity: 0.6 })
/** Heart lamp glass: soft pink glow. */
const heartMat = new THREE.MeshLambertMaterial({ color: '#ffd3e6', emissive: '#ff8fc0', emissiveIntensity: 0.5 })
/** Pastel rainbow bands, outside to inside. */
const RAINBOW = ['#ffb3c1', '#ffd3a8', '#fff1a8', '#c4ecb8', '#b8dcfa', '#d6c4fa']

let glowTex: THREE.CanvasTexture | null = null
function getGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,236,170,1)')
  grd.addColorStop(0.35, 'rgba(255,206,120,0.55)')
  grd.addColorStop(1, 'rgba(255,190,110,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(cv)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}
const glowMat = new THREE.SpriteMaterial({
  map: getGlowTextureLazy(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.3,
})
function getGlowTextureLazy(): THREE.Texture | null {
  return typeof document === 'undefined' ? null : getGlowTexture()
}
const beamMat = new THREE.MeshBasicMaterial({
  color: '#fff1c4',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
})

// geometry helpers -----------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>()
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}
const rbox = (w: number, h: number, d: number, r: number) =>
  geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r))
const cyl = (rt: number, rb: number, h: number, seg = 16) =>
  geo(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
const sphere = (r: number, ws = 16, hs = 12) => geo(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs))

function add(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function glow(parent: THREE.Object3D, y: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(glowMat)
  s.position.set(0, y, 0)
  s.scale.set(size, size, size)
  s.renderOrder = 5
  parent.add(s)
  return s
}

// builders --------------------------------------------------------------------
function buildMand(g: THREE.Group): void {
  const wicker = mat('#d8a26a')
  const bottom = add(g, cyl(0.36, 0.32, 0.12, 20), wicker, 0, 0.06, 0)
  bottom.receiveShadow = true
  const rim = new THREE.Mesh(geo('mand-rim', () => new THREE.TorusGeometry(0.34, 0.07, 10, 24)), mat('#e6b47c'))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.16
  rim.castShadow = true
  g.add(rim)
  const cushion = add(g, sphere(0.3), mat('#f7b8c8'), 0, 0.13, 0)
  cushion.scale.set(1, 0.22, 1)
}

function buildKrabpaal(g: THREE.Group): void {
  add(g, rbox(0.62, 0.1, 0.62, 0.04), mat('#c9b3e6'), 0, 0.05, 0)
  add(g, cyl(0.1, 0.1, 0.7, 12), mat('#ead2a8'), 0, 0.45, 0)
  // rope rings
  for (let i = 0; i < 4; i++) add(g, cyl(0.108, 0.108, 0.03, 12), mat('#d6b788'), 0, 0.22 + i * 0.15, 0, false)
  add(g, rbox(0.46, 0.09, 0.46, 0.04), mat('#c9b3e6'), 0, 0.84, 0)
  // dangling toy ball
  add(g, cyl(0.006, 0.006, 0.22, 4), mat('#8a7a70'), 0.18, 0.69, 0.18, false)
  add(g, sphere(0.055, 10, 8), mat('#ff9ec0'), 0.18, 0.56, 0.18)
}

function buildVoerbak(g: THREE.Group): void {
  add(g, cyl(0.22, 0.17, 0.12, 20), mat('#9fd3e8'), 0, 0.06, 0)
  add(g, cyl(0.18, 0.18, 0.02, 20), mat('#b07a52'), 0, 0.115, 0, false)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1
    add(g, sphere(0.035, 6, 5), mat('#c48a5a'), Math.cos(a) * 0.09, 0.13, Math.sin(a) * 0.09, false)
  }
}

function buildLantaarn(g: THREE.Group): THREE.Sprite {
  const dark = mat('#7c6a8a')
  add(g, cyl(0.12, 0.14, 0.06, 10), dark, 0, 0.03, 0)
  add(g, cyl(0.035, 0.035, 0.55, 8), dark, 0, 0.33, 0)
  add(g, rbox(0.2, 0.22, 0.2, 0.04), lampMat, 0, 0.71, 0)
  const roof = add(g, cyl(0.0, 0.17, 0.12, 4), dark, 0, 0.88, 0)
  roof.rotation.y = Math.PI / 4
  add(g, sphere(0.03, 8, 6), dark, 0, 0.95, 0)
  return glow(g, 0.71, 1.0)
}

function buildBankje(g: THREE.Group): void {
  const wood = mat('#e3a978')
  const legs = mat('#b98b6a')
  add(g, rbox(0.8, 0.07, 0.3, 0.03), wood, 0, 0.3, 0.02)
  add(g, rbox(0.8, 0.18, 0.05, 0.025), wood, 0, 0.47, -0.13)
  for (const sx of [-0.33, 0.33]) {
    add(g, rbox(0.06, 0.28, 0.24, 0.02), legs, sx, 0.14, 0.02)
    add(g, rbox(0.05, 0.22, 0.05, 0.02), legs, sx, 0.38, -0.13)
  }
}

function buildBoompje(g: THREE.Group): void {
  add(g, cyl(0.06, 0.09, 0.42, 8), mat('#b98b6a'), 0, 0.21, 0)
  const leaf = mat('#8fd18a')
  const leaf2 = mat('#a5dc8e')
  add(g, sphere(0.34), leaf, 0, 0.66, 0)
  add(g, sphere(0.22), leaf2, 0.17, 0.82, 0.08)
  add(g, sphere(0.2), leaf2, -0.15, 0.78, -0.1)
  add(g, sphere(0.17), leaf, 0.02, 0.95, -0.05)
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2 + 0.4
    add(g, sphere(0.04, 8, 6), mat('#ff9ec0'), Math.cos(a) * 0.3, 0.62 + i * 0.07, Math.sin(a) * 0.3, false)
  }
}

function buildHek(g: THREE.Group): void {
  const white = mat('#fbf3ea')
  for (const x of [-0.4, 0, 0.4]) {
    add(g, rbox(0.09, 0.42, 0.09, 0.03), white, x, 0.21, 0)
    const tip = add(g, cyl(0, 0.064, 0.08, 4), white, x, 0.46, 0)
    tip.rotation.y = Math.PI / 4
  }
  add(g, rbox(0.96, 0.06, 0.05, 0.02), white, 0, 0.3, 0)
  add(g, rbox(0.96, 0.06, 0.05, 0.02), white, 0, 0.14, 0)
}

function buildVuurtoren(g: THREE.Group): { glow: THREE.Sprite; beam: THREE.Object3D } {
  const red = mat('#f28a8a')
  const white = mat('#fff7f0')
  add(g, cyl(0.42, 0.45, 0.14, 20), mat('#c9c5cf'), 0, 0.07, 0)
  const segs = 4
  const h = 1.4
  for (let i = 0; i < segs; i++) {
    const r0 = 0.36 - (0.12 * i) / segs
    const r1 = 0.36 - (0.12 * (i + 1)) / segs
    add(g, cyl(r1, r0, h / segs, 20), i % 2 ? white : red, 0, 0.14 + (h / segs) * (i + 0.5), 0)
  }
  const topY = 0.14 + h
  add(g, cyl(0.34, 0.34, 0.06, 20), white, 0, topY + 0.03, 0)
  // railing
  const rail = new THREE.Mesh(geo('vt-rail', () => new THREE.TorusGeometry(0.31, 0.015, 6, 24)), red)
  rail.rotation.x = Math.PI / 2
  rail.position.y = topY + 0.16
  g.add(rail)
  add(g, cyl(0.17, 0.17, 0.3, 14), lampMat, 0, topY + 0.21, 0)
  add(g, cyl(0.0, 0.25, 0.26, 14), red, 0, topY + 0.49, 0)
  add(g, sphere(0.045, 8, 6), white, 0, topY + 0.64, 0)
  const gl = glow(g, topY + 0.22, 1.6)
  // slowly turning light beams
  const beam = new THREE.Group()
  beam.position.y = topY + 0.21
  const cone = geo('vt-beam', () => {
    const c = new THREE.ConeGeometry(0.16, 1.7, 16, 1, true)
    c.translate(0, -0.85, 0)
    c.rotateZ(Math.PI / 2)
    return c
  })
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(cone, beamMat)
    m.scale.x = s
    m.renderOrder = 6
    beam.add(m)
  }
  g.add(beam)
  return { glow: gl, beam }
}

function buildHartjeslamp(g: THREE.Group): THREE.Sprite {
  const post = mat('#f4b6d2')
  add(g, cyl(0.13, 0.15, 0.06, 12), post, 0, 0.03, 0)
  add(g, cyl(0.03, 0.03, 0.56, 8), post, 0, 0.34, 0)
  add(g, sphere(0.04, 8, 6), mat('#fff1a0'), 0, 0.63, 0)
  // heart: two round lobes and a point, flattened front to back
  const heart = new THREE.Group()
  heart.position.y = 0.8
  heart.scale.set(1, 1, 0.6)
  g.add(heart)
  add(heart, sphere(0.1, 12, 10), heartMat, -0.075, 0.04, 0)
  add(heart, sphere(0.1, 12, 10), heartMat, 0.075, 0.04, 0)
  const tip = add(heart, cyl(0.158, 0.0, 0.2, 4), heartMat, 0, -0.07, 0)
  tip.rotation.y = Math.PI / 4
  tip.scale.set(1, 1, 0.75)
  return glow(g, 0.8, 1.0)
}

function buildEenhoorn(g: THREE.Group): void {
  const white = mat('#fffaff')
  const hoof = mat('#d6c4fa')
  add(g, rbox(0.62, 0.12, 0.36, 0.05), mat('#d7c6f7'), 0, 0.06, 0)
  // body and legs
  const body = add(g, sphere(0.2, 14, 10), white, 0, 0.46, 0)
  body.scale.set(1.35, 0.9, 0.85)
  for (const [x, z] of [
    [-0.16, -0.09],
    [-0.16, 0.09],
    [0.16, -0.09],
    [0.16, 0.09],
  ]) {
    add(g, cyl(0.045, 0.045, 0.26, 8), white, x, 0.25, z)
    add(g, cyl(0.05, 0.05, 0.05, 8), hoof, x, 0.145, z)
  }
  // neck, head, snout, ears
  const neck = add(g, cyl(0.08, 0.1, 0.24, 10), white, 0.22, 0.62, 0)
  neck.rotation.z = -0.5
  add(g, sphere(0.12, 12, 10), white, 0.3, 0.77, 0)
  const snout = add(g, sphere(0.08, 10, 8), mat('#ffe3ef'), 0.4, 0.73, 0)
  snout.scale.set(1.1, 0.85, 0.9)
  for (const z of [-0.06, 0.06]) add(g, cyl(0.0, 0.035, 0.08, 6), white, 0.26, 0.9, z)
  for (const z of [-0.075, 0.075]) add(g, sphere(0.018, 6, 5), mat('#5a4a6a'), 0.37, 0.8, z, false)
  // golden horn
  const horn = add(g, cyl(0.0, 0.035, 0.2, 8), mat('#ffd76a'), 0.34, 0.95, 0)
  horn.rotation.z = -0.35
  // rainbow mane and tail
  RAINBOW.forEach((c, i) => {
    add(g, sphere(0.05, 8, 6), mat(c), 0.22 - i * 0.045, 0.86 - i * 0.055, 0, false)
  })
  RAINBOW.forEach((c, i) => {
    if (i % 2) return
    add(g, sphere(0.055, 8, 6), mat(c), -0.29 - i * 0.015, 0.5 - i * 0.05, 0, false)
  })
}

function buildHemelbed(g: THREE.Group): void {
  const frame = mat('#f4b6d2')
  const canopy = mat('#d7c6f7')
  add(g, rbox(0.62, 0.14, 0.86, 0.04), frame, 0, 0.12, 0)
  add(g, rbox(0.56, 0.1, 0.8, 0.04), mat('#fffaf6'), 0, 0.23, 0)
  add(g, rbox(0.58, 0.06, 0.5, 0.03), mat('#ffc4dc'), 0, 0.29, 0.13)
  add(g, rbox(0.36, 0.08, 0.16, 0.04), mat('#ffffff'), 0, 0.31, -0.28)
  add(g, rbox(0.62, 0.3, 0.06, 0.03), frame, 0, 0.3, -0.42)
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.4, 0.4]) {
      add(g, cyl(0.025, 0.025, 1.0, 8), frame, x, 0.5, z)
      add(g, sphere(0.04, 8, 6), mat('#fff1a0'), x, 1.02, z, false)
    }
  }
  add(g, rbox(0.66, 0.05, 0.9, 0.02), canopy, 0, 0.98, 0)
  // soft drapes at the corners
  for (const x of [-0.29, 0.29]) {
    for (const z of [-0.36, 0.36]) {
      const d = add(g, cyl(0.03, 0.07, 0.42, 8), canopy, x, 0.76, z, false)
      d.scale.set(1, 1, 0.5)
    }
  }
  add(g, sphere(0.05, 8, 6), mat('#ff9ec0'), 0, 1.05, 0)
}

function buildRegenboogboog(g: THREE.Group): void {
  RAINBOW.forEach((c, i) => {
    const r = 0.38 - i * 0.05
    const arc = new THREE.Mesh(geo(`rb-arc${i}`, () => new THREE.TorusGeometry(r, 0.028, 8, 28, Math.PI)), mat(c))
    arc.position.y = 0.1
    arc.castShadow = true
    g.add(arc)
  })
  // a fluffy cloud at each foot
  const cloud = mat('#ffffff')
  for (const sx of [-1, 1]) {
    const x = sx * 0.26
    add(g, sphere(0.1, 10, 8), cloud, x, 0.09, 0)
    add(g, sphere(0.075, 10, 8), cloud, x - 0.1, 0.06, 0.03)
    add(g, sphere(0.075, 10, 8), cloud, x + 0.1, 0.06, -0.02)
    add(g, sphere(0.06, 8, 6), cloud, x, 0.05, 0.1)
  }
}

function buildLollyboom(g: THREE.Group): void {
  // candy-striped trunk
  for (let i = 0; i < 5; i++) add(g, cyl(0.06, 0.065, 0.09, 10), mat(i % 2 ? '#ffffff' : '#ff9ec0'), 0, 0.045 + i * 0.09, 0)
  add(g, sphere(0.3, 14, 10), mat('#ffc4dc'), 0, 0.68, 0)
  add(g, sphere(0.2, 12, 10), mat('#bfeedd'), 0.2, 0.8, 0.06)
  add(g, sphere(0.19, 12, 10), mat('#d7c6f7'), -0.18, 0.78, -0.08)
  add(g, sphere(0.16, 12, 10), mat('#fff1a0'), 0.02, 0.92, -0.04)
  // sprinkles
  const sprinkles = ['#ff8fb8', '#8fd0ee', '#ffd76a', '#a6dc8c', '#c9b3ff', '#ffb98a']
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4
    const y = 0.6 + (i % 4) * 0.08
    add(g, sphere(0.025, 6, 5), mat(sprinkles[i % sprinkles.length]), Math.cos(a) * 0.29, y, Math.sin(a) * 0.29, false)
  }
  // a lollipop on top
  add(g, cyl(0.012, 0.012, 0.18, 6), mat('#ffffff'), 0, 1.1, 0, false)
  const pop = new THREE.Group()
  pop.position.y = 1.2
  g.add(pop)
  RAINBOW.slice(0, 4).forEach((c, i) => {
    const disc = add(pop, cyl(0.11 - i * 0.025, 0.11 - i * 0.025, 0.035 + i * 0.006, 16), mat(c), 0, 0, 0, i === 0)
    disc.rotation.x = Math.PI / 2
  })
}

function buildKasteeltoren(g: THREE.Group): void {
  const pink = mat('#f7c6dc')
  const light = mat('#ffe3ef')
  const roof = mat('#c9b3ff')
  add(g, cyl(0.36, 0.38, 0.1, 18), mat('#e9dff5'), 0, 0.05, 0)
  add(g, cyl(0.28, 0.31, 0.95, 18), pink, 0, 0.57, 0)
  add(g, cyl(0.33, 0.33, 0.08, 18), light, 0, 1.08, 0)
  // battlements
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const b = add(g, rbox(0.09, 0.1, 0.07, 0.02), light, Math.cos(a) * 0.3, 1.17, Math.sin(a) * 0.3)
    b.rotation.y = -a
  }
  add(g, cyl(0.0, 0.3, 0.42, 18), roof, 0, 1.4, 0)
  add(g, sphere(0.04, 8, 6), mat('#ffd76a'), 0, 1.62, 0)
  // flag
  add(g, cyl(0.01, 0.01, 0.2, 5), mat('#8a7a90'), 0, 1.72, 0, false)
  add(g, rbox(0.14, 0.08, 0.015, 0.005), mat('#ff9ec0'), 0.075, 1.78, 0, false)
  // door and windows on the front (+z)
  add(g, rbox(0.16, 0.26, 0.06, 0.05), mat('#c48ab0'), 0, 0.23, 0.29)
  add(g, rbox(0.1, 0.13, 0.05, 0.04), mat('#b8dcfa'), 0, 0.72, 0.28)
  add(g, sphere(0.035, 8, 6), mat('#ff9ec0'), 0, 0.88, 0.29, false)
}

/** Builds a prop. Static parts are merged into one vertex-coloured mesh (one draw call). */
export function buildProp(type: string): THREE.Group {
  const g = buildRaw(type)
  g.updateMatrixWorld(true)
  const statics: THREE.Mesh[] = []
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.material !== lampMat && m.material !== heartMat && m.material !== beamMat && m.material instanceof THREE.MeshLambertMaterial) {
      statics.push(m)
    }
  })
  let merged = mergedCache.get(type)
  if (!merged) {
    const parts = statics.map((m) => {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      geo.applyMatrix4(m.matrixWorld)
      const keep = new THREE.BufferGeometry()
      keep.setAttribute('position', geo.getAttribute('position'))
      keep.setAttribute('normal', geo.getAttribute('normal'))
      const n = geo.getAttribute('position').count
      const col = (m.material as THREE.MeshLambertMaterial).color
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        arr[i * 3] = col.r
        arr[i * 3 + 1] = col.g
        arr[i * 3 + 2] = col.b
      }
      keep.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      geo = keep
      return geo
    })
    merged = parts.length ? mergeGeometries(parts) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry()
    mergedCache.set(type, merged)
  }
  for (const m of statics) m.removeFromParent()
  const mesh = new THREE.Mesh(merged, propMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  g.add(mesh)
  return g
}

const mergedCache = new Map<string, THREE.BufferGeometry>()
const propMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })

function buildRaw(type: string): THREE.Group {
  const g = new THREE.Group()
  g.name = `prop-${type}`
  switch (type) {
    case 'mand':
      buildMand(g)
      break
    case 'krabpaal':
      buildKrabpaal(g)
      break
    case 'voerbak':
      buildVoerbak(g)
      break
    case 'lantaarn':
      g.userData.glow = buildLantaarn(g)
      break
    case 'bankje':
      buildBankje(g)
      break
    case 'boompje':
      buildBoompje(g)
      break
    case 'hek':
      buildHek(g)
      break
    case 'hartjeslamp':
      g.userData.glow = buildHartjeslamp(g)
      break
    case 'eenhoorn':
      buildEenhoorn(g)
      break
    case 'hemelbed':
      buildHemelbed(g)
      break
    case 'regenboogboog':
      buildRegenboogboog(g)
      break
    case 'lollyboom':
      buildLollyboom(g)
      break
    case 'kasteeltoren':
      buildKasteeltoren(g)
      break
    case 'vuurtoren': {
      const r = buildVuurtoren(g)
      g.userData.glow = r.glow
      g.userData.beam = r.beam
      break
    }
    default:
      // unknown prop: a small gift box so it is at least visible
      add(g, rbox(0.4, 0.34, 0.4, 0.05), mat('#f7b8c8'), 0, 0.17, 0)
      add(g, rbox(0.42, 0.06, 0.1, 0.02), mat('#fff1a0'), 0, 0.3, 0)
  }
  return g
}

const pkey = (p: PlacedProp): string => `${p.type}@${p.x},${p.y},${p.z}`

interface PropEntry {
  key: string
  prop: PlacedProp
  obj: THREE.Group
  pop: number
  /** Quarter turns counted up, so turning 3 -> 0 keeps spinning forward. */
  turns: number
}

export class PropLayer {
  readonly group = new THREE.Group()
  private entries = new Map<string, PropEntry>()
  private glowK = 0

  constructor() {
    this.group.name = 'props'
  }

  set(props: PlacedProp[], now: number): void {
    const next = new Map<string, PropEntry>()
    const firstFill = this.entries.size === 0
    for (const p of props) {
      const k = pkey(p)
      if (next.has(k)) continue
      let e = this.entries.get(k)
      if (!e) {
        const obj = buildProp(p.type)
        obj.position.set(p.x + 0.5, p.y, p.z + 0.5)
        obj.rotation.y = ((p.rot ?? 0) * Math.PI) / 2
        this.group.add(obj)
        const turns = p.rot ?? 0
        e = { key: k, prop: { ...p }, obj, pop: firstFill ? -1e9 : now, turns }
      } else if ((e.prop.rot ?? 0) !== (p.rot ?? 0)) {
        // Turned by a tap: count the quarter turns forward.
        e.turns += ((((p.rot ?? 0) - (e.prop.rot ?? 0)) % 4) + 4) % 4
        e.prop = { ...p }
      }
      next.set(k, e)
    }
    for (const [k, e] of this.entries) {
      if (!next.has(k)) this.group.remove(e.obj)
    }
    this.entries = next
  }

  /** Visit placed props (for camera framing / occupancy). */
  forEach(fn: (p: PlacedProp) => void): void {
    for (const e of this.entries.values()) fn(e.prop)
  }

  /** 0 = day (faint glow), 1 = sunset (warm glow). */
  setGlow(k: number): void {
    this.glowK = k
    lampMat.emissiveIntensity = 0.45 + 0.9 * k
    heartMat.emissiveIntensity = 0.4 + 0.7 * k
    glowMat.opacity = 0.1 + 0.5 * k
    beamMat.opacity = 0.07 * k
  }

  update(t: number): void {
    for (const e of this.entries.values()) {
      const k = clamp01((t - e.pop) / POP_DUR)
      const s = k >= 1 ? 1 : 0.3 + 0.7 * easeOutBack(k, 2.4)
      e.obj.scale.setScalar(s)
      const targetRot = (e.turns * Math.PI) / 2
      const dr = targetRot - e.obj.rotation.y
      e.obj.rotation.y = Math.abs(dr) < 0.002 ? targetRot : e.obj.rotation.y + dr * 0.22
      const beam = e.obj.userData.beam as THREE.Object3D | undefined
      if (beam) {
        beam.rotation.y = t * 0.8
        beam.visible = this.glowK > 0.02
      }
      const gl = e.obj.userData.glow as THREE.Sprite | undefined
      if (gl) {
        const flick = 1 + 0.04 * Math.sin(t * 7.3 + e.obj.position.x) + 0.03 * Math.sin(t * 11.1)
        const base = e.prop.type === 'vuurtoren' ? 1.2 : 0.8
        gl.scale.setScalar(base * (0.7 + 0.5 * this.glowK) * flick)
      }
    }
  }

  dispose(): void {
    this.group.clear()
    this.entries.clear()
  }
}
