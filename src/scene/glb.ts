import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'

const cache = new Map<string, Promise<GLTF | null>>()

/**
 * Loads an optional GLB. Resolves null when the file does not exist (404, or a dev-server
 * HTML fallback page) or fails to parse, so callers can always fall back to primitives.
 */
export function loadOptionalGlb(url: string): Promise<GLTF | null> {
  let p = cache.get(url)
  if (!p) {
    p = fetchGlb(url)
    cache.set(url, p)
  }
  return p
}

async function fetchGlb(url: string): Promise<GLTF | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'model/gltf-binary,application/octet-stream' } })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (type.includes('text/html')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength < 20) return null
    const magic = new DataView(buf).getUint32(0, true)
    if (magic !== 0x46546c67) return null // 'glTF'
    const resourcePath = url.slice(0, url.lastIndexOf('/') + 1)
    const loader = new GLTFLoader()
    return await new Promise<GLTF | null>((resolve) => {
      loader.parse(
        buf,
        resourcePath,
        (gltf) => resolve(gltf),
        (err) => {
          console.warn('[scene] GLB parse failed', url, err)
          resolve(null)
        },
      )
    })
  } catch {
    return null
  }
}

/**
 * Wraps a GLTF scene so that its bounding box is `height` tall, centred on x/z, with the
 * lowest point at y = 0. Returns the wrapper (the original scene is cloned so a cached GLTF
 * can be used more than once).
 */
export function normalizeModel(src: THREE.Object3D, height: number): THREE.Group {
  const model = skeletonClone(src)
  const wrap = new THREE.Group()
  wrap.add(model)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const s = size.y > 1e-6 ? height / size.y : 1
  model.scale.multiplyScalar(s)
  model.updateMatrixWorld(true)
  box.setFromObject(model)
  const c = box.getCenter(new THREE.Vector3())
  model.position.x -= c.x
  model.position.z -= c.z
  model.position.y -= box.min.y
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  return wrap
}
