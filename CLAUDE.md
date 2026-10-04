# Kit Nugget Eiland

Woordjesspel voor Viggo (10). Kit Nugget, een rood kitten, woont op een piepklein eiland. Dieren uit de buurt komen langs met een vraag over een woord. Goede antwoorden leveren blokken, meubels en vissnoepjes op, waarmee Viggo het eiland zelf uitbouwt. Hoe meer woorden hij echt kent, hoe groter het eiland wordt.

Doel: woordenschat voor de schooltoets echt onthouden, niet alleen een spelletje. Dit vervangt de oude game Lexi Brawl.

**Harde deadline: donderdag 8 oktober 2026, toets "Thema Strips" (40 woorden).** Fase 1 moet uiterlijk maandag 5 oktober online staan, zodat Viggo nog een paar dagen kan oefenen. Bouwen, aankleden en de rest komen daarna.

## Huisregels

- Alle teksten in het spel in het Nederlands. Code en comments in het Engels.
- Altijd voluit "Kit Nugget", nooit alleen "Nugget".
- Geen em-dashes in teksten in het spel.
- Toon: nooit straffend. Geen rood scherm, geen buzzer, geen levens, geen game over. Een fout antwoord is een leermoment: je ziet het goede antwoord, je typt of tikt het alsnog, en het woord komt later terug.
- Geen extra dependencies zonder reden.

## Bestaande projecten om uit te putten

Kopieer wat bruikbaar is, verwijs er niet naar via relatieve paden.

**Lexi Brawl** (`/Users/roelandp/Code/Claude/projects/viggo-lexi-brawl`), de oude woordjesgame
- `src/data/words.json`: de toets (`toets_8_oktober`, 40 woorden). Formaat: `{ "<toets_id>": { title, theme, language, questions: [{ word, definition, hint }] } }`. Dit formaat moet blijven werken, want Roeland maakt elke paar weken een foto van een nieuwe woordenlijst en laat die omzetten.
- `src/store/gameStore.js`: oude mechaniek. Meerkeuze is het goede woord plus 3 foute uit dezelfde lijst; bij typen vergelijkt het spel de tekst na lowercase en trim. In level 2 zijn maximaal 2 hints mogelijk.
- `public/sounds/`: mp3's (correct, victory, gamestart). Bruikbaar, maar het buzz-geluid `game-game-over.mp3` niet gebruiken.
- `.github/workflows/`: deploy naar GitHub Pages bij een push naar main.

**Kit Nugget Klimt** (`/Users/roelandp/Code/Claude/projects/kit-nugget-klimt`), het tafelspel
- `CLAUDE.md`: toonregels, architectuur en de aanpak "elk asset is optioneel, er is altijd een fallback".
- `src/engine/leitner.ts`, `engine.ts`, `rng.ts` en de tests: het patroon voor slimme herhaling, aangepast voor woorden.
- `src/storage/`: één JSON-blob met `schemaVersion` en migraties, met een profiel-structuur.
- De service-worker-setup (skipWaiting, clientsClaim, updatecheck bij start, focus, online en interval; bij een nieuwe versie herladen met een kort bericht). Precies overgenomen: de oude Lexi Brawl bleef op oude versies hangen.
- `src/audio/audio.ts`: WebAudio-synth (zacht vragend "hm?" bij fout, glinstering, deuntje) en ontgrendelen op de eerste tik op iOS.
- `src/audio/speak.ts`: voorlezen met de Nederlandse systeemstem.
- `public/sprites/*.webp` (beg, happy, jump, sleep, surprised): Kit Nugget als uitgeknipte sprites. Kit Nugget op het eiland is een billboard-sprite hiervan.
- `src/content/looks.ts`, `src/scene/dressup.ts`: het aankleed-systeem (hoedjes, vachtjes).
- `reference/sheet.jpeg`: character sheet van Kit Nugget, voor kleuren en verhoudingen. Oranje cyperse kater: vacht `#f0a055`, strepen `#d9793a`, crème buik/snuit/pootjes/staartpunt `#f8dcae`, roze oortjes `#f2a39a`, bruine ogen.

## Stack

- Vite + TypeScript, vanilla (geen React)
- Three.js voor de scene
- Vitest voor engine en game-logica
- vite-plugin-pwa, offline speelbaar
- Geen backend, geen accounts, geen analytics
- GitHub Pages: repo `roelandp/kitnugget-eiland`. Vite `base: './'` zodat het onder elke subpad werkt. Deploy via GitHub Actions bij push naar main. Commit `dist/` niet, de workflow bouwt zelf.
- Testen op telefoon via LAN: `npm run dev -- --host`

## Structuur

```
src/
  content/
    toetsen/         een JSON per toets, zelfde formaat als Lexi Brawl words.json
    index.ts         laadt alle toetsen, kiest de actieve (nieuwste datum)
    animals.ts       de dieren-buren en hun zinnetjes
    blocks.ts        bouwblokken, meubels, prijzen
  engine/            per woord status, herhaling, vraagkiezer, antwoordcontrole. Pure TS, geen DOM, geen Three
  game/              ronde, beloningen, inventaris, eilandgroei, dagdoel
  scene/             Three.js: eiland, water, licht, camera, Kit Nugget, dieren, bouwraster
  ui/                vraagkaart, meerkeuze, typveld, bouwbalk, menu, toetsmodus, woordenkaart
  audio/
  storage/
public/
  models/            optioneel: kit-nugget.glb (Tripo3D-scan), andere scans
  sprites/           gekopieerd uit Kit Nugget Klimt
  sounds/
```

Regel: `engine` weet niets van graphics. `scene` krijgt alleen events: `animalArrives(id)`, `answerRight`, `answerWrong`, `reward(items)`, `islandGrew(size)`, `roundEnd`, `blockPlaced`, `dayDone`.

## Toetsformaat

Zelfde als Lexi Brawl, met optionele extra velden:

```json
{
  "toets_8_oktober": {
    "title": "Toets 8 Oktober: Woordenschat (Thema Strips)",
    "date": "2026-10-08",
    "theme": "woordenschat",
    "language": "nl",
    "questions": [
      {
        "word": "de dialoog",
        "definition": "Een gesprek tussen twee mensen.",
        "hint": "Begint met 'dia...', het tegenovergestelde van een monoloog.",
        "sentence": "In de strip voeren de twee helden een grappige ___."
      }
    ]
  }
}
```

- `date` en `sentence` zijn optioneel. Zonder `sentence` slaat het spel de vraagsoort "zin met gat" over. Zonder `date` telt de toets als oudst.
- Zinnen op het niveau van groep 7/8, met `___` op de plek van het woord (zonder lidwoord als het woord er een heeft).
- Het menu toont de actieve toets (die met de nieuwste datum) en een lijstje oudere toetsen.
- De README beschrijft hoe je een nieuwe toets toevoegt: foto van de lijst, Claude maakt de JSON in `src/content/toetsen/`, commit en push.

## Engine

Per woord bijhouden: `seen`, `correct`, `wrong`, `box` (Leitner 0 tot 5), `dueAt`, `lastSeen`, en per vraagsoort het aantal keer goed.

**Vraagsoorten**, van makkelijk naar moeilijk:
1. **Herkennen:** betekenis staat er, kies het woord uit 4.
2. **Omgekeerd:** woord staat er, kies de betekenis uit 4.
3. **Zin met gat:** kies het woord uit 4. Alleen als er een `sentence` is.
4. **Typen:** betekenis staat er, typ het woord.

- Een woord begint bij herkennen en schuift op naar moeilijker zodra het een paar keer goed is. Alleen typen telt zwaar voor "geleerd".
- **Afleiders:** neem de 3 foute opties bij voorkeur uit hetzelfde soort woord. Lidwoordwoorden bij lidwoordwoorden, werkwoorden op `-en` bij werkwoorden, uitdrukkingen ("op de hak nemen") bij uitdrukkingen. Nooit twee keer dezelfde optie.
- **Typen controleren:** lowercase, trim en dubbele spaties weg.
  - Het lidwoord is optioneel: "dialoog" en "de dialoog" zijn allebei goed. Een fout lidwoord ("het dialoog") is "bijna goed".
  - Zonder trema ("creeren" voor "creëren") of met één letter verschil is ook "bijna goed": je ziet het goede woord in beeld met de verschillen gemarkeerd, en het woord komt sneller terug. Op de toets telt spelling, dus "bijna" is niet "goed".
- **Hints bij typen:** maximaal 2 per vraag. Hint 1 toont het `hint`-veld, hint 2 de eerste letters (`c r e _ _ _ _`). Met hint is het antwoord goed maar levert het minder op.
- **Herhaling (Leitner):** goed = box omhoog. Fout = terug naar box 1 en binnen 3 vragen nog een keer.
  - Wachttijd per box: 0, 0 (zelfde ronde), 1 dag, 2 dagen, 4 dagen, 8 dagen.
  - Omdat de toets dichtbij is, mogen de wachttijden krimpen naarmate de `date` van de toets dichterbij komt. De dag voor de toets komt alles wat niet in box 4 of hoger zit sowieso terug.
- **Vraagkiezer per beurt:**
  1. Eerst een fout woord waarvan de wachttijd om is.
  2. Anders ongeveer 60% woorden die nu aan de beurt zijn of zwak zijn, 25% nieuwe woorden, 15% woorden die hij al kent.
  3. Nooit twee keer hetzelfde woord direct achter elkaar.
- **Status per woord** voor de woordenkaart: `nieuw`, `oefenen`, `bijna`, `geleerd`. `geleerd` = box 4 of hoger en minstens 2 keer goed getypt.

Vitest dekt: antwoordcontrole (lidwoord, trema, typo, uitdrukkingen), afleiders (geen dubbele, zelfde soort), Leitner-overgangen, terugkomen binnen 3 vragen, vraagkiezer-verdeling met seeded RNG, geen directe herhaling, schuiven tussen vraagsoorten en eilandgroei.

## Spelregels

**Ronde:** 12 vragen, ongeveer 4 minuten.

- Een dier komt per bootje of over het water aangezwommen, stapt op het eiland en stelt de vraag. De vraagkaart verschijnt onderin het scherm.
- **Goed:** het dier is blij, Kit Nugget springt, en de beloning vliegt naar de inventaris. Typen goed 2 blokken, meerkeuze goed 1 blok, met hint of bijna goed 1 blok.
- **Een reeks van 3 goed:** een vissnoepje erbij. Bij 5 een meubelstuk.
- **Fout:** Kit Nugget kijkt verbaasd. Het goede woord met betekenis komt in beeld en wordt voorgelezen. Viggo tikt of typt het goede antwoord alsnog. Daarna loopt het dier vrolijk door.
- **Einde ronde:** wat hij verdiend heeft, welke woorden nieuw geleerd zijn, en de 3 woorden die nog aandacht nodig hebben. Daarna door naar bouwen.

**Eilandgroei:** het eiland begint als 4x4 tegels.
- Per 5 woorden met status `geleerd` groeit het een ring of een strook, met een kort effect waarbij land uit het water omhoog komt.
- Bij alle 40 woorden geleerd is het eiland op volle grootte, met een vuurtorentje als beloning.
- Woorden uit oudere toetsen tellen ook mee, dus het eiland groeit over alle toetsen heen.

**Dagdoel:** 2 rondes per dag, getoond als 2 pootafdrukken die inkleuren.
- Na 2 rondes gaat de zon onder: "Kit Nugget is moe en tevreden. Morgen weer!" Doorspelen mag gewoon.
- Teller "dagen gespeeld", zonder verlies bij een gemiste dag.
- Is de laatste ronde meer dan 20 uur geleden, dan slaapt Kit Nugget in zijn mandje en maak je hem wakker met een tik.

## Bouwen (fase 2)

- Een bouwraster op het eiland. Tik op een tegel om het gekozen blok te plaatsen, en stapel zo omhoog. Een gum haalt het blok weg en geeft het terug.
- Blokken: gras, zand, steen, hout, water (een vijvertje) en bloemen. Meubels: kattenmand, krabpaal, voerbak, lantaarn, bankje, boompje, hek, vuurtorentje.
- De camera draait per kwartslag met twee knoppen (of een veeg). Knijp om in en uit te zoomen.
- Kit Nugget loopt rond over wat er gebouwd is, springt op blokken, slaapt in de mand als hij moe is, krabt aan de krabpaal en zit bij de voerbak als hij honger heeft.
- Vissnoepjes geef je door ze naar Kit Nugget te slepen. Een blij spinnetje en hartjes volgen.
- Het eiland wordt bewaard in storage (raster plus inventaris).

## Scene

- **Camera:** een orthografische camera onder de klassieke isometrische hoek. Alles is echt 3D.
- **Kleuren:** pastel. Lichtblauw water met zachte golfjes (een simpele shader of geanimeerde vertices), gras in zacht groen, zandranden, en een lucht met een verloop van lila naar blauw.
- **Licht:** een zachte zon met schaduwen (een kleine shadow map, pixel ratio maximaal 2). Warm oranje licht na het dagdoel of bij "klaar voor vandaag".
- **Blokken:** licht afgeronde kubussen (bevel), geen harde Minecraft-randen. Instanced meshes.
- **Kit Nugget:**
  - Volgorde van voorkeur: (1) `public/models/kit-nugget.glb` als die bestaat, (2) billboard-sprites uit Klimt (beg, happy, jump, sleep, surprised), (3) een figuurtje van primitives (oranjerode afgeronde vorm met oren en staart).
  - Animatie in code: idle-wiebel, squash en stretch bij springen, een staart die zwaait, lopen naar een doelpunt.
  - Gebouwd achter één interface zodat een scan later zonder verdere wijzigingen werkt. Een GLB wordt automatisch geschaald naar 1 tegel hoog. Tripo-scans hebben geen gegarandeerd skelet: animeer de hele mesh in code, en gebruik ingebouwde animaties alleen als ze er zijn.
- **Dieren-buren:** 5 stuks uit primitives (eend, schildpad, uil, konijn, kikker), elk met een eigen zinnetje ("Hoi Kit Nugget! Weet jij wat ... betekent?"). Ook hier: een optionele GLB per dier in `public/models/`.
- **Doel:** 60 fps op iPad en iPhone.

## UI

- **Liggend en staand**, maar ontworpen voor de iPad. Bovenin de scene, onderin de vraagkaart. Bij typen schuift de scene omhoog zodat het systeemtoetsenbord niets afdekt.
- **Meerkeuzeknoppen:** groot (minimaal 56 px hoog), tekst goed leesbaar, ook op lange betekenissen.
- **Typveld:** groot, autocorrectie en autocapitalize uit, spellcheck uit.
- **Luidsprekerknopje** op elke vraagkaart: lees de betekenis of de zin voor.
- **Startscherm:** het eiland met Kit Nugget, de pootafdrukken van het dagdoel, het aantal geleerde woorden van de actieve toets ("23 van 40") en de dagen tot de toets. Knoppen: Spelen, Bouwen, Proeftoets, Woordenkaart, Instellingen.
- **Proeftoets:** alle woorden van de actieve toets in willekeurige volgorde, steeds de betekenis en het woord typen. Geen hints en geen feedback per vraag. Resultaat: cijfer (1 tot 10), lijst met fouten en de goede spelling. Telt mee voor de engine. Laatste 10 resultaten bewaren. Beloning: 1 blok per goed antwoord.
- **Woordenkaart:** alle woorden van de actieve toets als tegels met een kleur per status. Tik op een woord: betekenis, zin, hoe vaak goed of fout, en voorlezen. Dit is ook het ouderoverzicht.
- **Instellingen:** actieve toets kiezen, geluid, voorlezen aan of uit, voortgang wissen (met bevestiging op de pagina zelf).
- Geen zoom en geen tekstselectie tijdens het spel, behalve in het typveld.

## Storage

Key `kitnugget-eiland.v1`, één JSON-blob met `schemaVersion` en migraties. Profiel-klaar: `{ schemaVersion, activeProfile: "viggo", profiles: { viggo: { words, island, inventory, look, days, tests } } }`. Woordstatus per toets en woord, zodat oude toetsen bewaard blijven.

## Fases

Commit per werkend onderdeel. Na elke fase: tests groen, `npm run build` slaagt, push (dan deployt de workflow).

1. **Voor maandag 5 oktober.**
   - Scaffold, PWA met auto-update, deploy-workflow, engine en tests, en de toets van 8 oktober met zinnen.
   - Ronde-loop met alle 4 vraagsoorten.
   - Een simpel eiland: een statisch blokjeseiland, water, Kit Nugget als sprite en een dier dat langskomt.
   - Beloningen in de inventaris, proeftoets, woordenkaart en storage.
   - Dit moet volledig speelbaar zijn om voor de toets te oefenen.
2. Bouwen: raster, plaatsen en weghalen, camera draaien, eilandgroei, Kit Nugget die rondloopt.
3. Dagdoel, zonsondergang, slapen en wakker worden, vissnoepjes voeren, aankleden (overnemen uit Klimt), voorlezen.
4. GLB-slot testen met een willekeurig GLB uit `/Users/roelandp/Code/Claude/projects/viggo-lexi-brawl/public/glbs` als stand-in.
5. Controle: als er een headless browser beschikbaar is, screenshots op 820x1180, 1180x820 en 390x844, en de layout nalopen.

Rapporteer aan het eind van elke fase: wat af is, wat op een fallback draait, de live URL, en hoe je op de telefoon test.

## Niet nu

Meerdere profielen in de UI, tweespelermodus, accounts, server, sync, analytics, en eigen woordenlijsten invoeren in de app.

## Stand van zaken (4 oktober 2026)

Live: https://roelandp.github.io/kitnugget-eiland/ (GitHub Pages via Actions; Pages staat op "GitHub Actions" als bron).

Fase 1 t/m 3 zijn gebouwd, fase 4 en 5 getest. Implementatienotities:
- Sprites: Klimt's `happy` en `surprised` hangen aan een paal en worden niet gebruikt. Pose-mapping: idle en surprised = `beg` (surprised met "!" en een hupje), happy en jump = `jump`, sleep = `sleep` (`src/scene/dressup.ts` `POSE_SPRITE`).
- Optionele GLB's in `public/models/` worden bij de build gevonden (`__MODELS__` in `vite.config.ts`), dus alleen bestaande modellen worden geladen. Zie `ASSETS.md`.
- Debug: `?cat=glb|sprite|primitive`.
- Tegelcoördinaten: tegel (x, z) beslaat wereld [x, x+1] x [z, z+1]; grond y = 0, water y = -0.3; meubel-`rot` is in kwartslagen.
- Engine-keuzes bovenop de spec: meerkeuze tilt een woord hooguit naar doosje 3, de bovenste doosjes verdien je met typen; een woord dat schoon goed getypt wordt springt naar minstens doosje 4; meteen goed herkend slaat de omgekeerd-stap over; bij weinig dagen tot de toets en veel ongeziene woorden groeit het aandeel nieuwe woorden (max 60%).
- Eilandgroei: 4x4, dan om en om een strook breder/dieper per 5 geleerde woorden, 8x8 bij 40, max 12x12.
- Het vuurtorentje komt in de inventaris (eenmalig per toets) en zet je zelf neer in Bouwen.
