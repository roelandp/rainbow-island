import * as THREE from 'three'

/** CSS sky behind the transparent canvas: lila at the top, soft blue at the horizon. */
const DAY = ['#cdb9ef', '#d9cff5', '#bfe3f7']
const SUNSET = ['#c4ade8', '#f7a8c4', '#ffc9a3']

function mixHex(a: string, b: string, k: number): string {
  // mix in sRGB (plain hex maths) so CSS gets exactly the design colours
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p: number, sh: number) => (p >> sh) & 255
  const mix = (sh: number) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * k)
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`
}

/** k: 0 day .. 1 sunset. horizonPct: horizon position from the top of the host, in %. */
export function skyGradient(k: number, horizonPct: number): string {
  const h = Math.max(8, Math.min(95, horizonPct))
  const c = DAY.map((d, i) => mixHex(d, SUNSET[i], k))
  return `linear-gradient(180deg, ${c[0]} 0%, ${c[1]} ${(h * 0.55).toFixed(1)}%, ${c[2]} ${h.toFixed(1)}%, ${c[2]} 100%)`
}

interface Cloud {
  u: number
  v: number
  speed: number
  scale: number
  puffs: { x: number; y: number; z: number; r: number }[]
}

/** Low-poly clouds drifting slowly in the sky band behind the island (one draw call). */
export class Clouds {
  readonly mesh: THREE.InstancedMesh
  private readonly clouds: Cloud[] = []
  private readonly mat: THREE.MeshLambertMaterial
  private readonly m = new THREE.Matrix4()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()

  constructor() {
    const geo = new THREE.IcosahedronGeometry(1, 1)
    this.mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: '#e8defa', emissiveIntensity: 0.55 })
    const seeds = [
      { u: -0.75, v: 0.3, s: 1.0 },
      { u: -0.1, v: 0.55, s: 0.7 },
      { u: 0.45, v: 0.22, s: 1.1 },
      { u: 0.95, v: 0.5, s: 0.65 },
    ]
    let n = 0
    for (const sd of seeds) {
      const puffs = [
        { x: 0, y: 0, z: 0, r: 0.62 },
        { x: -0.62, y: -0.12, z: 0.1, r: 0.45 },
        { x: 0.6, y: -0.1, z: -0.1, r: 0.48 },
        { x: 0.25, y: 0.28, z: 0.05, r: 0.4 },
        { x: -1.05, y: -0.22, z: 0, r: 0.28 },
      ]
      n += puffs.length
      this.clouds.push({ u: sd.u, v: sd.v, speed: 0.05 + sd.s * 0.03, scale: sd.s, puffs })
    }
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n)
    this.mesh.frustumCulled = false
    this.mesh.name = 'clouds'
  }

  setMood(k: number): void {
    this.mat.emissive.set('#e8defa').lerp(new THREE.Color('#ffc6b8'), k)
  }

  /**
   * Places the clouds in the camera's sky band. `right` / `up` are the camera screen axes,
   * `fwd` the horizontal forward. depth: ground distance behind the horizon fade.
   */
  update(
    dt: number,
    target: THREE.Vector3,
    right: THREE.Vector3,
    fwd: THREE.Vector3,
    elevation: number,
    depth: number,
    viewLeft: number,
    viewRight: number,
    horizonY: number,
    topY: number,
    unitsPerPx: number,
  ): void {
    const width = viewRight - viewLeft
    const band = topY - horizonY
    // too little sky on screen: no clouds rather than clipped ones
    this.mesh.visible = band / unitsPerPx > 70
    if (!this.mesh.visible) return
    const sinE = Math.sin(elevation)
    const cosE = Math.cos(elevation)
    let i = 0
    for (const c of this.clouds) {
      c.u += (c.speed * dt) / Math.max(4, width) * 2
      if (c.u > 1.25) c.u -= 2.5
      const vx = viewLeft + ((c.u + 1.25) / 2.5) * (width + 6) - 3
      const vy = horizonY + band * c.v
      const sc = c.scale * Math.min(1.1, band * 0.16, 34 * unitsPerPx)
      for (const pf of c.puffs) {
        const px = vx + pf.x * sc
        const py = vy + pf.y * sc
        // world point at ground depth `depth` whose view y is py
        const h = (py - depth * sinE) / cosE
        this.p.copy(target).addScaledVector(right, px).addScaledVector(fwd, depth + pf.z * sc)
        this.p.y += h
        const r = pf.r * sc
        this.s.set(r * 1.15, r * 0.8, r)
        this.m.compose(this.p, this.q, this.s)
        this.mesh.setMatrixAt(i++, this.m)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.mesh.dispose()
  }
}
