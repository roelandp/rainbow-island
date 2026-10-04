import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * Animal neighbours built from primitives: soft, chunky, pastel toys.
 *
 * Hierarchy of every animal:
 *   root (owned by the scene: position / rotation)
 *     rig  (inner pivot at the feet: hop, bob, waddle roll)
 *       body pivot (breathing scale), head pivot, legs, ...
 *
 * Units: 1 = one island tile. Feet at y = 0, facing +Z.
 */

export type AnimalId = 'eend' | 'schildpad' | 'uil' | 'konijn' | 'kikker' | 'olifant'

export const ANIMAL_IDS: AnimalId[] = ['eend', 'schildpad', 'uil', 'konijn', 'kikker', 'olifant']

/** How the animal travels to the island. */
export const ANIMAL_TRAVEL: Record<AnimalId, 'swim' | 'boat' | 'fly' | 'hop'> = {
  eend: 'swim',
  schildpad: 'swim',
  kikker: 'swim',
  olifant: 'swim',
  uil: 'fly',
  konijn: 'boat',
}

export type AnimalState = 'idle' | 'swim' | 'walk' | 'fly' | 'happy' | 'talk'

/** Animated parts stored in group.userData.parts. Not every animal has every part. */
export interface AnimalParts {
  rig: THREE.Object3D
  body: THREE.Object3D
  head: THREE.Object3D
  eyes: THREE.Object3D[]
  jaw?: THREE.Object3D
  wingL?: THREE.Object3D
  wingR?: THREE.Object3D
  legL?: THREE.Object3D
  legR?: THREE.Object3D
  legFL?: THREE.Object3D
  legFR?: THREE.Object3D
  earL?: THREE.Object3D
  earR?: THREE.Object3D
  tail?: THREE.Object3D
  shell?: THREE.Object3D
  nose?: THREE.Object3D
  /** Trunk segments from the root to the tip, each a child pivot of the previous (elephant). */
  trunk?: THREE.Object3D[]
}

// ---------------------------------------------------------------------------
// Shared caches
// ---------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>()
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}

const sphereGeo = () => cachedGeo('sphere', () => new THREE.SphereGeometry(1, 16, 12))
const smallSphereGeo = () => cachedGeo('sphere-s', () => new THREE.SphereGeometry(1, 10, 8))
const hemiGeo = () =>
  cachedGeo('hemi', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2))
const coneGeo = () => cachedGeo('cone', () => new THREE.ConeGeometry(1, 1, 10))
/** Unit cylinder, thinner at the bottom: for tapering chains like the elephant's trunk. */
const taperGeo = () => cachedGeo('cyl-taper', () => new THREE.CylinderGeometry(1, 0.84, 1, 12))
const cylGeo = () => cachedGeo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 14))
const hexGeo = () => cachedGeo('hex', () => new THREE.CylinderGeometry(1, 1, 1, 6))
const smileGeo = (r: number, tube: number, arc: number) =>
  cachedGeo(`smile:${r}:${tube}:${arc}`, () => new THREE.TorusGeometry(r, tube, 5, 12, arc))
const capsuleGeo = (r: number, len: number) =>
  cachedGeo(`capsule:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10))
const roundBoxGeo = (w: number, h: number, d: number, r: number) =>
  cachedGeo(`rbox:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r))

const matCache = new Map<string, THREE.Material>()
function mat(hex: string, roughness = 0.8): THREE.Material {
  const key = `${hex}:${roughness}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0 })
    matCache.set(key, m)
  }
  return m
}
function basicMat(hex: string): THREE.Material {
  const key = `basic:${hex}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: hex })
    matCache.set(key, m)
  }
  return m
}

const EYE_BLACK = '#2a2230'
const BLUSH = '#f7a8b8'

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------

type V3 = [number, number, number]

function pivot(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  pos: V3,
  scale: V3 | number = 1,
  rot?: V3,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.position.set(pos[0], pos[1], pos[2])
  if (typeof scale === 'number') m.scale.setScalar(scale)
  else m.scale.set(scale[0], scale[1], scale[2])
  if (rot) m.rotation.set(rot[0], rot[1], rot[2])
  m.castShadow = true
  parent.add(m)
  return m
}

const _d = new THREE.Vector3()
const _n = new THREE.Vector3()

/**
 * Finds a point on the surface of an ellipsoid (centre c, radii r) in the direction given by
 * yaw (around Y, 0 = +Z) and pitch (up from horizontal), pushed out along the normal by `lift`.
 * Writes position + an orientation whose local +Z is the surface normal into `obj`.
 */
function stickTo(obj: THREE.Object3D, c: V3, r: V3, yaw: number, pitch: number, lift = 0): void {
  _d.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  const t = 1 / Math.sqrt((_d.x / r[0]) ** 2 + (_d.y / r[1]) ** 2 + (_d.z / r[2]) ** 2)
  const px = _d.x * t
  const py = _d.y * t
  const pz = _d.z * t
  _n.set(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2])).normalize()
  obj.position.set(c[0] + px + _n.x * lift, c[1] + py + _n.y * lift, c[2] + pz + _n.z * lift)
  // Local +Z along the normal, local +Y as close to world up as possible (no roll).
  obj.rotation.set(-Math.asin(Math.max(-1, Math.min(1, _n.y))), Math.atan2(_n.x, _n.z), 0, 'YXZ')
}

/** A flattened disc/patch lying on an ellipsoid surface (blush, belly, face disc). */
function patch(
  parent: THREE.Object3D,
  material: THREE.Material,
  c: V3,
  r: V3,
  yaw: number,
  pitch: number,
  size: V3,
  lift = 0,
): THREE.Mesh {
  const m = mesh(parent, sphereGeo(), material, [0, 0, 0], size)
  stickTo(m, c, r, yaw, pitch, lift)
  return m
}

/**
 * A glossy bead eye with a white highlight. Returns the eye pivot (scale.y is used for blinking).
 * With `sclera`, a white ball sits behind the pupil (frog).
 */
function eye(
  parent: THREE.Object3D,
  c: V3,
  r: V3,
  yaw: number,
  pitch: number,
  size: number,
  lift = 0,
  sclera = 0,
): THREE.Group {
  const g = new THREE.Group()
  parent.add(g)
  stickTo(g, c, r, yaw, pitch, lift)
  let front = 0
  if (sclera > 0) {
    mesh(g, smallSphereGeo(), mat('#ffffff', 0.5), [0, 0, 0], sclera)
    front = sclera * 0.55
  }
  mesh(g, smallSphereGeo(), mat(EYE_BLACK, 0.25), [0, 0, front], size)
  const hl = mesh(g, smallSphereGeo(), basicMat('#ffffff'), [size * 0.32, size * 0.38, front + size * 0.72], size * 0.32)
  hl.castShadow = false
  return g
}

/**
 * An open mouth that is squashed shut at rest (pivot scale.y ~ 0) and opened by animateAnimal
 * by scaling the pivot's y between 0.15 and 1.
 */
function mouthPivot(
  parent: THREE.Object3D,
  material: THREE.Material,
  c: V3,
  r: V3,
  yaw: number,
  pitch: number,
  size: V3,
  lift = 0,
): THREE.Group {
  const g = new THREE.Group()
  parent.add(g)
  stickTo(g, c, r, yaw, pitch, lift)
  const m = mesh(g, sphereGeo(), material, [0, 0, 0], size)
  m.castShadow = false
  g.scale.y = 0.001
  return g
}

/** A friendly smile: a lower torus arc on the face. */
function smile(
  parent: THREE.Object3D,
  c: V3,
  r: V3,
  pitch: number,
  radius: number,
  tube: number,
  lift = 0,
): THREE.Mesh {
  const m = mesh(parent, smileGeo(radius, tube, Math.PI * 0.8), mat(EYE_BLACK, 0.5), [0, 0, 0])
  stickTo(m, c, r, 0, pitch, lift)
  // Arc runs from angle 0..0.8PI; rotate so it hangs down centred.
  m.rotateZ(Math.PI + Math.PI * 0.1)
  m.castShadow = false
  return m
}

interface RestPose {
  o: THREE.Object3D
  p: THREE.Vector3
  q: THREE.Quaternion
  s: THREE.Vector3
}

function collectRest(parts: AnimalParts): RestPose[] {
  const out: RestPose[] = []
  const seen = new Set<THREE.Object3D>()
  const add = (o: THREE.Object3D | undefined) => {
    if (!o || seen.has(o)) return
    seen.add(o)
    out.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
  }
  for (const v of Object.values(parts)) {
    if (Array.isArray(v)) v.forEach(add)
    else add(v as THREE.Object3D)
  }
  return out
}

function finish(root: THREE.Group, id: AnimalId, parts: AnimalParts): THREE.Group {
  root.name = `animal-${id}`
  root.userData.id = id
  root.userData.parts = parts
  root.userData.rest = collectRest(parts)
  root.userData.phase = Math.random() * 10
  return root
}

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------

function buildDuck(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const YELLOW = mat('#ffe08a')
  const YELLOW_D = mat('#f7cf6a')
  const ORANGE = mat('#ffad5a', 0.6)

  const body = pivot(rig, 0, 0.05, 0)
  const bodyC: V3 = [0, 0.17, -0.02]
  const bodyR: V3 = [0.24, 0.19, 0.27]
  mesh(body, sphereGeo(), YELLOW, bodyC, bodyR)
  // perky tail
  const tail = pivot(body, 0, 0.22, -0.25)
  mesh(tail, coneGeo(), YELLOW, [0, 0.03, -0.03], [0.08, 0.15, 0.06], [-1.0, 0, 0])

  const wingL = pivot(body, 0.21, 0.24, -0.02)
  mesh(wingL, sphereGeo(), YELLOW_D, [0.02, -0.07, -0.03], [0.05, 0.11, 0.16], [0.2, 0, 0.15])
  const wingR = pivot(body, -0.21, 0.24, -0.02)
  mesh(wingR, sphereGeo(), YELLOW_D, [-0.02, -0.07, -0.03], [0.05, 0.11, 0.16], [0.2, 0, -0.15])

  const head = pivot(rig, 0, 0.34, 0.09)
  const hc: V3 = [0, 0.11, 0.02]
  const hr: V3 = [0.165, 0.155, 0.155]
  mesh(head, sphereGeo(), YELLOW, hc, hr)
  // tuft
  mesh(head, coneGeo(), YELLOW_D, [0, 0.29, 0.0], [0.035, 0.1, 0.035], [-0.3, 0, 0.0])
  mesh(head, coneGeo(), YELLOW_D, [0.035, 0.275, -0.01], [0.03, 0.08, 0.03], [-0.25, 0, -0.5])
  mesh(head, coneGeo(), YELLOW_D, [-0.035, 0.275, -0.01], [0.03, 0.08, 0.03], [-0.25, 0, 0.5])

  // beak: upper + lower (jaw)
  mesh(head, sphereGeo(), ORANGE, [0, 0.085, 0.185], [0.085, 0.032, 0.075])
  const jaw = pivot(head, 0, 0.068, 0.135)
  mesh(jaw, sphereGeo(), mat('#f59a48', 0.6), [0, -0.004, 0.045], [0.068, 0.022, 0.06])

  const eyes = [
    eye(head, hc, hr, 0.42, 0.22, 0.027, -0.006),
    eye(head, hc, hr, -0.42, 0.22, 0.027, -0.006),
  ]
  patch(head, mat(BLUSH), hc, hr, 0.75, -0.05, [0.04, 0.025, 0.012], -0.003)
  patch(head, mat(BLUSH), hc, hr, -0.75, -0.05, [0.04, 0.025, 0.012], -0.003)

  const legL = pivot(rig, 0.09, 0.08, 0.03)
  mesh(legL, cylGeo(), ORANGE, [0, -0.035, 0], [0.022, 0.07, 0.022])
  mesh(legL, sphereGeo(), ORANGE, [0, -0.065, 0.045], [0.06, 0.018, 0.08])
  const legR = pivot(rig, -0.09, 0.08, 0.03)
  mesh(legR, cylGeo(), ORANGE, [0, -0.035, 0], [0.022, 0.07, 0.022])
  mesh(legR, sphereGeo(), ORANGE, [0, -0.065, 0.045], [0.06, 0.018, 0.08])

  return finish(root, 'eend', { rig, body, head, eyes, jaw, wingL, wingR, legL, legR, tail })
}

function buildTurtle(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const SKIN = mat('#c8e6a0')
  const SHELL = mat('#8fd3b6')
  const SHELL_D = mat('#62b597')
  const PLATE = mat('#b5e6cf')

  const body = pivot(rig, 0, 0.0, 0)
  const shell = pivot(body, 0, 0.1, -0.02)
  const sc: V3 = [0, 0, 0]
  const sr: V3 = [0.3, 0.23, 0.34]
  mesh(shell, hemiGeo(), SHELL, sc, sr)
  // rim
  mesh(shell, cylGeo(), SHELL_D, [0, 0.0, 0], [0.32, 0.05, 0.36])
  // belly plate
  mesh(shell, sphereGeo(), mat('#f3e6b0'), [0, -0.02, 0], [0.27, 0.06, 0.31])
  // hexagon plates
  const plateAt = (yaw: number, pitch: number, size: number) => {
    const m = mesh(shell, hexGeo(), PLATE, [0, 0, 0], [size, 0.02, size])
    stickTo(m, sc, sr, yaw, pitch, 0.0)
    // hex axis is local Y; stickTo aligns local Z, so tip it over
    m.rotateX(Math.PI / 2)
  }
  plateAt(0, Math.PI / 2 - 0.001, 0.085)
  for (let i = 0; i < 6; i++) plateAt((i / 6) * Math.PI * 2 + Math.PI / 6, 0.62, 0.07)

  // head on a neck
  const head = pivot(rig, 0, 0.12, 0.27)
  mesh(head, capsuleGeo(0.055, 0.08), SKIN, [0, 0.03, 0.02], 1, [1.0, 0, 0])
  const hc: V3 = [0, 0.1, 0.11]
  const hr: V3 = [0.12, 0.11, 0.12]
  mesh(head, sphereGeo(), SKIN, hc, hr)
  const eyes = [
    eye(head, hc, hr, 0.42, 0.25, 0.025, -0.006),
    eye(head, hc, hr, -0.42, 0.25, 0.025, -0.006),
  ]
  smile(head, hc, hr, -0.1, 0.035, 0.008, -0.002)
  const mouth = mouthPivot(head, mat('#7a4a5a', 0.6), hc, hr, 0, -0.22, [0.028, 0.022, 0.01], -0.004)
  patch(head, mat(BLUSH), hc, hr, 0.75, 0.0, [0.03, 0.02, 0.01], -0.002)
  patch(head, mat(BLUSH), hc, hr, -0.75, 0.0, [0.03, 0.02, 0.01], -0.002)

  // flippers
  const leg = (x: number, z: number) => {
    const p = pivot(rig, x, 0.06, z)
    mesh(p, sphereGeo(), SKIN, [Math.sign(x) * 0.04, -0.005, Math.sign(z) * 0.02], [0.075, 0.05, 0.09])
    return p
  }
  const legFL = leg(0.22, 0.17)
  const legFR = leg(-0.22, 0.17)
  const legL = leg(0.21, -0.19)
  const legR = leg(-0.21, -0.19)
  const tail = pivot(rig, 0, 0.08, -0.34)
  mesh(tail, coneGeo(), SKIN, [0, 0, -0.03], [0.035, 0.08, 0.035], [-1.5, 0, 0])

  return finish(root, 'schildpad', {
    rig, body, head, eyes, jaw: mouth, legL, legR, legFL, legFR, tail, shell,
  })
}

function buildOwl(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const LILAC = mat('#b9a0d6')
  const LILAC_D = mat('#9c82c0')
  const CREAM = mat('#f3e6cf')
  const RIM = mat('#ffd98a', 0.6)
  const BEAK = mat('#f2a85a', 0.6)

  const body = pivot(rig, 0, 0.03, 0)
  const bc: V3 = [0, 0.22, 0]
  const br: V3 = [0.23, 0.24, 0.21]
  mesh(body, sphereGeo(), LILAC, bc, br)
  patch(body, CREAM, bc, br, 0, -0.15, [0.15, 0.17, 0.05], -0.025)
  // little feather chevrons on the belly
  for (const [x, y] of [[-0.05, 0.2], [0.05, 0.2], [0, 0.13]] as const) {
    patch(body, mat('#d9c6a8'), bc, br, x * 4, (y - 0.22) * 3.2, [0.022, 0.014, 0.01], 0.0)
  }

  const wingL = pivot(body, 0.2, 0.33, -0.01)
  mesh(wingL, sphereGeo(), LILAC_D, [0.025, -0.11, -0.01], [0.055, 0.15, 0.13], [0, 0, 0.12])
  const wingR = pivot(body, -0.2, 0.33, -0.01)
  mesh(wingR, sphereGeo(), LILAC_D, [-0.025, -0.11, -0.01], [0.055, 0.15, 0.13], [0, 0, -0.12])

  const tail = pivot(body, 0, 0.06, -0.18)
  mesh(tail, sphereGeo(), LILAC_D, [0, 0, -0.03], [0.09, 0.03, 0.08], [-0.5, 0, 0])

  const head = pivot(rig, 0, 0.42, 0)
  const hc: V3 = [0, 0.1, 0.01]
  const hr: V3 = [0.22, 0.18, 0.19]
  mesh(head, sphereGeo(), LILAC, hc, hr)
  // face disc + eye rims
  patch(head, CREAM, hc, hr, 0, -0.02, [0.18, 0.13, 0.05], -0.03)
  const eyes: THREE.Object3D[] = []
  for (const s of [1, -1]) {
    patch(head, RIM, hc, hr, s * 0.42, 0.06, [0.078, 0.078, 0.02], 0.014)
    patch(head, mat('#fffaf0', 0.6), hc, hr, s * 0.42, 0.06, [0.06, 0.06, 0.02], 0.022)
    eyes.push(eye(head, hc, hr, s * 0.42, 0.06, 0.042, 0.018))
  }
  const jaw = pivot(head, 0, 0.055, 0.19)
  mesh(jaw, coneGeo(), BEAK, [0, -0.02, 0.012], [0.036, 0.08, 0.034], [2.5, 0, 0])
  patch(head, mat(BLUSH), hc, hr, 0.85, -0.2, [0.035, 0.022, 0.01], -0.002)
  patch(head, mat(BLUSH), hc, hr, -0.85, -0.2, [0.035, 0.022, 0.01], -0.002)

  // ear tufts
  const earL = pivot(head, 0.12, 0.23, 0)
  mesh(earL, coneGeo(), LILAC_D, [0.015, 0.04, 0], [0.045, 0.1, 0.035], [0, 0, -0.45])
  const earR = pivot(head, -0.12, 0.23, 0)
  mesh(earR, coneGeo(), LILAC_D, [-0.015, 0.04, 0], [0.045, 0.1, 0.035], [0, 0, 0.45])

  const foot = (x: number) => {
    const p = pivot(rig, x, 0.03, 0.1)
    mesh(p, sphereGeo(), BEAK, [0, -0.005, 0.02], [0.045, 0.025, 0.05])
    mesh(p, smallSphereGeo(), BEAK, [x > 0 ? 0.025 : -0.025, -0.01, 0.06], 0.02)
    mesh(p, smallSphereGeo(), BEAK, [x > 0 ? -0.015 : 0.015, -0.01, 0.065], 0.02)
    return p
  }
  const legL = foot(0.08)
  const legR = foot(-0.08)

  return finish(root, 'uil', { rig, body, head, eyes, jaw, wingL, wingR, legL, legR, earL, earR, tail })
}

function buildRabbit(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const FUR = mat('#f4efe9')
  const WHITE = mat('#ffffff')
  const PINK = mat('#f6b8c4')
  const FUR_D = mat('#e7ddd3')

  const body = pivot(rig, 0, 0.02, 0)
  const bc: V3 = [0, 0.18, -0.01]
  const br: V3 = [0.2, 0.2, 0.22]
  mesh(body, sphereGeo(), FUR, bc, br)
  patch(body, WHITE, bc, br, 0, -0.1, [0.13, 0.14, 0.05], -0.03)
  const tail = pivot(body, 0, 0.1, -0.21)
  mesh(tail, smallSphereGeo(), WHITE, [0, 0, -0.02], 0.07)

  // big back feet + small front paws
  const legL = pivot(rig, 0.12, 0.05, 0.0)
  mesh(legL, sphereGeo(), FUR_D, [0, -0.01, 0.07], [0.065, 0.045, 0.12])
  const legR = pivot(rig, -0.12, 0.05, 0.0)
  mesh(legR, sphereGeo(), FUR_D, [0, -0.01, 0.07], [0.065, 0.045, 0.12])
  const legFL = pivot(rig, 0.075, 0.12, 0.15)
  mesh(legFL, sphereGeo(), FUR, [0, -0.04, 0.03], [0.045, 0.07, 0.05])
  const legFR = pivot(rig, -0.075, 0.12, 0.15)
  mesh(legFR, sphereGeo(), FUR, [0, -0.04, 0.03], [0.045, 0.07, 0.05])

  const head = pivot(rig, 0, 0.33, 0.04)
  const hc: V3 = [0, 0.13, 0.02]
  const hr: V3 = [0.185, 0.165, 0.17]
  mesh(head, sphereGeo(), FUR, hc, hr)
  // muzzle
  patch(head, WHITE, hc, hr, 0.2, -0.28, [0.05, 0.04, 0.045], -0.02)
  patch(head, WHITE, hc, hr, -0.2, -0.28, [0.05, 0.04, 0.045], -0.02)
  const nose = pivot(head)
  patch(nose, PINK, hc, hr, 0, -0.12, [0.03, 0.022, 0.025], 0.0)
  const mouth = mouthPivot(head, mat('#c46a80', 0.6), hc, hr, 0, -0.5, [0.025, 0.02, 0.01], 0.0)
  const eyes = [
    eye(head, hc, hr, 0.4, 0.12, 0.028, -0.006),
    eye(head, hc, hr, -0.4, 0.12, 0.028, -0.006),
  ]
  patch(head, mat(BLUSH), hc, hr, 0.72, -0.12, [0.04, 0.025, 0.012], -0.002)
  patch(head, mat(BLUSH), hc, hr, -0.72, -0.12, [0.04, 0.025, 0.012], -0.002)

  const ear = (s: number) => {
    const p = pivot(head, s * 0.07, 0.26, -0.01)
    p.rotation.set(-0.12, 0, -s * 0.18)
    mesh(p, capsuleGeo(0.05, 0.17), FUR, [0, 0.13, 0], [1, 1, 0.55])
    mesh(p, capsuleGeo(0.03, 0.13), PINK, [0, 0.13, 0.02], [1, 1, 0.4])
    return p
  }
  const earL = ear(1)
  const earR = ear(-1)

  return finish(root, 'konijn', {
    rig, body, head, eyes, jaw: mouth, legL, legR, legFL, legFR, earL, earR, tail, nose,
  })
}

function buildFrog(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const GREEN = mat('#9bd67a')
  const GREEN_D = mat('#84c463')
  const BELLY = mat('#d8f0b0')

  const body = pivot(rig, 0, 0.0, 0)
  const bc: V3 = [0, 0.15, -0.02]
  const br: V3 = [0.23, 0.15, 0.22]
  mesh(body, sphereGeo(), GREEN, bc, br)
  patch(body, BELLY, bc, br, 0, -0.25, [0.15, 0.1, 0.05], -0.03)

  // back legs (thigh + foot)
  const backLeg = (s: number) => {
    const p = pivot(rig, s * 0.19, 0.07, -0.05)
    mesh(p, sphereGeo(), GREEN_D, [s * 0.02, 0, 0], [0.08, 0.065, 0.12])
    mesh(p, sphereGeo(), GREEN_D, [s * 0.05, -0.055, 0.1], [0.06, 0.018, 0.075])
    return p
  }
  const legL = backLeg(1)
  const legR = backLeg(-1)
  const frontLeg = (s: number) => {
    const p = pivot(rig, s * 0.11, 0.1, 0.15)
    mesh(p, capsuleGeo(0.03, 0.06), GREEN, [0, -0.04, 0.01], 1, [0.2, 0, 0])
    mesh(p, sphereGeo(), GREEN_D, [s * 0.01, -0.09, 0.04], [0.045, 0.015, 0.05])
    return p
  }
  const legFL = frontLeg(1)
  const legFR = frontLeg(-1)

  const head = pivot(rig, 0, 0.2, 0.02)
  const hc: V3 = [0, 0.08, 0.03]
  const hr: V3 = [0.24, 0.12, 0.2]
  mesh(head, sphereGeo(), GREEN, hc, hr)
  // eye bumps on top
  const eyes: THREE.Object3D[] = []
  for (const s of [1, -1]) {
    const bump: V3 = [s * 0.12, 0.17, 0.08]
    const bumpR: V3 = [0.075, 0.07, 0.07]
    mesh(head, sphereGeo(), GREEN, bump, bumpR)
    eyes.push(eye(head, bump, bumpR, s * 0.25, 0.25, 0.03, -0.035, 0.05))
  }
  smile(head, hc, hr, -0.1, 0.065, 0.009, 0.004)
  const mouth = mouthPivot(head, mat('#c46a80', 0.6), hc, hr, 0, -0.35, [0.06, 0.03, 0.012], -0.006)
  patch(head, mat(BLUSH), hc, hr, 0.62, -0.05, [0.04, 0.025, 0.012], -0.002)
  patch(head, mat(BLUSH), hc, hr, -0.62, -0.05, [0.04, 0.025, 0.012], -0.002)

  // bow tie
  const BOW = mat('#f6a0b8', 0.6)
  const bow = pivot(body, 0, 0.085, 0.2)
  bow.rotation.x = -0.35
  mesh(bow, coneGeo(), BOW, [0.04, 0, 0], [0.035, 0.07, 0.022], [0, 0, Math.PI / 2])
  mesh(bow, coneGeo(), BOW, [-0.04, 0, 0], [0.035, 0.07, 0.022], [0, 0, -Math.PI / 2])
  mesh(bow, smallSphereGeo(), mat('#ee8aa6', 0.6), [0, 0, 0.005], 0.022)

  return finish(root, 'kikker', {
    rig, body, head, eyes, jaw: mouth, legL, legR, legFL, legFR,
  })
}

function buildElephant(): THREE.Group {
  const root = new THREE.Group()
  const rig = pivot(root)
  const SKIN = mat('#c9c2dc')
  const SKIN_D = mat('#b2a9c8')
  const PINK = mat('#f6b8c4')
  const NAIL = mat('#f8f1e4', 0.6)

  // The biggest visitor: about 0.75 tall, with a round, chubby body.
  const body = pivot(rig, 0, 0, 0)
  const bc: V3 = [0, 0.33, -0.04]
  const br: V3 = [0.26, 0.22, 0.3]
  mesh(body, sphereGeo(), SKIN, bc, br)
  const tail = pivot(body, 0, 0.36, -0.32)
  mesh(tail, cylGeo(), SKIN_D, [0, -0.06, -0.02], [0.012, 0.13, 0.012], [-0.35, 0, 0])
  mesh(tail, smallSphereGeo(), SKIN_D, [0, -0.125, -0.045], [0.025, 0.035, 0.025])

  // four stubby legs with cream toenails
  const leg = (x: number, z: number) => {
    const p = pivot(rig, x, 0.2, z)
    mesh(p, cylGeo(), SKIN, [0, -0.1, 0], [0.075, 0.2, 0.075])
    for (const nx of [-0.035, 0, 0.035]) {
      mesh(p, smallSphereGeo(), NAIL, [nx, -0.18, 0.066], [0.02, 0.018, 0.012])
    }
    return p
  }
  const legFL = leg(0.14, 0.13)
  const legFR = leg(-0.14, 0.13)
  const legL = leg(0.14, -0.2)
  const legR = leg(-0.14, -0.2)

  const head = pivot(rig, 0, 0.44, 0.2)
  const hc: V3 = [0, 0.1, 0.06]
  const hr: V3 = [0.2, 0.19, 0.18]
  mesh(head, sphereGeo(), SKIN, hc, hr)
  const eyes = [
    eye(head, hc, hr, 0.42, 0.2, 0.026, -0.006),
    eye(head, hc, hr, -0.42, 0.2, 0.026, -0.006),
  ]
  patch(head, mat(BLUSH), hc, hr, 0.72, -0.08, [0.04, 0.025, 0.012], -0.002)
  patch(head, mat(BLUSH), hc, hr, -0.72, -0.08, [0.04, 0.025, 0.012], -0.002)
  const mouth = mouthPivot(head, mat('#c46a80', 0.6), hc, hr, 0, -0.72, [0.035, 0.025, 0.01], -0.004)

  // big round ears, pink inside, swept back a little
  const ear = (s: number) => {
    const p = pivot(head, s * 0.16, 0.13, 0.02)
    p.rotation.set(0, s * 0.45, s * -0.12)
    mesh(p, sphereGeo(), SKIN, [s * 0.12, -0.01, 0], [0.15, 0.17, 0.03])
    mesh(p, sphereGeo(), PINK, [s * 0.125, -0.015, 0.016], [0.105, 0.125, 0.02])
    return p
  }
  const earL = ear(1)
  const earR = ear(-1)

  // trunk: a chain of tapering segments that hangs down and curls up at the tip
  const trunk: THREE.Object3D[] = []
  const SEG = 0.072
  const curl = [-0.15, -0.05, -0.15, -0.45, -0.6]
  let parent: THREE.Object3D = head
  let r = 0.056
  for (let i = 0; i < curl.length; i++) {
    const p = i === 0 ? pivot(parent, 0, 0.085, 0.215) : pivot(parent, 0, -SEG, 0)
    p.rotation.x = curl[i]
    mesh(p, smallSphereGeo(), SKIN, [0, 0, 0], r)
    mesh(p, taperGeo(), SKIN, [0, -SEG / 2, 0], [r, SEG, r])
    trunk.push(p)
    parent = p
    r *= 0.86
  }
  mesh(parent, smallSphereGeo(), SKIN, [0, -SEG, 0], r)
  mesh(parent, smallSphereGeo(), SKIN_D, [0, -SEG - r * 0.75, 0], [r * 0.6, r * 0.35, r * 0.6])

  // a tiny rainbow flower on his head
  const flower = new THREE.Group()
  head.add(flower)
  stickTo(flower, hc, hr, 0.5, 0.9, -0.004)
  const PETALS = ['#ff9aa8', '#ffc48a', '#ffe98a', '#a8e6a0', '#9fd3f0', '#c3a8f0']
  PETALS.forEach((c, i) => {
    const a = (i / PETALS.length) * Math.PI * 2
    mesh(flower, smallSphereGeo(), mat(c, 0.6), [Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0.006], [0.024, 0.024, 0.012])
  })
  mesh(flower, smallSphereGeo(), mat('#fff3b0', 0.5), [0, 0, 0.014], 0.017)

  return finish(root, 'olifant', {
    rig, body, head, eyes, jaw: mouth, legL, legR, legFL, legFR, earL, earR, tail, trunk,
  })
}

/** Builds a fresh animal. Feet/bottom at y = 0, centred on x/z = 0, facing +Z. */
export function buildAnimal(id: AnimalId): THREE.Group {
  switch (id) {
    case 'eend': return buildDuck()
    case 'schildpad': return buildTurtle()
    case 'uil': return buildOwl()
    case 'konijn': return buildRabbit()
    case 'kikker': return buildFrog()
    case 'olifant': return buildElephant()
  }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

function resetPose(rest: RestPose[]): void {
  for (let i = 0; i < rest.length; i++) {
    const r = rest[i]
    r.o.position.copy(r.p)
    r.o.quaternion.copy(r.q)
    r.o.scale.copy(r.s)
  }
}

/**
 * Animates the parts of an animal built by buildAnimal. Only inner pivots move; the root
 * transform belongs to the scene. No allocations per call.
 */
export function animateAnimal(group: THREE.Group, state: AnimalState, t: number, _dt: number): void {
  const ud = group.userData
  const P = ud.parts as AnimalParts | undefined
  const rest = ud.rest as RestPose[] | undefined
  if (!P || !rest) return
  resetPose(rest)

  const id = ud.id as AnimalId
  const ph = (ud.phase as number) || 0
  const tt = t + ph
  const hopper = id === 'konijn' || id === 'kikker'

  // --- shared idle layer: breathing, blinking, head tilt ---
  const breathe = Math.sin(tt * 2.4)
  P.body.scale.y *= 1 + 0.03 * breathe
  P.head.position.y += 0.006 * breathe
  P.head.rotation.z += 0.07 * Math.sin(tt * 0.9)
  P.head.rotation.y += 0.12 * Math.sin(tt * 0.47)

  const blinkPeriod = 3.3 + (ph % 1) * 0.9
  let eyeY = (tt % blinkPeriod) < 0.12 ? 0.1 : 1

  // little ear twitch for the rabbit
  if (P.earL && P.earR && id === 'konijn') {
    const tw = (tt * 0.7) % 4 < 0.25 ? Math.sin(tt * 40) * 0.12 : 0
    P.earL.rotation.z += tw
  }
  if (P.nose) P.nose.position.y += 0.003 * Math.sin(tt * 14)

  switch (state) {
    case 'idle':
      break

    case 'talk': {
      const k = Math.sin(t * TAU * 5)
      const open = 0.5 + 0.5 * k
      P.head.rotation.x += 0.07 * k
      P.head.position.y += 0.008 * open
      if (P.jaw) {
        if (id === 'eend') P.jaw.rotation.x += 0.45 * open
        else if (id === 'uil') P.jaw.scale.y *= 1 + 0.25 * open
        else P.jaw.scale.y = 0.15 + 0.85 * open
      }
      break
    }

    case 'swim': {
      P.rig.position.y += 0.03 * Math.sin(tt * 3)
      P.rig.rotation.z += 0.06 * Math.sin(tt * 1.7)
      P.rig.rotation.x += 0.03 * Math.sin(tt * 1.3)
      const pad = Math.sin(tt * 8)
      if (id === 'schildpad') {
        if (P.legFL) P.legFL.rotation.y += 0.6 * pad
        if (P.legFR) P.legFR.rotation.y -= 0.6 * pad
        if (P.legL) P.legL.rotation.y -= 0.4 * pad
        if (P.legR) P.legR.rotation.y += 0.4 * pad
        P.head.rotation.x -= 0.15
      } else if (id === 'kikker') {
        const kick = Math.max(0, Math.sin(tt * 4))
        if (P.legL) P.legL.rotation.x -= 0.7 * kick
        if (P.legR) P.legR.rotation.x -= 0.7 * kick
        if (P.legFL) P.legFL.rotation.x += 0.4 * pad
        if (P.legFR) P.legFR.rotation.x -= 0.4 * pad
      } else {
        // the elephant sits deeper in the water, trunk up like a snorkel
        if (id === 'olifant') P.rig.position.y -= 0.12
        if (P.legL) P.legL.rotation.x += 0.7 * pad
        if (P.legR) P.legR.rotation.x -= 0.7 * pad
      }
      if (P.tail) P.tail.rotation.y += 0.3 * Math.sin(tt * 4)
      break
    }

    case 'walk': {
      const step = Math.sin(tt * 9)
      if (hopper) {
        const hop = Math.abs(Math.sin(tt * 6))
        P.rig.position.y += hop * 0.1
        P.rig.rotation.x += -0.12 * Math.cos(tt * 12) * 0.5
        const tuck = hop * 0.6
        if (P.legL) P.legL.rotation.x += tuck
        if (P.legR) P.legR.rotation.x += tuck
        if (P.legFL) P.legFL.rotation.x -= tuck * 0.6
        if (P.legFR) P.legFR.rotation.x -= tuck * 0.6
        if (P.earL) P.earL.rotation.x -= 0.25 * hop
        if (P.earR) P.earR.rotation.x -= 0.25 * hop
      } else {
        P.rig.rotation.z += 0.12 * step
        P.rig.position.y += 0.015 * Math.abs(step)
        if (P.legL) P.legL.rotation.x += 0.5 * step
        if (P.legR) P.legR.rotation.x -= 0.5 * step
        if (P.legFL) P.legFL.rotation.x -= 0.5 * step
        if (P.legFR) P.legFR.rotation.x += 0.5 * step
        if (P.wingL) P.wingL.rotation.z += 0.2 + 0.1 * step
        if (P.wingR) P.wingR.rotation.z -= 0.2 - 0.1 * step
      }
      if (P.tail) P.tail.rotation.y += 0.35 * step
      break
    }

    case 'fly': {
      const flap = Math.sin(t * TAU * 6)
      if (P.wingL) P.wingL.rotation.z += 0.5 + 0.9 * flap
      if (P.wingR) P.wingR.rotation.z -= 0.5 + 0.9 * flap
      P.rig.position.y += 0.025 * flap
      P.rig.rotation.x += 0.2
      P.head.rotation.x -= 0.15
      if (P.legL) { P.legL.rotation.x -= 0.6; P.legL.scale.y *= 0.6 }
      if (P.legR) { P.legR.rotation.x -= 0.6; P.legR.scale.y *= 0.6 }
      if (P.tail) P.tail.rotation.x += 0.2 * flap
      break
    }

    case 'happy': {
      const s = Math.sin(t * 9)
      const hop = Math.abs(s)
      P.rig.position.y += hop * 0.12
      // squash a little near the ground, stretch in the air
      const sq = 1 - hop
      P.body.scale.y *= 1 - 0.08 * sq * sq + 0.04 * hop
      P.head.rotation.x -= 0.15
      eyeY = 0.35
      const wig = Math.sin(t * 18)
      if (P.wingL) P.wingL.rotation.z += 1.1 + 0.3 * wig
      if (P.wingR) P.wingR.rotation.z -= 1.1 + 0.3 * wig
      if (id === 'konijn' && P.earL && P.earR) {
        P.earL.rotation.z += 0.12 + 0.12 * wig
        P.earR.rotation.z -= 0.12 + 0.12 * wig
        P.earL.rotation.x += 0.1
        P.earR.rotation.x += 0.1
      } else if (P.earL && P.earR) {
        P.earL.rotation.z -= 0.2 * wig
        P.earR.rotation.z += 0.2 * wig
      }
      if (P.legFL) P.legFL.rotation.x -= 0.6 + 0.3 * wig
      if (P.legFR) P.legFR.rotation.x -= 0.6 - 0.3 * wig
      if (P.legL) P.legL.rotation.x += 0.3 * hop
      if (P.legR) P.legR.rotation.x += 0.3 * hop
      if (P.tail) P.tail.rotation.y += 0.5 * wig
      if (P.jaw) {
        if (id === 'eend') P.jaw.rotation.x += 0.35
        else if (id !== 'uil') P.jaw.scale.y = 0.8
      }
      break
    }
  }

  // elephant: ears flap slowly, trunk sways and curls; it lifts up on a right answer
  if (id === 'olifant') {
    if (P.earL && P.earR) {
      const flap = 0.16 * Math.sin(tt * 1.7) + (state === 'happy' ? 0.25 * Math.sin(t * 14) : 0)
      P.earL.rotation.y += flap
      P.earR.rotation.y -= flap
    }
    if (P.trunk) {
      let lift = 0
      if (state === 'happy') lift = 0.45
      else if (state === 'swim') lift = 0.3
      else if (state === 'talk') lift = 0.08 + 0.06 * Math.sin(t * TAU * 2.5)
      const n = P.trunk.length
      for (let i = 0; i < n; i++) {
        const seg = P.trunk[i]
        seg.rotation.x -= lift + 0.07 * (1 + Math.sin(tt * 0.9 - i * 0.6)) * (i / n)
        seg.rotation.z += 0.1 * Math.sin(tt * 1.2 - i * 0.5)
        if (state === 'happy') seg.rotation.z += 0.08 * Math.sin(t * 12 - i * 0.8)
      }
    }
  }

  for (let i = 0; i < P.eyes.length; i++) P.eyes[i].scale.y *= eyeY
}

// ---------------------------------------------------------------------------
// Boat
// ---------------------------------------------------------------------------

function boatOutline(sx: number, sz: number): THREE.Shape {
  // Top view in shape space: x = width, y = length. y = -0.56 becomes the bow (+Z) after rotation.
  const s = new THREE.Shape()
  s.moveTo(0, -0.56 * sz)
  s.bezierCurveTo(0.2 * sx, -0.46 * sz, 0.3 * sx, -0.22 * sz, 0.3 * sx, 0.08 * sz)
  s.bezierCurveTo(0.3 * sx, 0.36 * sz, 0.26 * sx, 0.48 * sz, 0, 0.48 * sz)
  s.bezierCurveTo(-0.26 * sx, 0.48 * sz, -0.3 * sx, 0.36 * sz, -0.3 * sx, 0.08 * sz)
  s.bezierCurveTo(-0.3 * sx, -0.22 * sz, -0.2 * sx, -0.46 * sz, 0, -0.56 * sz)
  return s
}

function extrudeUp(shape: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  g.computeVertexNormals()
  return g
}

/**
 * A small pastel rowing boat (~1.1 long, ~0.6 wide), bottom at y = 0, bow facing +Z.
 * userData.seat: where a passenger stands. userData.oarL / oarR: oar pivots (see animateBoat).
 */
export function buildBoat(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'boat'
  const WOOD = mat('#f4c58f')
  const WOOD_D = mat('#d9a06c')
  const STRIPE = mat('#9fd3e8')

  const hullGeo = cachedGeo('boat-hull', () => {
    const outer = boatOutline(1, 1)
    outer.holes.push(boatOutline(0.8, 0.86))
    return extrudeUp(outer, 0.17, 0.03)
  })
  const keelGeo = cachedGeo('boat-keel', () => extrudeUp(boatOutline(0.86, 0.92), 0.05, 0.02))
  const stripeGeo = cachedGeo('boat-stripe', () => {
    const outer = boatOutline(1.2, 1.09)
    outer.holes.push(boatOutline(1.0, 1.0))
    return extrudeUp(outer, 0.035, 0)
  })

  const keel = mesh(root, keelGeo, WOOD_D, [0, 0, 0])
  keel.receiveShadow = true
  const hull = mesh(root, hullGeo, WOOD, [0, 0.03, 0])
  hull.receiveShadow = true
  mesh(root, stripeGeo, STRIPE, [0, 0.12, 0])

  // bench
  const bench = mesh(root, roundBoxGeo(0.5, 0.035, 0.14, 0.012), WOOD_D, [0, 0.16, -0.1])
  bench.receiveShadow = true
  // small bow cap
  mesh(root, roundBoxGeo(0.12, 0.03, 0.1, 0.01), WOOD_D, [0, 0.215, 0.44])

  const oar = (s: number) => {
    const p = pivot(root, s * 0.27, 0.22, 0.02)
    p.rotation.set(0, s * 0.35, s * -0.35)
    mesh(p, cylGeo(), WOOD_D, [s * 0.18, 0, 0], [0.014, 0.42, 0.014], [0, 0, Math.PI / 2])
    mesh(p, roundBoxGeo(0.16, 0.012, 0.08, 0.005), WOOD, [s * 0.38, 0, 0])
    return p
  }
  root.userData.oarL = oar(1)
  root.userData.oarR = oar(-1)

  const seat = new THREE.Object3D()
  seat.name = 'boat-seat'
  seat.position.set(0, 0.18, -0.1)
  root.add(seat)
  root.userData.seat = seat
  return root
}

/** Optional: gentle rowing motion for the boat's oars. */
export function animateBoat(boat: THREE.Group, t: number, rowing = true): void {
  const L = boat.userData.oarL as THREE.Object3D | undefined
  const R = boat.userData.oarR as THREE.Object3D | undefined
  if (!L || !R) return
  const a = rowing ? Math.sin(t * 4) : 0
  const b = rowing ? Math.cos(t * 4) : 0
  L.rotation.set(0, 0.35 + 0.4 * a, -0.35 + 0.15 * b)
  R.rotation.set(0, -0.35 - 0.4 * a, 0.35 - 0.15 * b)
}
