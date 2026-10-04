# GLB versimpelen

Een scan van Meshy of Tripo is vaak 150k+ driehoeken en 5 tot 10 MB: te zwaar voor iPad en iPhone.
`simplify-glb.mjs` maakt er ~12k driehoeken van met een 1024 jpeg-texture, zet het "metaal" uit (anders wordt het donker) en laat de normal map weg tenzij je `normal` meegeeft.

Eenmalig de tools installeren buiten het project (geen dependency van het spel):

```bash
mkdir -p /tmp/gltf && cd /tmp/gltf && npm init -y && npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp
cp <project>/scripts/simplify-glb.mjs /tmp/gltf/
node simplify-glb.mjs <invoer.glb> <project>/public/models/katrien.glb 0.075 1024 normal
```

Argumenten: invoer, uitvoer, ratio (0.075 = 7,5% van de driehoeken), texturegrootte, en optioneel `normal`.
