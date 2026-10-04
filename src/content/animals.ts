import type { AnimalId } from '../scene/animals'

/** An animal neighbour and its lines. Lines are simple Dutch (a few easy English words), short and never punishing. */
export interface AnimalInfo {
  id: AnimalId
  naam: string
  /** Greeting lines without a placeholder, usable for every question type. */
  ask: string[]
  /** Greeting lines with `{woord}`, replaced by the English word (or "dit woord"). Used when the English is shown. */
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
      'Hoi Katrien! Weet jij wat dit betekent in het Nederlands?',
      'Kwak! Ken jij dit woord?',
      'Kwak kwak! Ik heb een Engels vraagje voor je.',
      'Hallo Katrien! Help je mij met Engels?',
    ],
    askWord: [
      'Kwak! Weet jij wat {woord} betekent?',
      'Hoi Katrien! Wat is {woord} in het Nederlands?',
      'Kwak kwak! Ik hoorde {woord}. Wat is dat?',
      'Katrien, ken jij {woord}?',
    ],
    happy: [
      'Kwak! Helemaal goed!',
      'Kwak kwak, wat knap van jou!',
      'Yes! Daar word ik heel blij van. Kwak!',
      'Super, Katrien! Mijn veren staan rechtop!',
      'Kwak! Jij kent al veel Engels.',
    ],
    learn: [
      'Kwak! Nu weet je het. Volgende keer lukt het vast.',
      'Kijk, zo zeg je het. Dat onthouden we samen!',
      'Geeft niks, Katrien. Nu ken je het woord.',
      'Kwak! Zeg het maar even na.',
      'Dit was een lastige. Straks probeer je het nog eens.',
    ],
    bye: [
      'Kwak! Thank you, Katrien!',
      'Ik zwem weer verder. Tot snel!',
      'Kwak kwak, bye bye!',
      'Dank je wel! Ik kom gauw weer langs.',
    ],
  },
  {
    id: 'schildpad',
    naam: 'Schildpad',
    ask: [
      'Rustig aan... Hoi Katrien. Wat betekent dit in het Nederlands?',
      'Hallo Katrien. Ken jij dit woord?',
      'Rustig aan... denk er maar even goed over na.',
      'Ik ben langzaam, maar ik leer ook Engels.',
    ],
    askWord: [
      'Rustig aan... weet jij wat {woord} betekent?',
      'Hoi Katrien. Wat is {woord} in het Nederlands?',
      'Ik dacht onderweg aan {woord}. Wat is dat ook alweer?',
      'Neem je tijd. Wat betekent {woord}?',
    ],
    happy: [
      'Heel goed, Katrien. Rustig en knap.',
      'Mooi zo. Dat weet je echt.',
      'Precies goed. Daar word ik warm van.',
      'Rustig aan... en toch meteen goed!',
      'Very good! Jij leert snel.',
    ],
    learn: [
      'Rustig aan. Nu weet je het, en dat is fijn.',
      'Geeft niks. Ik leer ook stap voor stap.',
      'Luister nog even rustig. Volgende keer lukt het vast.',
      'Zo zeg je het. Langzaam leren is ook leren.',
      'Nu ken je het woord. Straks komt het terug.',
    ],
    bye: [
      'Thank you, Katrien. Ik ga weer rustig verder.',
      'Tot later. Het duurt even voor ik thuis ben.',
      'Dank je wel. Rustig aan, hoor!',
      'Bye bye, Katrien. Ik kom weer langs.',
    ],
  },
  {
    id: 'uil',
    naam: 'Uil',
    ask: [
      'Oehoe! Hoi Katrien. Weet jij wat dit betekent?',
      'Oehoe, ken jij dit woord?',
      'Hallo Katrien. Zullen we samen Engels oefenen?',
      'Oehoe! Ik las een Engels boek. Help je mij?',
    ],
    askWord: [
      'Oehoe! Weet jij wat {woord} betekent?',
      'Hoi Katrien. Wat is {woord} in het Nederlands?',
      'Oehoe, ik las {woord} in een boek. Wat is dat?',
      'Een wijze vraag: wat betekent {woord}?',
    ],
    happy: [
      'Oehoe! Dat is helemaal goed.',
      'Heel wijs, Katrien!',
      'Oehoe oehoe, wat ben jij slim!',
      'Well done! Dat schrijf ik op in mijn boek.',
      'Knap gedaan. Jij spreekt al echt Engels.',
    ],
    learn: [
      'Oehoe. Nu weet je het. Volgende keer lukt het vast.',
      'Ook wijze uilen leren elke dag een nieuw woord.',
      'Kijk, zo zeg je het. Dat onthoud je vast.',
      'Oehoe, geeft niks. Straks vraag ik het nog eens.',
      'Van leren word je wijs. Nu ken je het!',
    ],
    bye: [
      'Oehoe! Thank you, Katrien.',
      'Ik vlieg weer naar mijn boom. Bye bye!',
      'Oehoe, tot de volgende keer!',
      'Dank je wel voor het slimme antwoord. Doei!',
    ],
  },
  {
    id: 'konijn',
    naam: 'Konijn',
    ask: [
      'Hoi hoi Katrien! Snel, wat betekent dit in het Nederlands?',
      'Hup, hier ben ik! Ken jij dit woord?',
      'Hallo Katrien! Ik roeide zo snel als ik kon!',
      'Hello! Doe je mee? Ik heb een leuke vraag!',
    ],
    askWord: [
      'Hoi Katrien! Wat betekent {woord}?',
      'Snel, snel! Wat is {woord} in het Nederlands?',
      'Hup! Ik hoorde {woord}. Wat is dat?',
      'Hoi hoi! Ken jij {woord}?',
    ],
    happy: [
      'Jaaa! Goed zo, Katrien!',
      'Hup hup hoera! Helemaal goed!',
      'Wauw, wat snel en wat knap!',
      'Yes! Ik maak een vreugdesprongetje!',
      'Super! Mijn oren wiebelen van blijdschap!',
    ],
    learn: [
      'Nu weet je het! Volgende keer lukt het vast.',
      'Geeft niks! Ik spring ook weleens mis.',
      'Luister, zo zeg je het. Hup, weer verder!',
      'Nu ken je het woord. Straks nog een keer!',
      'Zeg het maar even na, dan onthoud je het vast.',
    ],
    bye: [
      'Bye bye, Katrien! Ik roei weer naar huis!',
      'Thank you! Tot snel, hup hup!',
      'Hoi hoi, ik ga weer! Dag!',
      'Dank je wel! Ik kom gauw terug!',
    ],
  },
  {
    id: 'kikker',
    naam: 'Kikker',
    ask: [
      'Kwaak! Hoi Katrien! Weet jij wat dit betekent?',
      'Kwaak kwaak! Ken jij dit woord?',
      'Hallo Katrien! Ik sprong van blad naar blad hierheen.',
      'Kwaak! Help je mij even met Engels?',
    ],
    askWord: [
      'Kwaak! Weet jij wat {woord} betekent?',
      'Hoi Katrien! Wat is {woord} in het Nederlands?',
      'Kwaak kwaak, wat is {woord} eigenlijk?',
      'Ik hoorde {woord} bij de vijver. Wat is dat?',
    ],
    happy: [
      'Kwaak! Helemaal goed!',
      'Kwaak kwaak, wat goed van jou!',
      'Yes! Ik maak een kikkersprong van blijdschap!',
      'Top, Katrien! Kwaak!',
      'Goed zo! Mijn strikje glimt ervan.',
    ],
    learn: [
      'Kwaak! Nu weet je het. Volgende keer lukt het vast.',
      'Geeft niks. Zo leren we samen.',
      'Luister, zo zeg je het. Dat onthoud je vast!',
      'Kwaak, nu ken je het woord.',
      'Straks vraag ik het nog eens. Dan weet je het!',
    ],
    bye: [
      'Kwaak! Thank you, Katrien!',
      'Ik spring weer naar de vijver. Bye bye!',
      'Kwaak kwaak, tot snel!',
      'Dank je wel! Ik kom weer langs.',
    ],
  },
  {
    id: 'olifant',
    naam: 'Ollie',
    ask: [
      'Toet toet! Ik ben Ollie de olifant. Hoi Katrien!',
      'Ollie wil het weten: wat betekent dit in het Nederlands?',
      'Hoi Katrien! Ollie heeft een Engels vraagje.',
      'Toet! Help je Ollie even met Engels?',
    ],
    askWord: [
      'Toet toet! Weet jij wat {woord} betekent?',
      'Hoi Katrien! Wat is {woord} in het Nederlands?',
      'Ollie hoorde {woord}. Wat is dat?',
      'Ollie wil het weten: wat betekent {woord}?',
    ],
    happy: [
      'Toeteroe! Goed zo!',
      'Ollie vergeet nooit iets. Jij ook niet!',
      'Toet toet! Helemaal goed, Katrien!',
      'Yes! Mijn slurf gaat omhoog van blijdschap!',
      'Wat knap! Mijn oren flapperen ervan.',
    ],
    learn: [
      'Toet. Nu weet je het. Volgende keer lukt het vast.',
      'Geeft niks, Katrien. Ollie leert ook elke dag.',
      'Luister, zo zeg je het. Dat onthouden we samen!',
      'Nu ken je het woord. Straks vraagt Ollie het nog eens.',
      'Zeg het maar even na. Dan vergeet je het niet!',
    ],
    bye: [
      'Toet toet! Thank you, Katrien!',
      'Ollie zwemt weer naar huis. Bye bye!',
      'Dank je wel! Ollie komt gauw terug.',
      'Toeteroe, tot snel!',
    ],
  },
]

export function animalById(id: AnimalId): AnimalInfo {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]
}
