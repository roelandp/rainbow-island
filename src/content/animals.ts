import type { AnimalId } from '../scene/animals'

/** An animal neighbour and its lines. All lines are Dutch, short and never punishing. */
export interface AnimalInfo {
  id: AnimalId
  naam: string
  /** Greeting lines without a placeholder, usable for every question type. */
  ask: string[]
  /** Greeting lines with `{woord}`, replaced by the word (or "dit woord"). Used when the word is shown. */
  askWord: string[]
  /** Lines when the answer is right. */
  happy: string[]
  /** Gentle lines after a wrong answer: never punishing, encouraging. */
  learn: string[]
  bye: string[]
}

export const ANIMALS: AnimalInfo[] = [
  {
    id: 'eend',
    naam: 'Eend',
    ask: [
      'Kwak! Hoi Katrien! Weet jij welk woord hierbij hoort?',
      'Kwak kwak! Ik heb een vraagje voor je, Katrien.',
      'Hallo Katrien! Help je mij met dit woord?',
      'Kwak! Ik zwom helemaal hierheen voor deze vraag.',
    ],
    askWord: [
      'Kwak! Weet jij wat {woord} betekent?',
      'Hoi Katrien! Wat betekent {woord} eigenlijk?',
      'Kwak kwak! Ik hoorde het woord {woord}. Wat is dat?',
      'Katrien, kun jij mij {woord} uitleggen?',
    ],
    happy: [
      'Kwak! Helemaal goed!',
      'Kwak kwak, wat knap van jou!',
      'Ja! Daar word ik heel blij van. Kwak!',
      'Super, Katrien! Mijn veren staan rechtop!',
      'Kwak! Jij weet echt veel woorden.',
    ],
    learn: [
      'Kwak! Nu weet je het. Volgende keer lukt het vast.',
      'Kijk, zo zit het. Dat onthouden we samen!',
      'Geeft niks, Katrien. Nu ken je het woord.',
      'Kwak! Even goed kijken, dan zit het erin.',
      'Dit was een lastige. Straks probeer je het nog eens.',
    ],
    bye: [
      'Kwak! Dank je wel, Katrien!',
      'Ik zwem weer verder. Tot snel!',
      'Kwak kwak, doei doei!',
      'Bedankt! Ik kom gauw weer langs.',
    ],
  },
  {
    id: 'schildpad',
    naam: 'Schildpad',
    ask: [
      'Rustig aan... Hoi Katrien. Ik heb een vraag.',
      'Hallo Katrien. Weet jij welk woord hierbij hoort?',
      'Rustig aan... denk er maar even goed over na.',
      'Ik ben langzaam, maar ik heb een mooie vraag.',
    ],
    askWord: [
      'Rustig aan... weet jij wat {woord} betekent?',
      'Hoi Katrien. Wat betekent {woord}?',
      'Ik dacht onderweg aan {woord}. Wat is dat ook alweer?',
      'Neem je tijd. Wat betekent {woord}?',
    ],
    happy: [
      'Heel goed, Katrien. Rustig en knap.',
      'Mooi zo. Dat weet je echt.',
      'Precies goed. Daar word ik warm van.',
      'Rustig aan... en toch meteen goed!',
      'Wat fijn. Jij leert snel.',
    ],
    learn: [
      'Rustig aan. Nu weet je het, en dat is fijn.',
      'Geeft niks. Ik leer ook stap voor stap.',
      'Kijk nog even rustig. Volgende keer lukt het vast.',
      'Zo zit het. Langzaam leren is ook leren.',
      'Nu ken je het woord. Straks komt het terug.',
    ],
    bye: [
      'Dank je wel, Katrien. Ik ga weer rustig verder.',
      'Tot later. Het duurt even voor ik thuis ben.',
      'Bedankt. Rustig aan, hoor!',
      'Doei Katrien. Ik kom weer langs.',
    ],
  },
  {
    id: 'uil',
    naam: 'Uil',
    ask: [
      'Oehoe! Hoi Katrien. Ik heb een wijze vraag.',
      'Oehoe, weet jij welk woord hierbij hoort?',
      'Hallo Katrien. Zullen we samen slim zijn?',
      'Oehoe! Ik las iets in mijn boek. Help je mij?',
    ],
    askWord: [
      'Oehoe! Weet jij wat {woord} betekent?',
      'Hoi Katrien. Wat betekent het woord {woord}?',
      'Oehoe, ik las {woord} in een boek. Wat is dat?',
      'Een wijze vraag: wat betekent {woord}?',
    ],
    happy: [
      'Oehoe! Dat is helemaal goed.',
      'Heel wijs, Katrien!',
      'Oehoe oehoe, wat ben jij slim!',
      'Precies! Dat schrijf ik op in mijn boek.',
      'Knap gedaan. Jij wordt een echte woordenuil.',
    ],
    learn: [
      'Oehoe. Nu weet je het. Volgende keer lukt het vast.',
      'Ook wijze uilen leren elke dag iets nieuws.',
      'Kijk, zo zit het. Dat onthoud je vast.',
      'Oehoe, geeft niks. Straks vraag ik het nog eens.',
      'Van leren word je wijs. Nu ken je het!',
    ],
    bye: [
      'Oehoe! Dank je wel, Katrien.',
      'Ik vlieg weer naar mijn boom. Tot ziens!',
      'Oehoe, tot de volgende keer!',
      'Bedankt voor het slimme antwoord. Doei!',
    ],
  },
  {
    id: 'konijn',
    naam: 'Konijn',
    ask: [
      'Hoi hoi Katrien! Snel, ik heb een vraag!',
      'Hup, hier ben ik! Weet jij welk woord hierbij hoort?',
      'Hallo Katrien! Ik roeide zo snel als ik kon!',
      'Hoi! Doe je mee? Ik heb een leuke vraag!',
    ],
    askWord: [
      'Hoi Katrien! Wat betekent {woord}?',
      'Snel, snel! Weet jij wat {woord} betekent?',
      'Hup! Ik hoorde {woord}. Wat is dat?',
      'Hoi hoi! Kun jij mij {woord} uitleggen?',
    ],
    happy: [
      'Jaaa! Goed zo, Katrien!',
      'Hup hup hoera! Helemaal goed!',
      'Wauw, wat snel en wat knap!',
      'Goed! Ik maak een vreugdesprongetje!',
      'Super! Mijn oren wiebelen van blijdschap!',
    ],
    learn: [
      'Nu weet je het! Volgende keer lukt het vast.',
      'Geeft niks! Ik spring ook weleens mis.',
      'Kijk, zo is het. Hup, weer verder!',
      'Nu ken je het woord. Straks nog een keer!',
      'Even goed kijken, dan onthoud je het vast.',
    ],
    bye: [
      'Doei Katrien! Ik roei weer naar huis!',
      'Bedankt! Tot snel, hup hup!',
      'Hoi hoi, ik ga weer! Dag!',
      'Dank je wel! Ik kom gauw terug!',
    ],
  },
  {
    id: 'kikker',
    naam: 'Kikker',
    ask: [
      'Kwaak! Hoi Katrien! Ik heb een vraag.',
      'Kwaak kwaak! Weet jij welk woord hierbij hoort?',
      'Hallo Katrien! Ik sprong van blad naar blad hierheen.',
      'Kwaak! Help je mij even met een woord?',
    ],
    askWord: [
      'Kwaak! Weet jij wat {woord} betekent?',
      'Hoi Katrien! Wat betekent {woord}?',
      'Kwaak kwaak, wat is {woord} eigenlijk?',
      'Ik hoorde {woord} bij de vijver. Wat is dat?',
    ],
    happy: [
      'Kwaak! Helemaal goed!',
      'Kwaak kwaak, wat goed van jou!',
      'Ja! Ik maak een kikkersprong van blijdschap!',
      'Top, Katrien! Kwaak!',
      'Goed zo! Mijn strikje glimt ervan.',
    ],
    learn: [
      'Kwaak! Nu weet je het. Volgende keer lukt het vast.',
      'Geeft niks. Zo leren we samen.',
      'Kijk, zo zit het. Dat onthoud je vast!',
      'Kwaak, nu ken je het woord.',
      'Straks vraag ik het nog eens. Dan weet je het!',
    ],
    bye: [
      'Kwaak! Dank je wel, Katrien!',
      'Ik spring weer naar de vijver. Doei!',
      'Kwaak kwaak, tot snel!',
      'Bedankt! Ik kom weer langs.',
    ],
  },
]

export function animalById(id: AnimalId): AnimalInfo {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]
}
