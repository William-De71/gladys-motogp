// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: calendar names, event titles, widget contents, connection status,
// scene action outputs. Vocabulary of the race broadcasts: "Essais libres",
// "Qualifications", "Course" in French; "Freies Training", "Qualifying",
// "Rennen" in German; "Libres", "Clasificación", "Carrera" in Spanish. Names
// of riders, teams, circuits and Grands Prix stay as motogp.com writes them.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const KIND_NAMES = {
  race: { en: 'Race', fr: 'Course', de: 'Rennen', es: 'Carrera' },
  sprint: { en: 'Sprint', fr: 'Sprint', de: 'Sprint', es: 'Sprint' },
  qualifying: { en: 'Qualifying', fr: 'Qualifications', de: 'Qualifying', es: 'Clasificación' },
  practice: { en: 'Practice', fr: 'Essais', de: 'Training', es: 'Práctica' },
  warmup: { en: 'Warm up', fr: 'Warm-up', de: 'Warm-up', es: 'Warm up' },
  test: { en: 'Test', fr: 'Test', de: 'Test', es: 'Test' },
};

const TEXTS = {
  // Session labels
  freePractice: {
    en: 'Free practice {n}',
    fr: 'Essais libres {n}',
    de: 'Freies Training {n}',
    es: 'Libres {n}',
  },
  numbered: { en: '{kind} {n}', fr: '{kind} {n}', de: '{kind} {n}', es: '{kind} {n}' },
  testDay: {
    en: 'Day {day}, session {n}',
    fr: 'Jour {day}, séance {n}',
    de: 'Tag {day}, Session {n}',
    es: 'Día {day}, sesión {n}',
  },

  // Calendars
  calendarDescription: {
    en: 'Sessions of the {category} class, from motogp.com (unofficial integration).',
    fr: 'Les séances de la catégorie {category}, d’après motogp.com (intégration non officielle).',
    de: 'Sessions der Klasse {category}, laut motogp.com (inoffizielle Integration).',
    es: 'Las sesiones de la categoría {category}, según motogp.com (integración no oficial).',
  },
  eventTitle: {
    en: '{category} · {session} – {place}',
    fr: '{category} · {session} – {place}',
    de: '{category} · {session} – {place}',
    es: '{category} · {session} – {place}',
  },
  round: { en: 'Round {round}', fr: 'Manche {round}', de: 'Lauf {round}', es: 'Ronda {round}' },
  source: {
    en: 'Source: motogp.com',
    fr: 'Source : motogp.com',
    de: 'Quelle: motogp.com',
    es: 'Fuente: motogp.com',
  },

  // Widgets
  sourceCaption: {
    en: 'motogp.com · read at {time}',
    fr: 'motogp.com · lu à {time}',
    de: 'motogp.com · gelesen um {time}',
    es: 'motogp.com · leído a las {time}',
  },
  sourceCaptionNever: {
    en: 'motogp.com · not read yet',
    fr: 'motogp.com · pas encore lu',
    de: 'motogp.com · noch nicht gelesen',
    es: 'motogp.com · aún no leído',
  },
  noSession: {
    en: 'No session planned in the calendar.',
    fr: 'Aucune séance prévue au calendrier.',
    de: 'Keine Session im Kalender geplant.',
    es: 'Ninguna sesión prevista en el calendario.',
  },
  readingCalendar: {
    en: 'Reading the calendar on motogp.com…',
    fr: 'Lecture du calendrier sur motogp.com…',
    de: 'Kalender wird von motogp.com gelesen …',
    es: 'Leyendo el calendario en motogp.com…',
  },
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  onNow: { en: 'On now', fr: 'En cours', de: 'Läuft', es: 'En directo' },
  inDaysHours: {
    en: '{days} d {hours} h',
    fr: '{days} j {hours} h',
    de: '{days} T {hours} h',
    es: '{days} d {hours} h',
  },
  inHoursMinutes: {
    en: '{hours} h {minutes} min',
    fr: '{hours} h {minutes} min',
    de: '{hours} h {minutes} min',
    es: '{hours} h {minutes} min',
  },
  inMinutes: { en: '{minutes} min', fr: '{minutes} min', de: '{minutes} min', es: '{minutes} min' },
  tileStarts: { en: 'Start', fr: 'Début', de: 'Beginn', es: 'Inicio' },
  tileAt: { en: 'at {time}', fr: 'à {time}', de: 'um {time}', es: 'a las {time}' },
  tileRound: { en: 'Round', fr: 'Manche', de: 'Lauf', es: 'Ronda' },
  tileTest: { en: 'Test', fr: 'Test', de: 'Test', es: 'Test' },
  buttonCalendar: { en: 'Calendar', fr: 'Calendrier', de: 'Kalender', es: 'Calendario' },
  linkCalendar: {
    en: 'Calendar on motogp.com',
    fr: 'Calendrier motogp.com',
    de: 'Kalender auf motogp.com',
    es: 'Calendario en motogp.com',
  },
  buttonResults: { en: 'Results', fr: 'Résultats', de: 'Ergebnisse', es: 'Resultados' },
  aheadOf: {
    en: 'ahead of {name}',
    fr: 'devant {name}',
    de: 'vor {name}',
    es: 'sobre {name}',
  },
  pointsUnit: { en: 'pts', fr: 'pts', de: 'Pkt.', es: 'pts' },
  standingsCaption: {
    en: '{category} {year} · motogp.com, read at {time}',
    fr: '{category} {year} · motogp.com, lu à {time}',
    de: '{category} {year} · motogp.com, gelesen um {time}',
    es: '{category} {year} · motogp.com, leído a las {time}',
  },
  noStandings: {
    en: 'No standings yet for {category}.',
    fr: 'Pas encore de classement pour {category}.',
    de: 'Noch keine Wertung für {category}.',
    es: 'Aún no hay clasificación de {category}.',
  },
  noResults: {
    en: 'No {session} results yet for {category}.',
    fr: 'Pas encore de résultats ({session}) pour {category}.',
    de: 'Noch keine Ergebnisse ({session}) für {category}.',
    es: 'Aún no hay resultados ({session}) de {category}.',
  },
  noResultsCategory: {
    en: 'motogp.com publishes no results for {category}.',
    fr: 'motogp.com ne publie pas de résultats pour {category}.',
    de: 'motogp.com veröffentlicht keine Ergebnisse für {category}.',
    es: 'motogp.com no publica resultados de {category}.',
  },
  points: { en: '{points} pts', fr: '{points} pts', de: '{points} Pkt.', es: '{points} pts' },
  winsPodiums: {
    en: '{wins} wins · {podiums} podiums',
    fr: '{wins} victoires · {podiums} podiums',
    de: '{wins} Siege · {podiums} Podien',
    es: '{wins} victorias · {podiums} podios',
  },
  behindLeader: {
    en: '{gap} pts behind the leader',
    fr: 'à {gap} pts du leader',
    de: '{gap} Pkt. hinter dem Führenden',
    es: 'a {gap} pts del líder',
  },
  favorite: { en: 'Favorite', fr: 'Favori', de: 'Favorit', es: 'Favorito' },
  retired: { en: 'Not classified', fr: 'Non classé', de: 'Nicht gewertet', es: 'No clasificado' },
  lap: { en: 'lap', fr: 'tour', de: 'Runde', es: 'vuelta' },
  laps: { en: 'laps', fr: 'tours', de: 'Runden', es: 'vueltas' },
  resultsHeading: {
    en: '{place} · {session}',
    fr: '{place} · {session}',
    de: '{place} · {session}',
    es: '{place} · {session}',
  },
  resultsCaption: {
    en: '{category} · {date} · motogp.com',
    fr: '{category} · {date} · motogp.com',
    de: '{category} · {date} · motogp.com',
    es: '{category} · {date} · motogp.com',
  },

  // Scene actions and variables
  nextSessionNone: {
    en: 'No session planned.',
    fr: 'Aucune séance prévue.',
    de: 'Keine Session geplant.',
    es: 'Ninguna sesión prevista.',
  },
  atTime: {
    en: '{date} at {time}',
    fr: '{date} à {time}',
    de: '{date} um {time}',
    es: '{date} a las {time}',
  },
  nextSessionText: {
    en: 'Next session: {title}, {when}, at {circuit}.',
    fr: 'Prochaine séance : {title}, {when}, sur le circuit {circuit}.',
    de: 'Nächste Session: {title}, {when}, auf {circuit}.',
    es: 'Próxima sesión: {title}, {when}, en {circuit}.',
  },
  podiumText: {
    en: '{category} {session} in {place}: {podium}.',
    fr: '{category}, {session} – {place} : {podium}.',
    de: '{category}, {session} in {place}: {podium}.',
    es: '{category}, {session} en {place}: {podium}.',
  },
  favoritePlace: {
    en: '{name}: P{position}.',
    fr: '{name} : P{position}.',
    de: '{name}: P{position}.',
    es: '{name}: P{position}.',
  },
  favoriteRetired: {
    en: '{name}: not classified.',
    fr: '{name} : non classé.',
    de: '{name}: nicht gewertet.',
    es: '{name}: no clasificado.',
  },
  standingsText: {
    en: '{category} championship: {top}.',
    fr: 'Championnat {category} : {top}.',
    de: '{category}-Wertung: {top}.',
    es: 'Campeonato de {category}: {top}.',
  },
  favoriteStanding: {
    en: '{name}: P{position}, {points} pts, {gap} behind.',
    fr: '{name} : P{position}, {points} pts, à {gap} pts.',
    de: '{name}: P{position}, {points} Pkt., {gap} zurück.',
    es: '{name}: P{position}, {points} pts, a {gap}.',
  },
  favoriteLeads: {
    en: '{name} leads with {points} pts.',
    fr: '{name} est en tête avec {points} pts.',
    de: '{name} führt mit {points} Pkt.',
    es: '{name} lidera con {points} pts.',
  },

  // Connection status (200 characters at most)
  statusOk: {
    en: '{count} sessions to come for {categories} class(es).',
    fr: '{count} séances à venir pour {categories} catégorie(s).',
    de: '{count} kommende Sessions für {categories} Klasse(n).',
    es: '{count} sesiones próximas para {categories} categoría(s).',
  },
  statusReading: {
    en: 'Reading the calendar on motogp.com…',
    fr: 'Lecture du calendrier sur motogp.com…',
    de: 'Kalender wird von motogp.com gelesen …',
    es: 'Leyendo el calendario en motogp.com…',
  },
  statusUnreachable: {
    en: 'motogp.com cannot be reached ({error}): next try in 15 minutes.',
    fr: 'motogp.com est injoignable ({error}) : nouvel essai dans 15 minutes.',
    de: 'motogp.com ist nicht erreichbar ({error}): neuer Versuch in 15 Minuten.',
    es: 'No se puede acceder a motogp.com ({error}): nuevo intento en 15 minutos.',
  },
};

const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * @description A text in one language, its `{placeholders}` replaced.
 * @param {string} key - A TEXTS key.
 * @param {string} language - en, fr, de or es (English otherwise).
 * @param {object} [values] - The values of the placeholders.
 * @returns {string} The text.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The name of a kind of session.
 * @param {string} kind - race, sprint, qualifying, practice, warmup or test.
 * @param {string} language - The language.
 * @returns {string} "Qualifications".
 */
function kindName(kind, language) {
  const entry = KIND_NAMES[kind];
  if (!entry) {
    return String(kind ?? '');
  }
  return entry[isLanguage(language) ? language : 'en'] ?? entry.en;
}

/**
 * @description The label of a session: "Essais libres 1", "Qualifications 2",
 * "Sprint", "Course", "Jour 1, séance 2" (a test).
 * @param {object} session - A session (src/sessions.js).
 * @param {string} language - The language.
 * @returns {string} The label.
 */
function sessionLabel(session, language) {
  if (session.kind === 'test') {
    const day = /Day\s*(\d+)\s*Session\s*(\d+)/i.exec(session.apiName);
    return day
      ? t('testDay', language, { day: day[1], n: day[2] })
      : session.apiName || kindName('test', language);
  }
  if (session.kind === 'practice' && /^FP\d+$/.test(session.code) && session.number !== null) {
    return t('freePractice', language, { n: session.number });
  }
  if (session.number !== null && (session.kind === 'qualifying' || session.kind === 'race')) {
    return t('numbered', language, { kind: kindName(session.kind, language), n: session.number });
  }
  return kindName(session.kind, language);
}

/**
 * @description Cut a text to a length, with an ellipsis.
 * @param {unknown} value - The text.
 * @param {number} max - The maximum length.
 * @returns {string} The text, at most `max` characters.
 */
function truncate(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export { LANGUAGES, KIND_NAMES, TEXTS, isLanguage, t, all, kindName, sessionLabel, truncate };
