// -----------------------------------------------------------------------------
// The calendar of motogp.com (`/motogp/v1/events?seasonYear=`) -> sessions.
//
// An event is a Grand Prix (`kind: "GP"`), a test (`TEST`) or a media day
// (`MEDIA`, ignored). Its `broadcasts` are the sessions: practice, qualifying,
// sprint, race, warm up, plus press conferences and shows (`type: "MEDIA"`,
// ignored). A session is kept with what the calendars, scenes and widgets
// need, in UTC instants.
//
// Session kinds (our keys, forever): race, sprint, qualifying, practice,
// warmup, test. A race has no end in the calendar (start = end): its end is
// estimated (45 minutes, 25 for the sprint).
// -----------------------------------------------------------------------------

import { categoryOfAcronym, hasResults } from './categories.js';
import { MINUTE_MS, localClock, parseInstant } from './time.js';

const SESSION_KINDS = ['race', 'sprint', 'qualifying', 'practice', 'warmup', 'test'];
const DEFAULT_SESSION_KINDS = ['race', 'sprint', 'qualifying'];
const RESULT_KINDS = ['race', 'sprint', 'qualifying'];

const ESTIMATED_MINUTES = { race: 45, sprint: 25, default: 30 };

// Words kept in capitals when a name of motogp.com is put in title case.
const ACRONYMS = new Set(['USA', 'II', 'III', 'GP', 'MOTO2', 'MOTO3', 'MOTOGP']);
const SMALL_WORDS = new Set(['of', 'the', 'and']);

/**
 * @description "SEPANG TEST " -> "Sepang Test", "GRAND PRIX OF THE NETHERLANDS" ->
 * "Grand Prix of the Netherlands", "USA" stays "USA".
 * @param {unknown} value - A name of motogp.com, often in capitals.
 * @returns {string} The name in title case.
 */
function titleCase(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
      }
      if (ACRONYMS.has(upper)) {
        return upper.replace('MOTOGP', 'MotoGP').replace(/^MOTO(\d)$/, 'Moto$1');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * @description The kind of a broadcast, null when it is not a session we keep.
 * @param {object} event - The event of motogp.com.
 * @param {object} broadcast - One of its broadcasts.
 * @returns {string|null} A session kind.
 */
function sessionKind(event, broadcast) {
  if (broadcast?.type !== 'SESSION') {
    return null;
  }
  if (event.kind === 'TEST') {
    return 'test';
  }
  switch (broadcast.kind) {
    case 'RACE':
      return broadcast.shortname === 'SPR' ? 'sprint' : 'race';
    case 'QUALIFYING':
      return 'qualifying';
    case 'PRACTICE':
      return 'practice';
    case 'WARM_UP':
      return 'warmup';
    default:
      return null;
  }
}

/**
 * @description The number of a session: FP2 -> 2, Q1 -> 1, "Race Nr. 2" -> 2.
 * The Grand Prix of MotoGP is sometimes coded RAC2 although it is the only
 * race: only "Nr. <n>" in the name counts for a race.
 * @param {string} kind - Session kind.
 * @param {object} broadcast - The broadcast.
 * @returns {number|null} The number, null when none.
 */
function sessionNumber(kind, broadcast) {
  const named = /Nr\.?\s*(\d+)/i.exec(broadcast.name ?? '');
  if (named) {
    return Number(named[1]);
  }
  if (kind === 'race' || kind === 'sprint' || kind === 'test') {
    return null;
  }
  const coded = /^(?:FP|Q)(\d+)$/.exec(broadcast.shortname ?? '');
  return coded ? Number(coded[1]) : null;
}

/**
 * @description The sessions of the calendar of one season.
 * @param {object[]} events - The answer of `/events?seasonYear=`.
 * @param {number} year - The season.
 * @returns {object[]} The sessions, sorted by start.
 */
function parseCalendar(events, year) {
  const sessions = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== 'GP' && event?.kind !== 'TEST') {
      continue;
    }
    const circuit = event.circuit ?? {};
    for (const broadcast of event.broadcasts ?? []) {
      const kind = sessionKind(event, broadcast);
      const category = categoryOfAcronym(broadcast.category?.acronym);
      const start = parseInstant(broadcast.date_start);
      if (!kind || !category || start === null || !broadcast.id) {
        continue;
      }
      const end = parseInstant(broadcast.date_end);
      const estimated = (ESTIMATED_MINUTES[kind] ?? ESTIMATED_MINUTES.default) * MINUTE_MS;
      sessions.push({
        id: String(broadcast.id),
        year,
        eventId: String(event.id),
        eventCode: String(event.shortname ?? ''),
        eventKind: event.kind,
        eventName: titleCase(event.name),
        place: titleCase(event.additional_name || event.name),
        round: event.kind === 'GP' && Number.isInteger(event.sequence) ? event.sequence : null,
        circuit: String(circuit.name ?? '').trim(),
        city: String(circuit.city ?? '').trim(),
        country: String(circuit.country ?? '').trim(),
        category,
        kind,
        code: String(broadcast.shortname ?? ''),
        number: sessionNumber(kind, broadcast),
        apiName: String(broadcast.name ?? '').trim(),
        start,
        end: end !== null && end > start ? end : start + estimated,
        status: String(broadcast.status ?? ''),
      });
    }
  }
  return sessions.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/**
 * @description Whether results exist for a session: races, sprints and the
 * second qualifying (the grid) of a class with results.
 * @param {object} session - A session.
 * @returns {boolean} Whether to read its classification.
 */
function hasClassification(session) {
  if (!hasResults(session.category)) {
    return false;
  }
  if (session.kind === 'race' || session.kind === 'sprint') {
    return session.eventKind === 'GP';
  }
  return session.kind === 'qualifying' && session.number === 2 && session.eventKind === 'GP';
}

/**
 * @description The session type and number of the results service.
 * @param {object} session - A session with a classification.
 * @returns {{ type: string, number: number|null }} RAC, SPR or Q 2.
 */
function resultsType(session) {
  if (session.kind === 'sprint') {
    return { type: 'SPR', number: null };
  }
  if (session.kind === 'qualifying') {
    return { type: 'Q', number: session.number };
  }
  return { type: 'RAC', number: null };
}

/**
 * @description The sessions not over yet (on now or to come), in order.
 * @param {object[]} sessions - Every session kept.
 * @param {object} options - `{ now, categories, kinds }`.
 * @returns {object[]} The sessions.
 */
function upcomingSessions(sessions, { now, categories, kinds }) {
  return sessions
    .filter(
      (session) =>
        session.end > now && categories.includes(session.category) && kinds.includes(session.kind),
    )
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/**
 * @description The local day of a session.
 * @param {object} session - A session.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} `YYYY-MM-DD`.
 */
function sessionDay(session, timeZone) {
  return localClock(session.start, timeZone).date;
}

/**
 * @description The link of an event on motogp.com.
 * @returns {string} The calendar page (event pages have no stable address).
 */
function calendarUrl() {
  return 'https://www.motogp.com/en/calendar';
}

export {
  SESSION_KINDS,
  DEFAULT_SESSION_KINDS,
  RESULT_KINDS,
  ESTIMATED_MINUTES,
  titleCase,
  sessionKind,
  sessionNumber,
  parseCalendar,
  hasClassification,
  resultsType,
  upcomingSessions,
  sessionDay,
  calendarUrl,
};
