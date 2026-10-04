# Rainbow Island

Engelse woordjes voor Wyne (7). Precies dezelfde gameplay als Kit Nugget Eiland (Viggo), maar met een andere kat, andere woorden, en vertalen in twee richtingen (NL naar EN en EN naar NL). De kat heet **Katrien** (vroeger Katja in Rainbow Kitten), een lapjeskitten.

Repo: `roelandp/rainbow-island`. Live: https://roelandp.github.io/rainbow-island/ (Pages via GitHub Actions).

## Bronnen (lezen, kopiëren, niet naar verwijzen via relatieve paden)

1. **Kit Nugget Eiland** `/Users/roelandp/Code/Claude/projects/kitnugget-eiland`: de basis, hierheen gekopieerd. Zie daar `CLAUDE.md` ("Stand van zaken"), `ASSETS.md`, `scripts/README-glb.md`. Alle gameplay blijft gelijk: rondes met dieren die langskomen; Leitner met wachttijden die krimpen voor de toets; vraagkiezer met meer nieuwe woorden vlak voor de toets; beloningen (blokken, vissnoepjes); eilandgroei per 5 geleerde woorden; bouwen met draaien van meubels en lopen; bouwtijd (max 5 min, één keer verlengen, daarna eerst een hele ronde); proeftoets, woordenkaart, aankleden; dagdoel, zonsondergang, slapen en wakker worden; vegen om te draaien, knijpen om te zoomen; tikken op de kat om haar te verplaatsen; PWA die updates pas op het startscherm toepast; de review-fixes. Alles wat daar al opgelost is, blijft opgelost.
2. **Rainbow Kitten** `/Users/roelandp/Code/Claude/projects/wyne-rainbow-kitten-english`: Wynes vorige spel met Katja.
   - `CLAUDE.md`: de toon en Wynes regels.
   - `src/content/words.json`: de woorden (twee lijsten: family tree en zinnen). Neem ze letterlijk over, ook "mum / mother" en "Zijn naam is …".
   - `src/audio/speech.ts`: Engelse uitspraak, unlock in de eerste tik, utterances vasthouden zodat WebKit lange zinnen niet afkapt. Vervangt de Nederlandse `speak.ts`.
   - `public/audio/meow.mp3`, `meow2.mp3`, `purr.mp3`: geluiden van Katja. Gebruikt als meow-1, meow-2 en purr.
   - `public/sprites/*.webp`: Katja-sprites. `beg`, `jump`, `sleep`, `wake` en `confetti` staan los; `hang`, `surprised` en `happy` hangen tegen een muur: niet gebruiken. Dressup-ankers (kop, gezicht) opnieuw meten op deze sprites.
   - `public/items/*.webp` (bow, cape, crown, mouse-toy, party-hat): extra items voor aankleden.
   - `visuals/katja-charactersheet.jpeg`: kleuren. Zwarte en oranje vlekken, witte bles, witte snuit, borst en pootjes, roze neus, bruine/amber ogen.
3. **3D-model:** `glbs/Meshy_AI_Calico_Character_Shee_*_texture.glb` (Meshy-kat met textuur). Versimpeld met `scripts/simplify-glb.mjs` naar `public/models/katrien.glb`. `glbs/` en `3dglbs/` staan in `.gitignore`.

## Huisregels

- Alle teksten in het spel in **simpel Nederlands**, korte zinnen, grote letters. Wyne is 7. Engels alleen bij de woorden en zinnen zelf.
- Naam altijd **"Katrien"**, nooit "de kat". Katrien is een meisje: zij/haar. Nooit "Kit Nugget", nooit "hem/hij/zijn" over Katrien.
- Geen em-dashes in teksten in het spel. Code en comments in het Engels.
- Nooit straffend: geen rood, geen buzzer, geen levens. Bij fout licht het goede antwoord zacht op, wordt het Engels voorgelezen, en tikt of typt Wyne het alsnog.
- Geen zichtbare tijdsdruk bij vragen. Het bouwklokje geldt alleen voor bouwen.
- Geen extra dependencies.

## Stack en deploy

- Vite + TS vanilla, Three.js, Vitest, vite-plugin-pwa (`registerType: 'prompt'`, update pas op het startscherm), `base: './'`.
- Deploy: `.github/workflows/deploy.yml` bij push naar main. Pages staat op "GitHub Actions".
- Storage-key `rainbow-island.v1`, profiel `wyne`.
- Titel en manifest: "Rainbow Island". Icoon: Katja-sprite (beg) op pastel achtergrond, 192, 512 en 180 px.

## Woorden en toetsformaat

Toetsen in `src/content/toetsen/`, formaat van Kit Nugget Eiland zodat de engine gelijk blijft:

- `word` = Engels; `definition` = Nederlands; `hint` = korte Nederlandse hint ("Begint met 'mu...'"); `sentence` = simpele Engelse zin met `___` op de plek van het woord (alleen bij losse woorden, niet bij de korte zinnen; groep 4-niveau, met woorden uit dezelfde lijst); extra veld `language: "en"` op toetsniveau.

```json
{ "engels_familie": { "title": "Engels: familie", "date": null, "theme": "woordjes", "language": "en",
  "questions": [ { "word": "mum / mother", "definition": "moeder", "hint": "Begint met 'mu...' of 'mo...'", "sentence": "This is my ___." } ] } }
```

- De **toetsdatum** is onbekend: `date: null`. Zonder datum geen aftelling en de normale Leitner-wachttijden.
- Nieuwe lijst toevoegen: zie README.

## Vraagsoorten (van makkelijk naar moeilijk)

1. **NL naar EN, kiezen:** Nederlands groot in beeld, kies het Engels uit 4. Na het antwoord wordt het Engels voorgelezen.
2. **EN naar NL, kiezen:** Engels groot in beeld (met luidsprekerknop, direct voorgelezen), kies het Nederlands uit 4.
3. **Zin met gat:** Engelse zin met gat, kies het woord. Nederlandse vertaling van het woord klein eronder. Na het antwoord wordt de hele zin voorgelezen.
4. **Typen:** Nederlands in beeld, typ het Engels. Hint 1 is de hint, hint 2 zijn de eerste letters. Bij typen wordt het Engels pas na het antwoord voorgelezen.

**Voorlezen:** alleen Engels, nooit Nederlands. De luidsprekerknop leest altijd het Engels: bij soort 1 en 4 pas na het antwoord, bij 2 en 3 direct.

**Antwoordcontrole voor Engels** (`engine/answer.ts`):
- Alternatieven met "/": elk alternatief telt als goed ("mum" en "mother" bij "mum / mother"). Op de antwoordknoppen staat de volledige tekst.
- Engels lidwoord "the", "a" of "an" ervoor of weglaten: altijd goed.
- Niet meetellen: hoofdletters, punt, vraagteken, uitroepteken, komma, dubbele spaties.
- Eén letter anders: "bijna goed", zoals bij de Nederlandse spelling.
- De Nederlandse heuristieken (de/het, -en) gelden alleen voor `language: "nl"`. Engels: soort `sentence` (eindigt op . ? ! of heeft 4+ woorden), `phrase` (2 of 3 woorden), `word`.
- Afleiders: zinnen bij zinnen, woorden bij woorden, zelfde soort als het antwoord.

**Korte zinnen:** typen is te zwaar. Alleen soort 1 en 2. "Geleerd" voor een zin: box 4 of hoger, en minstens 2 keer goed in beide richtingen met minstens 2 uur ertussen. Typen bestaat niet voor zinnen. Vastgelegd in `engine/words.ts`, met tests.

**Tempo voor een 7-jarige:** rondes van 10 vragen in plaats van 12. Knoppen minimaal 64 px. Antwoordtekst groter dan bij Viggo. Schoolschrift-font voor het Nederlands in beeld; Engelse woorden en zinnen in een rond schreefloos font (systeemfont), zoals in haar schoolboek.

**Dieren:** dezelfde vijf, met zinnetjes in simpel Nederlands met "Katrien" ("Hoi Katrien! Weet jij hoe je dit in het Engels zegt?", "Kwak! Ken jij dit woord?").

**Aankleden:** hoedjes uit Kit Nugget plus de Rainbow Kitten-items (strik, kroon, feesthoed, cape alleen bij de sprite, muisje). Unlocks op geleerde woorden, rondes en dagen. Op het 3D-model alleen hoedjes en accessoires op de kop.

## Controle

- Headless Chromium: `~/Library/Caches/ms-playwright/chromium-1033`, playwright-core in `/Users/roelandp/Code/Claude/projects/kit-nugget-klimt/node_modules`. Flags `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Screenshots op 820x1180, 1180x820 en 390x844 van: startscherm, de vier vraagsoorten (met lange zinnen), fout antwoord, resultaat met groeibalk, bouwen met bouwklok en pop-up, proeftoets, woordenkaart, aankleden, instellingen. Geen afgesneden tekst, geen scrollbalken, geen "Kit Nugget" of "hem/hij" over Katrien.
- Simulatie: 2 rondes per dag tot alle woorden gezien en geleerd zijn.

## Niet nu

Profielkeuze tussen Viggo en Wyne in één app, sync, analytics, eigen woorden invoeren in de app.
