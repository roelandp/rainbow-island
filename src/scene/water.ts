import * as THREE from 'three'

/** Height of the water surface (world units, ground top is y = 0). */
export const WATER_Y = -0.3

interface WaterPalette {
  shallow: string
  mid: string
  deep: string
  foam: string
  horizon: string
  glint: string
}

const DAY: WaterPalette = {
  shallow: '#bfeaf6',
  mid: '#a8dcf0',
  deep: '#8fcbea',
  foam: '#ffffff',
  horizon: '#c4e4f6',
  glint: '#ffffff',
}

const SUNSET: WaterPalette = {
  shallow: '#d6e2f2',
  mid: '#bccbec',
  deep: '#a9b2e3',
  foam: '#fff4ec',
  horizon: '#ffcfb0',
  glint: '#ffe2c4',
}

const vertexShader = /* glsl */ `
uniform float uTime;
varying vec2 vXZ;
varying float vWave;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.9 + uTime * 1.1) * 0.5
          + sin(wp.z * 1.15 - uTime * 0.9) * 0.35
          + sin((wp.x + wp.z) * 0.6 + uTime * 0.7) * 0.4;
  wp.y += w * 0.028;
  vWave = w;
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform vec2 uFwd;
uniform vec2 uFade;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uHorizon;
uniform vec3 uGlint;
varying vec2 vXZ;
varying float vWave;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 p = vXZ - uCenter;
  float d = sdRoundRect(p, uHalf, 0.45);
  float along = dot(p, uFwd);

  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 2.2, d));
  col = mix(col, uDeep, smoothstep(2.5, 11.0, d));
  col *= 1.0 + vWave * 0.025;

  // soft caustic net
  vec2 q = vXZ * 1.25;
  vec2 a = q + vec2(sin(q.y * 1.7 + uTime * 0.8), cos(q.x * 1.5 - uTime * 0.7)) * 0.6;
  float c = abs(sin(a.x * 2.0) * sin(a.y * 2.0));
  vec2 q2 = vXZ * 0.71 + vec2(3.1, 7.7);
  vec2 a2 = q2 + vec2(cos(q2.y * 1.3 - uTime * 0.5), sin(q2.x * 1.1 + uTime * 0.6)) * 0.7;
  float c2 = abs(sin(a2.x * 2.0) * sin(a2.y * 2.0));
  float caustic = (1.0 - smoothstep(0.0, 0.12, c)) * (0.35 + 0.65 * smoothstep(0.0, 0.5, c2));
  caustic *= 1.0 - smoothstep(1.0, 8.0, d);
  col = mix(col, vec3(1.0), caustic * 0.1);

  // twinkling glints
  vec2 gq = vXZ * 2.2;
  vec2 cell = floor(gq);
  float h = hash12(cell);
  vec2 off = vec2(hash12(cell + 17.1), hash12(cell + 41.7)) * 0.6 + 0.2;
  float tw = sin(uTime * (1.2 + h * 1.8) + h * 40.0);
  float glint = step(0.72, h) * smoothstep(0.08, 0.0, length(fract(gq) - off)) * smoothstep(0.55, 1.0, tw);
  col = mix(col, uGlint, glint * 0.85);

  // foam ring hugging the shore + a soft ring pulsing outward
  float n = sin(p.x * 3.1 + uTime * 1.3) * sin(p.y * 2.7 - uTime * 1.1);
  float foam1 = 1.0 - smoothstep(0.04, 0.22 + 0.06 * n, d);
  float ph = fract(uTime * 0.22);
  float rd = d - (0.22 + ph * 0.95);
  float foam2 = (1.0 - smoothstep(0.0, 0.06, abs(rd))) * (1.0 - ph) * (0.65 + 0.35 * n);
  float foam = max(foam1, foam2 * 0.75);
  col = mix(col, uFoam, foam * 0.92);

  // haze towards the horizon, then fade out into the CSS sky
  float haze = smoothstep(uFade.x - 2.5, uFade.y, along);
  col = mix(col, uHorizon, haze * 0.75);
  float alpha = mix(0.8, 0.95, smoothstep(0.0, 3.0, d));
  alpha = max(alpha, foam * 0.95);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, along);
  fade *= 1.0 - smoothstep(24.0, 34.0, length(p));
  gl_FragColor = vec4(col, alpha * fade);
  #include <colorspace_fragment>
}
`

export class Water {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private readonly day = toColors(DAY)
  private readonly sunset = toColors(SUNSET)

  constructor() {
    const geo = new THREE.PlaneGeometry(80, 80, 100, 100)
    geo.rotateX(-Math.PI / 2)
    this.mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector2() },
        uHalf: { value: new THREE.Vector2(2, 2) },
        uFwd: { value: new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2) },
        uFade: { value: new THREE.Vector2(9, 13) },
        uShallow: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uFoam: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlint: { value: new THREE.Color() },
      },
    })
    this.mat.toneMapped = false
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.position.y = WATER_Y
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false
    this.setMood(0)
  }

  /** Island bounds (centre and half extents in world units, including the beach rim). */
  setIsland(cx: number, cz: number, hx: number, hz: number): void {
    const u = this.mat.uniforms
    u.uCenter.value.set(cx, cz)
    u.uHalf.value.set(hx, hz)
    this.mesh.position.x = cx
    this.mesh.position.z = cz
  }

  /** Horizontal camera forward (away from the viewer) and fade distances along it. */
  setView(fx: number, fz: number, fadeStart: number, fadeEnd: number): void {
    const u = this.mat.uniforms
    u.uFwd.value.set(fx, fz)
    u.uFade.value.set(fadeStart, fadeEnd)
  }

  /** 0 = day, 1 = sunset. */
  setMood(k: number): void {
    const u = this.mat.uniforms
    const keys = ['shallow', 'mid', 'deep', 'foam', 'horizon', 'glint'] as const
    const names = ['uShallow', 'uMid', 'uDeep', 'uFoam', 'uHorizon', 'uGlint']
    keys.forEach((key, i) => {
      ;(u[names[i]].value as THREE.Color).copy(this.day[key]).lerp(this.sunset[key], k)
    })
  }

  update(t: number): void {
    this.mat.uniforms.uTime.value = t
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}

function toColors(p: WaterPalette): Record<keyof WaterPalette, THREE.Color> {
  return {
    shallow: new THREE.Color(p.shallow),
    mid: new THREE.Color(p.mid),
    deep: new THREE.Color(p.deep),
    foam: new THREE.Color(p.foam),
    horizon: new THREE.Color(p.horizon),
    glint: new THREE.Color(p.glint),
  }
}
