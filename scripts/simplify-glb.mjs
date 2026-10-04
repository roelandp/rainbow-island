import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, simplify, dedup, prune, textureCompress, center } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const [input, output, ratioArg, texArg, keepNormal] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
await MeshoptSimplifier.ready
for (const mat of doc.getRoot().listMaterials()) {
  // A Meshy export marks the fur as metal; without an environment map that renders dark.
  mat.setMetallicFactor(0).setRoughnessFactor(0.85)
  const mr = mat.getMetallicRoughnessTexture()
  mat.setMetallicRoughnessTexture(null)
  if (keepNormal !== 'normal') mat.setNormalTexture(null)
}
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratioArg), error: 0.002, lockBorder: false }),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [Number(texArg), Number(texArg)], quality: 82 }),
)
let tris = 0
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
await io.write(output, doc)
console.log(output, 'tris', tris)
