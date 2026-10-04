import * as THREE from 'three'
import { markInstances } from './island'

export type BurstKind = 'sparkle' | 'hearts' | 'stars' | 'splash' | 'rainbow'

/** Pastel rainbow glitter colours. */
const GLITTER = ['#ffb3c1', '#ffd3a8', '#fff1a8', '#c4ecb8', '#b8dcfa', '#d6c4fa', '#ffffff']

const MAX_P = 192
const MAX_RINGS = 32

interface Particle {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  max: number
  size: number
  kind: number // atlas cell: 0 glint, 1 heart, 2 star, 3 drop
  rot: number
  spin: number
  gravity: number
  sway: number
  color: THREE.Color
}

interface Ring {
  alive: boolean
  x: number
  y: number
  z: number
  age: number
  max: number
  size: number
}

const vertexShader = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
attribute float aRot;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying float vKind;
varying float vRot;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vKind = aKind;
  vRot = aRot;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale;
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying float vKind;
varying float vRot;
varying vec3 vColor;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  pc = mat2(c, -s, s, c) * pc + 0.5;
  if (pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0) discard;
  float cx = mod(vKind, 2.0);
  float cy = floor(vKind / 2.0);
  vec2 uv = vec2((cx + pc.x) * 0.5, 1.0 - (cy + pc.y) * 0.5);
  vec4 tex = texture2D(uMap, uv);
  float a = tex.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(tex.rgb * vColor, a);
  #include <colorspace_fragment>
}
`

export class Effects {
  readonly group = new THREE.Group()
  private readonly particles: Particle[] = []
  private readonly rings: Ring[] = []
  private readonly points: THREE.Points
  private readonly pmat: THREE.ShaderMaterial
  private readonly ringMesh: THREE.InstancedMesh
  private readonly atlas: THREE.CanvasTexture
  private readonly attrs: {
    pos: THREE.BufferAttribute
    size: THREE.BufferAttribute
    alpha: THREE.BufferAttribute
    kind: THREE.BufferAttribute
    rot: THREE.BufferAttribute
    color: THREE.BufferAttribute
  }
  private nextP = 0
  private nextR = 0
  private active = false

  constructor() {
    this.group.name = 'effects'
    for (let i = 0; i < MAX_P; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        max: 1,
        size: 0.2,
        kind: 0,
        rot: 0,
        spin: 0,
        gravity: 0,
        sway: 0,
        color: new THREE.Color(),
      })
    }
    for (let i = 0; i < MAX_RINGS; i++) this.rings.push({ alive: false, x: 0, y: 0, z: 0, age: 0, max: 1, size: 1 })

    const geo = new THREE.BufferGeometry()
    const f = (n: number) => new THREE.BufferAttribute(new Float32Array(MAX_P * n), n).setUsage(THREE.DynamicDrawUsage)
    this.attrs = { pos: f(3), size: f(1), alpha: f(1), kind: f(1), rot: f(1), color: f(3) }
    geo.setAttribute('position', this.attrs.pos)
    geo.setAttribute('aSize', this.attrs.size)
    geo.setAttribute('aAlpha', this.attrs.alpha)
    geo.setAttribute('aKind', this.attrs.kind)
    geo.setAttribute('aRot', this.attrs.rot)
    geo.setAttribute('aColor', this.attrs.color)
    this.atlas = makeAtlas()
    this.pmat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: this.atlas }, uScale: { value: 100 } },
    })
    this.pmat.toneMapped = false
    this.points = new THREE.Points(geo, this.pmat)
    this.points.frustumCulled = false
    this.points.renderOrder = 10
    this.group.add(this.points)

    const ringGeo = new THREE.RingGeometry(0.82, 1, 40)
    ringGeo.rotateX(-Math.PI / 2)
    this.ringMesh = new THREE.InstancedMesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      MAX_RINGS,
    )
    this.ringMesh.setColorAt(0, new THREE.Color(0, 0, 0))
    this.ringMesh.count = 0
    this.ringMesh.frustumCulled = false
    this.ringMesh.renderOrder = 2
    this.group.add(this.ringMesh)
  }

  /** Pixels per world unit times device pixel ratio, so particle sizes are in world units. */
  setScale(s: number): void {
    this.pmat.uniforms.uScale.value = s
  }

  splashRing(x: number, y: number, z: number, size = 0.8, dur = 0.8): void {
    const r = this.rings[this.nextR]
    this.nextR = (this.nextR + 1) % MAX_RINGS
    Object.assign(r, { alive: true, x, y, z, age: 0, max: dur, size })
    this.active = true
  }

  burst(kind: BurstKind, at: THREE.Vector3, camRight: THREE.Vector3): void {
    const rnd = Math.random
    const spawn = (p: Partial<Particle> & { kind: number }) => {
      const q = this.particles[this.nextP]
      this.nextP = (this.nextP + 1) % MAX_P
      q.alive = true
      q.life = 0
      q.max = p.max ?? 1
      q.size = p.size ?? 0.2
      q.kind = p.kind
      q.rot = p.rot ?? 0
      q.spin = p.spin ?? 0
      q.gravity = p.gravity ?? 0
      q.sway = p.sway ?? 0
      q.pos.copy(p.pos ?? at)
      q.vel.copy(p.vel ?? new THREE.Vector3())
      q.color.copy(p.color ?? new THREE.Color(1, 1, 1))
    }
    this.active = true
    switch (kind) {
      case 'sparkle': {
        const cols = ['#ffd76a', '#ffb3c1', '#fff3b0', '#b8dcfa', '#ffffff', '#d6c4fa', '#c4ecb8']
        for (let i = 0; i < 16; i++) {
          const a = rnd() * Math.PI * 2
          const sp = 0.6 + rnd() * 1.1
          const v = camRight.clone().multiplyScalar(Math.cos(a) * sp)
          v.y = Math.sin(a) * sp + 0.5
          spawn({
            kind: 0,
            pos: at.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3)),
            vel: v,
            max: 0.7 + rnd() * 0.5,
            size: 0.16 + rnd() * 0.16,
            spin: (rnd() - 0.5) * 6,
            gravity: -0.8,
            color: new THREE.Color(cols[i % cols.length]),
          })
        }
        // and two little hearts floating up
        for (let i = 0; i < 2; i++) {
          const side = i ? 0.35 : -0.35
          spawn({
            kind: 1,
            pos: at.clone().add(camRight.clone().multiplyScalar(side)),
            vel: camRight.clone().multiplyScalar(side * 0.4).add(new THREE.Vector3(0, 0.8 + rnd() * 0.3, 0)),
            max: 1.0 + rnd() * 0.4,
            size: 0.15 + rnd() * 0.06,
            sway: 1 + rnd(),
            color: new THREE.Color(i ? '#ffb3cf' : '#ff8fb8'),
          })
        }
        break
      }
      case 'rainbow': {
        // a fountain of rainbow glitter, stars and hearts
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI + (rnd() - 0.5) * 0.25
          const sp = 1.3 + rnd() * 0.7
          const v = camRight.clone().multiplyScalar(Math.cos(a) * sp)
          v.y = Math.sin(a) * sp + 0.7
          const k = i % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 0
          spawn({
            kind: k,
            // hearts float without drag, so they start slower
            vel: k === 1 ? v.multiplyScalar(0.4) : v,
            max: 1.0 + rnd() * 0.5,
            size: k === 0 ? 0.14 + rnd() * 0.12 : 0.17 + rnd() * 0.1,
            spin: k === 1 ? 0 : (rnd() - 0.5) * 5,
            sway: k === 1 ? 1 : 0,
            gravity: k === 1 ? 0 : -1.4,
            color: new THREE.Color(GLITTER[Math.floor((i / 30) * 6) % GLITTER.length]),
          })
        }
        break
      }
      case 'hearts': {
        const cols = ['#ff8fb8', '#ffb3cf', '#ff7aa8']
        for (let i = 0; i < 8; i++) {
          const side = (rnd() - 0.5) * 0.9
          spawn({
            kind: 1,
            pos: at.clone().add(camRight.clone().multiplyScalar(side * 0.6)).add(new THREE.Vector3(0, rnd() * 0.2, 0)),
            vel: camRight.clone().multiplyScalar(side * 0.5).add(new THREE.Vector3(0, 0.7 + rnd() * 0.5, 0)),
            max: 1.2 + rnd() * 0.6,
            size: 0.2 + rnd() * 0.14,
            rot: (rnd() - 0.5) * 0.5,
            sway: 1 + rnd(),
            color: new THREE.Color(cols[i % cols.length]),
          })
        }
        break
      }
      case 'stars': {
        const cols = ['#ffe36e', '#ffb3c1', '#fff7c2', '#b8dcfa', '#ffc95c', '#c9b3ff', '#c4ecb8']
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + rnd() * 0.3
          const sp = 1.0 + rnd() * 0.8
          const v = camRight.clone().multiplyScalar(Math.cos(a) * sp)
          v.y = Math.sin(a) * sp + 0.6
          spawn({
            kind: 2,
            vel: v,
            max: 0.8 + rnd() * 0.4,
            size: 0.2 + rnd() * 0.14,
            spin: (rnd() - 0.5) * 5,
            gravity: -1.6,
            color: new THREE.Color(cols[i % cols.length]),
          })
        }
        break
      }
      case 'splash': {
        for (let i = 0; i < 14; i++) {
          const a = rnd() * Math.PI * 2
          const sp = 0.4 + rnd() * 0.7
          spawn({
            kind: 3,
            pos: at.clone().add(new THREE.Vector3(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15)),
            vel: new THREE.Vector3(Math.cos(a) * sp, 1.4 + rnd() * 1.1, Math.sin(a) * sp),
            max: 0.6 + rnd() * 0.3,
            size: 0.08 + rnd() * 0.08,
            gravity: -6,
            color: new THREE.Color(i % 3 ? '#ffffff' : '#d8f2fb'),
          })
        }
        this.splashRing(at.x, at.y, at.z, 0.7)
        break
      }
    }
  }

  update(dt: number, t: number): void {
    if (!this.active) return
    let any = false
    const { pos, size, alpha, kind, rot, color } = this.attrs
    for (let i = 0; i < MAX_P; i++) {
      const p = this.particles[i]
      if (!p.alive) {
        alpha.setX(i, 0)
        continue
      }
      p.life += dt
      if (p.life >= p.max) {
        p.alive = false
        alpha.setX(i, 0)
        continue
      }
      any = true
      p.vel.y += p.gravity * dt
      p.vel.multiplyScalar(p.kind === 1 ? 1 : Math.pow(0.35, dt))
      p.pos.addScaledVector(p.vel, dt)
      p.rot += p.spin * dt
      const k = p.life / p.max
      let s = p.size
      let a = 1
      if (p.kind === 0) {
        s *= 0.6 + 0.6 * Math.abs(Math.sin(p.life * 14 + i))
        a = 1 - k * k
      } else if (p.kind === 1) {
        s *= Math.min(1, k * 6)
        a = 1 - Math.pow(k, 3)
      } else {
        s *= k < 0.15 ? k / 0.15 : 1
        a = 1 - k * k
      }
      const sway = p.sway ? Math.sin(t * 4 * p.sway + i) * 0.06 : 0
      pos.setXYZ(i, p.pos.x + sway, p.pos.y, p.pos.z)
      size.setX(i, s)
      alpha.setX(i, a)
      kind.setX(i, p.kind)
      rot.setX(i, p.rot + (p.kind === 1 ? Math.sin(t * 3 + i) * 0.25 : 0))
      color.setXYZ(i, p.color.r, p.color.g, p.color.b)
    }
    for (const attr of Object.values(this.attrs)) attr.needsUpdate = true

    // rings
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    let n = 0
    for (const r of this.rings) {
      if (!r.alive) continue
      r.age += dt
      if (r.age >= r.max) {
        r.alive = false
        continue
      }
      any = true
      const k = r.age / r.max
      const sc = r.size * (0.25 + 0.75 * (1 - Math.pow(1 - k, 2)))
      m.makeScale(sc, 1, sc).setPosition(r.x, r.y, r.z)
      this.ringMesh.setMatrixAt(n, m)
      const a = 0.75 * (1 - k)
      c.setRGB(a, a, a)
      this.ringMesh.setColorAt(n, c)
      n++
    }
    this.ringMesh.count = n
    markInstances(this.ringMesh)
    this.active = any
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.pmat.dispose()
    this.atlas.dispose()
    this.ringMesh.geometry.dispose()
    ;(this.ringMesh.material as THREE.Material).dispose()
    this.ringMesh.dispose()
  }
}

/** 2x2 atlas of white shapes: glint, heart, star, droplet. */
function makeAtlas(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S * 2
  const g = cv.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.shadowColor = 'rgba(255,255,255,0.9)'

  // 0: four-point glint
  g.save()
  g.translate(S / 2, S / 2)
  g.shadowBlur = 10
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? S * 0.46 : S * 0.09
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  g.restore()

  // 1: heart
  g.save()
  g.translate(S * 1.5, S / 2 + 4)
  g.shadowBlur = 4
  g.beginPath()
  const hs = S * 0.36
  g.moveTo(0, hs * 0.9)
  g.bezierCurveTo(-hs * 1.4, -hs * 0.1, -hs * 0.7, -hs * 1.15, 0, -hs * 0.45)
  g.bezierCurveTo(hs * 0.7, -hs * 1.15, hs * 1.4, -hs * 0.1, 0, hs * 0.9)
  g.fill()
  g.restore()

  // 2: rounded five-point star
  g.save()
  g.translate(S / 2, S * 1.5 + 4)
  g.shadowBlur = 6
  g.lineJoin = 'round'
  g.lineWidth = 10
  g.strokeStyle = '#ffffff'
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? S * 0.38 : S * 0.17
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  g.stroke()
  g.restore()

  // 3: droplet
  g.save()
  g.translate(S * 1.5, S * 1.5)
  g.shadowBlur = 3
  g.beginPath()
  g.arc(0, 0, S * 0.36, 0, Math.PI * 2)
  g.fill()
  g.restore()

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
