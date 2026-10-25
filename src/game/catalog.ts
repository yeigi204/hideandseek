// Fragen und Curses aus dem Regeldokument.

export type AnswerSpec =
  | { type: 'choice'; options: string[] }
  | { type: 'photo' }
  | { type: 'text'; placeholder?: string };

export type HintKind = 'northsouth' | 'eastwest' | 'canton' | 'grossregion' | 'airport' | 'radar' | 'station';

export interface QuestionDef {
  key: string;
  text: string;
  answer: AnswerSpec;
  hint?: HintKind;
  links?: { label: string; url: string }[];
}

export interface CategoryDef {
  key: CategoryKey;
  name: string;
  emoji: string;
  coins: number;
  answerMinutes: number;
  intro: string;
  questions: QuestionDef[];
}

export type CategoryKey = 'relativ' | 'radar' | 'foto' | 'kunterbunt' | 'praezision';

const YES_NO = { type: 'choice', options: ['Ja', 'Nein'] } as const satisfies AnswerSpec;
const PHOTO = { type: 'photo' } as const satisfies AnswerSpec;

export const RADAR_DISTANCES = [30, 100, 500, 1000, 5000, 10000, 25000, 50000];

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'relativ',
    name: 'Relativ',
    emoji: '🧭',
    coins: 40,
    answerMinutes: 5,
    intro: 'Position von den Hiders bzgl. den Seekers:',
    questions: [
      { key: 'rel-ns', text: 'Nördlicher/Südlicher', answer: { type: 'choice', options: ['Nördlicher', 'Südlicher'] }, hint: 'northsouth' },
      { key: 'rel-ew', text: 'Westlich/Östlicher', answer: { type: 'choice', options: ['Westlicher', 'Östlicher'] }, hint: 'eastwest' },
      {
        key: 'rel-hoehe',
        text: 'Höher-/Tiefer gelegen (nach Höhe der Ortschaft auf Wikipedia)',
        answer: { type: 'choice', options: ['Höher', 'Tiefer'] },
        hint: 'canton',
      },
      { key: 'rel-kanton', text: 'Gleicher Kanton', answer: YES_NO, hint: 'canton' },
      {
        key: 'rel-einwohner',
        text: 'Kantonseinwohner mehr/weniger',
        answer: { type: 'choice', options: ['Mehr', 'Weniger'] },
        hint: 'canton',
        links: [{ label: 'Wikipedia: Kanton (Schweiz)', url: 'https://de.wikipedia.org/wiki/Kanton_(Schweiz)' }],
      },
      {
        key: 'rel-temp',
        text: 'Temperatur mehr/weniger (Tagesmaximum, SRF Meteo)',
        answer: { type: 'choice', options: ['Mehr', 'Weniger'] },
        links: [{ label: 'SRF Meteo', url: 'https://www.srf.ch/meteo' }],
      },
      {
        key: 'rel-sprache',
        text: 'Gleiche Sprachregion',
        answer: YES_NO,
        hint: 'canton',
        links: [
          {
            label: 'Karte Sprachgebiete 2024',
            url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Karte_Schweizer_Sprachgebiete_2024.png',
          },
        ],
      },
      {
        key: 'rel-grossregion',
        text: 'Gleiche Grossregion',
        answer: YES_NO,
        hint: 'grossregion',
        links: [{ label: 'Wikipedia: Grossregion (Schweiz)', url: 'https://de.wikipedia.org/wiki/Grossregion_(Schweiz)' }],
      },
      {
        key: 'rel-airport',
        text: 'Ist der nächste internationale Airport in der Schweiz der Gleiche? (Zürich, Genf, Basel) (Luftlinie)',
        answer: YES_NO,
        hint: 'airport',
      },
      {
        key: 'rel-wahl',
        text: 'Hat der Kanton der Seekers in der Nationalratswahl 2023 gleich gewählt wie der Kanton der Hiders (Wahlsieger Partei)',
        answer: YES_NO,
        hint: 'canton',
      },
    ],
  },
  {
    key: 'radar',
    name: 'Radar',
    emoji: '📡',
    coins: 30,
    answerMinutes: 5,
    intro: 'Seid ihr innerhalb folgendem Radius der Seekers:',
    questions: [
      { key: 'radar', text: 'Seid ihr innerhalb von {radius} der Seekers?', answer: YES_NO, hint: 'radar' },
    ],
  },
  {
    key: 'foto',
    name: 'Foto',
    emoji: '📸',
    coins: 15,
    answerMinutes: 15,
    intro: 'Sendet ein Foto von (use common sense):',
    questions: [
      { key: 'foto-berg', text: 'dem höchsten Berg, den ihr von eurer Location sehen könnt und in eurer Nähe ist (mind. 50% des Berges soll beinhaltet sein)', answer: PHOTO },
      { key: 'foto-gewaesser', text: 'dem grössten Gewässer in eurer Location (das gegenüberliegende Ufer muss sichtbar sein)', answer: PHOTO },
      { key: 'foto-gemeindehaus', text: 'dem Gemeindehaus (eine Türe muss sichtbar und erkennbar sein)', answer: PHOTO },
      { key: 'foto-station', text: 'der nächsten Zugstation (eine Wand, Gleise, Perron o.ä. muss sichtbar sein)', answer: PHOTO },
      { key: 'foto-supermarkt', text: 'des nächsten Supermarktes', answer: PHOTO },
      { key: 'foto-kirche', text: 'der nächsten Kirche', answer: PHOTO },
      { key: 'foto-seilbahn', text: 'der nächsten Seilbahn', answer: PHOTO },
      { key: 'foto-schule', text: 'der nächsten Schule', answer: PHOTO },
      { key: 'foto-mcdonalds', text: 'des nächsten McDonalds', answer: PHOTO },
      { key: 'foto-gebaeude', text: 'mind. 5 Gebäuden im Bild', answer: PHOTO },
      { key: 'foto-zug', text: 'einem Zug', answer: PHOTO },
    ],
  },
  {
    key: 'kunterbunt',
    name: 'Kunterbunt',
    emoji: '🎨',
    coins: 10,
    answerMinutes: 5,
    intro: '',
    questions: [
      { key: 'kb-vogel', text: 'Videocall bis ihr einen Vogel zeigen könnt', answer: { type: 'text', placeholder: 'z.B. Videocall erledigt' } },
      {
        key: 'kb-sprachnachricht',
        text: 'Sendet eine Sprachnachricht von 30 Sekunden von der Zugstation (Wenn man anfängt, darf man die Sprachnachricht nicht beenden und muss diese an die Seekers senden)',
        answer: { type: 'text', placeholder: 'z.B. Sprachnachricht gesendet' },
      },
      { key: 'kb-gleise', text: 'Schreibt alle Gleisnummern an eurem nächsten Bahnhof an die Seeker', answer: { type: 'text', placeholder: 'Gleisnummern' } },
      {
        key: 'kb-reim',
        text: 'Schreibt den Seekern 5 Wörter. Eins davon muss sich mit dem Namen eurer Gemeinde reimen.',
        answer: { type: 'text', placeholder: '5 Wörter' },
      },
      {
        key: 'kb-restaurant',
        text: 'Geht in ein Restaurant und wählt etwas zu Essen aus (nicht essen). Schreibt den Preis dessen zusammen mit dem Essen (und vielleicht ein Foto davon ;) ) an die Seeker.',
        answer: { type: 'text', placeholder: 'Essen + Preis' },
      },
    ],
  },
  {
    key: 'praezision',
    name: 'Präzision',
    emoji: '🎯',
    coins: 10,
    answerMinutes: 5,
    intro: '',
    questions: [
      { key: 'pr-hotel', text: 'Was ist der gerundete Preis (auf 10er) des nächsten Hotels für ein Einbettzimmer für eine Nacht', answer: { type: 'text', placeholder: 'CHF' } },
      { key: 'pr-bahnhof', text: 'Wie lange dauert der Spaziergang von eurem Standort zum Bahnhof?', answer: { type: 'text', placeholder: 'Minuten' }, hint: 'station' },
      { key: 'pr-kreuzung', text: 'Wie viele Meter ist die nächste Kreuzung entfernt?', answer: { type: 'text', placeholder: 'Meter' } },
      { key: 'pr-asphalt', text: 'Wie viele Meter ist die nächste asphaltierte Strasse entfernt?', answer: { type: 'text', placeholder: 'Meter' } },
      { key: 'pr-kreisel', text: 'Wie viele Meter ist der nächste Kreisel entfernt?', answer: { type: 'text', placeholder: 'Meter' } },
      { key: 'pr-buchstabe', text: 'Was ist der erste Buchstabe der euch am nächsten gelegenen Strasse?', answer: { type: 'text', placeholder: 'Buchstabe' } },
      { key: 'pr-richtung', text: 'In welche Himmelsrichtung verläuft eure nächstgelegene Strasse?', answer: { type: 'text', placeholder: 'z.B. Nord–Süd' } },
      { key: 'pr-selfie', text: 'Schickt ein Selfie von euch', answer: PHOTO },
      { key: 'pr-oben', text: 'Schickt ein Foto, das gerade nach oben zeigt.', answer: PHOTO },
      { key: 'pr-strasse', text: 'Seid ihr auf der gleichen Strasse wie wir?', answer: YES_NO },
      {
        key: 'pr-sterne',
        text: 'Wie viele Sterne (Rezension, gerundet auf ganze Zahlen) hat das nächste Restaurant auf Google Maps?',
        answer: { type: 'choice', options: ['1', '2', '3', '4', '5'] },
      },
    ],
  },
];

export const CUSTOM_QUESTION_KEY = 'custom';

export function category(key: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

export function questionDef(catKey: string, key: string): QuestionDef | undefined {
  return category(catKey)?.questions.find((q) => q.key === key);
}

export function radarLabel(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

// ---------- Curses ----------

export interface CurseDef {
  number: number;
  title: string;
  text: string;
  /** Timer, die die Seeker bei Bedarf starten können (Minuten). */
  timers?: number[];
  /** Läuft ab dem Moment, in dem die Curse geworfen wird. */
  autoTimerMinutes?: number;
  /** Hiding-Zeit wird für diese Dauer gestoppt. */
  pausesHidingMinutes?: number;
  songs?: string[];
  links?: { label: string; url: string }[];
}

export const CURSES: CurseDef[] = [
  {
    number: 1,
    title: 'Free Kambly',
    text: 'Bevor ihr euch bewegt: Twintet den Hiders 3.55 CHF für ein Kambly Guetzli (vegane Alternativen sind okay).',
  },
  {
    number: 2,
    title: 'Abfall',
    text: 'Bevor ihr euch bewegt: Jede*r Seeker muss ein Stückchen Abfall aufsammeln und wegwerfen.',
  },
  {
    number: 3,
    title: 'Fitness-Check',
    text: 'Bevor ihr euch bewegt: Die Seekers müssen anhalten und 20 Liegestütze pro Seeker machen, die sie nach Belieben aufteilen können (Beispiel: zwei Seekers können sich die Arbeit 10-10 oder 5-15 teilen).',
  },
  {
    number: 4,
    title: 'Unterhaltet einen Hund',
    text: 'Bevor ihr euch bewegt: Unterhaltet einen Hund: Bevor ihr die nächste Frage stellt, findet einen Hund. Erzählt ihm einen lustigen Witz.',
  },
  {
    number: 5,
    title: 'Toot-Toot',
    text: 'Bevor ihr eure nächste Frage stellt, bringt ein motorisiertes Fahrzeug zum Hupen.',
  },
  {
    number: 6,
    title: 'Wilhelm-Tell-Curse',
    text: 'Bevor ihr etwas anderes tut, muss eine Person aus 5 Metern Entfernung einen Apfel vom Kopf eines Teammitglieds schiessen. Nach jedem verfehlten Schuss müsst ihr 10 Minuten warten, um nochmals zu probieren.',
    timers: [10],
  },
  {
    number: 7,
    title: 'Heidi-Curse',
    text: 'Bevor ihr eine nächste Frage stellen könnt, muss ein*e Seeker mindestens eine halbe Minute lang lustvoll auf einer Wiese umherhüpfen.',
    timers: [0.5],
  },
  {
    number: 8,
    title: 'Rivalen-Curse',
    text: 'Bevor ihr etwas anderes tut, begebt euch in einen Park/Dorfplatz o.Ä. und sprecht für alle Öffentlichkeit zu hören 3 Sachen über eine*n rivalisierenden Klub/Uni/Schule aus, die diese*n negativ machen.',
  },
  {
    number: 9,
    title: 'Tanz wie es keiner sieht',
    text: 'Begebe dich 300 Meter vom nächsten Gebäude weg und tanzt alle zusammen einen TikTok-Dance nach Belieben der Hiders fehlerfrei nach. Die Hiders bewerten, ob der Dance fehlerfrei war.',
  },
  {
    number: 10,
    title: 'Smalltalk',
    text: 'Bevor ihr etwas anderes tun könnt, ruft eine Lehrperson an und redet mit ihr mindestens 3 Minuten. Ihr dürft ihr in keinster Weise mitteilen, dass sie 3 Minuten dran bleiben soll und auch nicht, weshalb ihr sie anruft. Falls die LP vor den 3 Minuten auflegt, müsst ihr 10 Minuten warten und dann eine andere LP anrufen. Falls sie nicht abnimmt, ruft eine andere LP an.',
    timers: [3, 10],
  },
  {
    number: 11,
    title: 'Postkarten-Curse',
    text: 'Bevor ihr eine nächste Frage stellen könnt: Schreibe entweder physisch oder elektronisch eine Postkarte an einen Lehrer deiner Wahl. Physisch muss die Postkarte etwas mit dem Ort zu tun haben und eine ganze Seite vollgeschrieben sein; elektronisch muss ein Selfie mit eurem Ort gemacht werden und mind. 100 Wörter geschrieben werden. Die Curse ist gelöscht, sobald die Postkarte abgegeben ist.',
  },
  {
    number: 12,
    title: 'AI got nothing on me',
    text: 'Bevor ihr etwas anderes tut, erfinden 2 eurer Gruppe einen Witz über den Kanton, in dem ihr euch befindet. Gebt ChatGPT denselben Auftrag. Wenn die 2 anderen aus der Gruppe euren Witz von der KI unterscheiden können, fahrt fort. Wenn nicht, setzt 15 Minuten aus und wiederholt den Prozess mit neuen Witzen. Ihr dürft, ausser beim Vortragen der Witze, nicht miteinander sprechen.',
    timers: [15],
  },
  {
    number: 13,
    title: 'Showmaster',
    text: 'Bevor ihr etwas anderes tut, würfelt von 1-6. Lernt bis und mit dem ersten Refrain des Liedes auswendig und sendet eure Karaoke-Performance an die Hiders. Es müssen immer 2 Personen gleichzeitig "singen". Die Verse können aufgeteilt werden.',
    songs: [
      "We didn't start the fire – Billy Joel",
      'Piano Man – Billy Joel',
      'Hotel California – The Eagles',
      'Under the Bridge – RHCP',
      'Öberall heds Pilzli draa – Peach Weber',
      'I be en aargauer – Peach Weber',
    ],
  },
  {
    number: 14,
    title: 'Ratatouille Curse',
    text: 'Schaut auf dem Smithsonian Naked-Rat-Livestream vorbei. Fahrt mindestens eine Haltestelle in die Richtung (rechts = Osten usw.), in welche die erste Ratte (die sichtbar ist) rennt. Ihr müsst warten, bis ihr eine Ratte seht. Falls die Ratte für gemessen 15 Minuten nicht zu sehen ist, dürft ihr weiterfahren. (Falls mit Zug nicht möglich, dürfen auch Busse oder Trams benutzt werden.)',
    timers: [15],
    links: [{ label: 'Naked-Mole-Rat-Cam', url: 'https://nationalzoo.si.edu/webcams/naked-mole-rat-cam' }],
  },
  {
    number: 15,
    title: 'Burnout',
    text: 'Nehmt euch sofort eine Auszeit. Macht einen mindestens 30 Minuten langen Spaziergang. Euer Startpunkt ist auch das Ende des Spaziergangs.',
    autoTimerMinutes: 30,
  },
  {
    number: 16,
    title: 'Analog',
    text: 'Für die nächsten 30 Minuten dürft ihr keine mobilen Hilfsmittel verwenden (SBB App, Google Maps, Google Earth, Apple Maps, Waze und Suchmaschinen o.ä.).',
    autoTimerMinutes: 30,
  },
  {
    number: 17,
    title: 'Linguistik-Kurs',
    text: 'Bevor ihr etwas anderes tut: Findet 3 Wörter in eurer Gemeinde, die nicht der Amtssprache der Gemeinde entsprechen. Ausgenommen sind Namen von Geschäften (Restaurants einbezogen), Lebensmittelnamen und Verkehrsschilder.',
  },
  {
    number: 18,
    title: 'Stay hydrated',
    text: 'Bevor ihr etwas anderes tut, müsst ihr 4.5/6 Liter Wasser trinken. Jede*r soll mind. 1.5 Liter trinken. Fahrt fort, wenn die letzte Person ausgetrunken hat.',
  },
  {
    number: 19,
    title: 'Wählt euer Abenteuer',
    text: 'Bevor ihr etwas anderes tut, entweder:\n• Macht 100 Burpees: Diese dürfen aufgeteilt werden, jedoch darf nur eine Person zur selben Zeit Burpees machen. Burpee = Pushup + in die Luft springen.\noder\n• Ratet die Einwohnerzahl eurer Gemeinde: Ihr habt einen Guess. Ihr müsst innerhalb von 20% der richtigen Antwort liegen. Falls ihr falsch liegt, müsst ihr für 35 Minuten aussetzen. Die Zahl, welche auf Wikipedia liegt, ist korrekt. Ihr dürft keine externen Hilfsmittel verwenden (keine Personen, kein Internet, keine Gemeindetafeln).',
    timers: [35],
  },
  {
    number: 20,
    title: "Ich glaub' es spukt",
    text: 'Ihr müsst 30 Minuten lang an Ort und Stelle bleiben, während die Hiders sich neu positionieren können. Wenn ihr sie während dieser 30 Minuten seht, gilt es NICHT als Catch. Die Hiders dürfen jegliche Form von Transportation verwenden. Die Hiding-Zeit wird gestoppt.',
    autoTimerMinutes: 30,
    pausesHidingMinutes: 30,
  },
];

export const MAX_CURSE = CURSES.length;

export function curseDef(n: number): CurseDef | undefined {
  return CURSES.find((c) => c.number === n);
}

export const TEAM_COLORS = [
  { name: 'Rot', color: '#e5484d' },
  { name: 'Blau', color: '#3e63dd' },
  { name: 'Grün', color: '#30a46c' },
  { name: 'Orange', color: '#f76b15' },
  { name: 'Violett', color: '#8e4ec6' },
  { name: 'Gelb', color: '#d6a100' },
];
