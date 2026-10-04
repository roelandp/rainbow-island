# Rainbow Island

Engelse woordjes oefenen voor Wyne (7). Katrien, een lapjeskitten, woont op een piepklein eiland. Dieren uit de buurt komen langs met een vraag over een Engels woord of een kort Engels zinnetje. Goede antwoorden leveren blokken, meubels en vissnoepjes op, en hoe meer woorden echt geleerd zijn, hoe groter het eiland wordt.

Live: https://roelandp.github.io/rainbow-island/

## Op de iPad zetten

1. Open https://roelandp.github.io/rainbow-island/ in **Safari**.
2. Tik op de **Deel**-knop (vierkantje met pijltje omhoog).
3. Kies **"Zet op beginscherm"**.

Rainbow Island staat dan als app op het beginscherm en werkt ook zonder internet. Nieuwe versies worden opgehaald zodra de app weer op het startscherm staat.

## Spelen en testen

```bash
npm install
npm run dev -- --host     # open het LAN-adres op iPad of telefoon
npm test                  # engine- en spellogica-tests
npm run build             # productiebuild in dist/
```

Elke push naar `main` bouwt en deployt via GitHub Actions naar GitHub Pages.

Debug: `?cat=sprite` of `?cat=primitive` forceert een andere Katrien.

## Nieuwe lijst toevoegen

1. Maak een JSON-bestand in `src/content/toetsen/`, bijvoorbeeld `engels_school.json` (of geef een foto van de lijst aan Claude: "Maak hier een nieuwe lijst van voor Rainbow Island").
2. Formaat:

```json
{
  "engels_school": {
    "title": "Engels: school",
    "date": null,
    "theme": "woordjes",
    "language": "en",
    "questions": [
      {
        "word": "mum / mother",
        "definition": "moeder",
        "hint": "Begint met 'mu...' of 'mo...'",
        "sentence": "My ___ is my dad's wife."
      },
      { "word": "This is my family.", "definition": "Dit is mijn familie." }
    ]
  }
}
```

   - `word` is het **Engels**, `definition` het **Nederlands**. Allebei verplicht.
   - `hint` is een korte Nederlandse hint, zoals "Begint met 'bro...'". Optioneel.
   - `sentence` is een simpele Engelse zin met `___` op de plek van het woord. Alleen bij losse woorden, niet bij korte zinnen. Zonder `sentence` slaat het spel "zin met gat" over.
   - Meerdere goede antwoorden: zet ze met `/` ertussen ("mum / mother"). Elk alternatief telt als goed.
   - Korte zinnen (eindigen op `.`, `?` of `!`) worden alleen gekozen, nooit getypt.
3. Weet je de datum van de toets? Zet `date` op die dag, bijvoorbeeld `"date": "2026-11-12"`. Dan telt het spel af en komen de woorden vlak voor de toets vaker langs. Zonder datum (`null`) gewoon oefenen, zonder aftelling.
4. `npm test`, dan commit en push naar `main`. De workflow deployt vanzelf. In Instellingen kies je welke lijst Wyne oefent. Voortgang van oudere lijsten blijft bewaard en telt mee voor de grootte van het eiland.

## Hoe het leren werkt

- Vier vraagsoorten, van makkelijk naar moeilijk: Nederlands zien en het Engels kiezen; Engels horen en zien en het Nederlands kiezen; Engelse zin met gat; het Engels typen.
- Alleen Engels wordt voorgelezen, nooit Nederlands.
- Leitner-doosjes 0 t/m 5. Met een toetsdatum worden de wachttijden korter als de toets dichtbij komt.
- Fout: het goede antwoord licht zacht op, wordt voorgelezen, en Wyne tikt of typt het alsnog. Het woord komt binnen 3 vragen terug. Nooit straffend.
- Typen: "the", "a" of "an" mag erbij of weg; hoofdletters en leestekens tellen niet; één letter anders is "bijna goed".
- Woordenkaart: per woord de status, hoe vaak goed of fout, en wanneer het terugkomt. Dit is ook het overzicht voor ouders.

## Credits

- Lettertype Nederlands: SchoolschriftLG, Bart Voorzanger & Liesbeth Flobbe (vrij voor niet-commercieel gebruik), syboor.eu/fonts/schoolschrift03/
- Katrien 3D: Meshy-model, versimpeld met `scripts/simplify-glb.mjs`.
- Katrien-sprites en geluiden: uit Rainbow Kitten.
