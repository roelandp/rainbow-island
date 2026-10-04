# Assets die het spel mooier maken (allemaal optioneel)

Het spel draait volledig zonder extra bestanden: Kit Nugget is een sprite uit Kit Nugget Klimt, de dieren en meubels zijn figuurtjes uit code. Wat hieronder staat maakt het mooier. Gooi het in `public/models/` of `public/sprites/`, commit en push: de build pakt het vanzelf op (geen code aanpassen).

## 1. Kit Nugget in 3D (grootste winst)

**Bestand:** `public/models/kit-nugget.glb`

- Maak met Tripo3D (image to 3D) een model van `kit-nugget-klimt/reference/sheet.jpeg` (vooraanzicht plus zijaanzicht helpen).
- Exporteer als **één .glb met ingebakken textures** (embedded). Een .glb met een losse `Textures/`-map wordt wit, zoals de Lexi Brawl-characters.
- Houd het klein: liefst onder 3 MB, max ca. 20k driehoeken (iPad en iPhone moeten 60 fps halen). In Tripo: "low poly" of "smart low poly", texture 1024.
- Staande houding, pootjes op de grond, kijkt naar voren. Een skelet of animaties zijn niet nodig: het spel laat het hele model wiebelen, springen, draaien en liggen in code. Heeft het model toch animaties met namen als `idle` of `walk`, dan worden die gebruikt.
- Het spel schaalt het model zelf naar één tegel hoog.

Testen: zet het bestand neer, `npm run dev`, en open `?cat=glb` (of gewoon zonder parameter). Terug naar de sprite: `?cat=sprite`.

## 2. Dieren in 3D (optioneel)

**Bestanden:** `public/models/eend.glb`, `schildpad.glb`, `uil.glb`, `konijn.glb`, `kikker.glb`

Zelfde regels als hierboven (één .glb, embedded textures, klein). Staand, kijkend naar voren, schattig en pastel. Ontbreekt er een, dan gebruikt het spel het figuurtje uit code.

## 3. Nieuwe sprites (als er geen 3D-model komt)

De sprites `happy` en `surprised` uit Klimt hangen aan een krabpaal (met uitsparing), dus die gebruikt het eiland niet. Nu doet `jump` dienst als blij en `beg` als verbaasd (met een "!" erboven). Nieuwe plaatjes, zelfde stijl als de character sheet, op groen scherm, staand op de grond, volledig in beeld:

| Naam | Wat |
|---|---|
| `stand-happy` | staat, ogen dicht van plezier, grote lach |
| `stand-surprised` | staat, grote ogen, o-mondje, oortjes omhoog |
| `walk` | loopt naar rechts, één poot vooruit |
| `sit` | zit rechtop, staart om de pootjes |

Lever ze aan als PNG of JPEG op groen; Claude keyt ze uit en koppelt ze (`src/scene/cat.ts` en `src/scene/dressup.ts`).

## 4. Geluid (optioneel)

`public/sounds/` heeft nu: goed-geluid, overwinning en startgeluid uit Lexi Brawl, miauw en spinnen uit Klimt. De rest is WebAudio-synth. Een zacht golfjes-geluid (loop, 20 tot 40 seconden, mp3) zou sfeer geven.
