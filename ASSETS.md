# Assets van Rainbow Island

Het spel draait ook zonder extra bestanden: zonder 3D-model wordt Katrien een sprite, zonder sprites een figuurtje uit code (wit met zwarte en oranje vlekken). De dieren en meubels zijn figuurtjes uit code.

## 1. Katrien in 3D

**Bestand:** `public/models/katrien.glb` (ca. 18k driehoeken, ca. 0,8 MB, texture 1024 jpeg met normal map).

- Bron: `glbs/Meshy_AI_Calico_Character_Shee_1004092048_texture.glb` (Meshy, gemaakt van Katja's character sheet). `glbs/` staat in `.gitignore`.
- Versimpeld met `scripts/simplify-glb.mjs`, zie `scripts/README-glb.md` (ratio 0.075, texture 1024, `normal`).
- Ze staat op vier pootjes en kijkt naar +Z (naar de kijker). Het spel maakt haar 0,85 tegel hoog en zet haar pootjes midden op de tegel; de lange staart steekt naar achteren uit.
- Hoedjes en spulletjes voor op de kop komen als plaatje boven haar kop. Capes zie je alleen op de sprites.

Testen: `npm run dev` en open `?cat=glb`. Sprite: `?cat=sprite`. Figuurtje uit code: `?cat=primitive`.

## 2. Sprites (uit Rainbow Kitten)

`public/sprites/`: `beg` (staan, gewoon en verbaasd), `confetti` (blij), `jump` (springen), `sleep` (slapen) en `wake` (wakker worden, nog niet gekoppeld).
`hang`, `happy` en `surprised` uit Rainbow Kitten leunen tegen een muur en worden niet gebruikt.
De ankers voor hoedjes (kop, gezicht, nek) staan in `src/scene/dressup.ts`.

## 3. Aankleden

`public/items/`: `bow`, `cape`, `crown`, `mouse-toy` en `party-hat` komen uit Rainbow Kitten (kroon en muisje vervangen die van Kit Nugget); `bell`, `bowtie`, `feather`, `fish`, `helmet` en `yarn` uit Kit Nugget.
Getekend in code (`src/scene/dressart.ts`): zonnebril, hoge hoed, lama, ketting, prinsessenkroontje, eenhoornhoorn, bloemenkransje, hartjesbril, regenboogstrik, sterrenspeldje en de gekleurde capes.
Wat wanneer vrijkomt staat in `src/content/looks.ts`.

## 4. Geluid

`public/sounds/`: `meow-1`, `meow-2` en `purr` zijn Katja's geluiden uit Rainbow Kitten. Goed-geluid, overwinning en startgeluid komen uit Lexi Brawl. De rest is WebAudio-synth.

## 5. Icoon

`public/misc/icon-192.png`, `icon-512.png` en `apple-touch-icon.png` (180): Katja's `beg`-sprite op een pastel achtergrond (roze, lila, lichtblauw), binnen de veilige zone voor maskable icons.
