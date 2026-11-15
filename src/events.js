// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `session_starting`   a session of a followed class and kind starts in
//                          `lead` minutes (0, 15, 30, 60 or 120), once per
//                          session and lead, 10 minutes late at most (a
//                          restart in the meantime);
//   - `results_published`  the classification of a race, a sprint or the
//                          second qualifying came out, for a session known
//                          before it started (never on a first install);
//   - `leader_changed`     another rider leads the championship of a class
//                          (never on the first reading).
// Filters (equality / membership): `category`, `session`, `lead`,
// `favorite_result`. The data is flat and scalar: keys for the filters,
// names as motogp.com writes them, a `text` in the language of the
// configuration.
//
// No event ever follows a scene action (they only read).
// -----------------------------------------------------------------------------

import { sessionPlace, sessionTitle } from './calendar.js';
import { categoryOf } from './categories.js';
import { kindName, sessionLabel, t, truncate } from './i18n.js';
import { favoriteResult, favoriteRow } from './results.js';
import { sessionDay, upcomingSessions } from './sessions.js';
import { DAY_MS, MINUTE_MS, formatTime, longDate } from './time.js';

const TRIGGERS = {
  STARTING: 'session_starting',
  RESULTS: 'results_published',
  LEADER: 'leader_changed',
};

const LEADS = ['0', '15', '30', '60', '120'];
const LATE_MS = 10 * MINUTE_MS;
const RESULTS_FRESH_MS = DAY_MS;
const RESULT_SESSION_KEYS = [
  'title',
  'category',
  'category_name',
  'session',
  'session_name',
  'grand_prix',
  'round',
  'circuit',
  'date',
];

const NEXT_SESSION_OUTPUTS = [
  'found',
  'title',
  'category',
  'session',
  'grand_prix',
  'circuit',
  'country',
  'date',
  'time',
  'minutes_until',
  'text',
];

const STANDINGS_OUTPUTS = [
  'found',
  'year',
  'leader_name',
  'leader_points',
  'second_name',
  'second_gap',
  'third_name',
  'third_gap',
  'favorite_name',
  'favorite_position',
  'favorite_points',
  'favorite_gap',
  'text',
];

const LAST_RESULTS_OUTPUTS = [
  'found',
  'grand_prix',
  'date',
  'winner_name',
  'winner_team',
  'podium',
  'favorite_name',
  'favorite_position',
  'favorite_result',
  'text',
];

/**
 * @description The data of a session, as the scenes see it.
 * @param {object} session - A session.
 * @param {string} language - Language of the labels.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {object} Flat, scalar data.
 */
function sessionData(session, language, timeZone) {
  return {
    session_id: session.id,
    category: session.category,
    category_name: categoryOf(session.category)?.name ?? session.category,
    session: session.kind,
    session_code: session.code,
    session_name: truncate(sessionLabel(session, language), 100),
    title: truncate(sessionTitle(session, language), 200),
    grand_prix: truncate(session.place, 100),
    event_name: truncate(session.eventName, 200),
    round: session.round ?? 0,
    circuit: truncate(session.circuit, 200),
    country: truncate(session.country, 100),
    date: sessionDay(session, timeZone),
    time: formatTime(session.start, timeZone),
  };
}

const followed = (session, config) =>
  config.categories.includes(session.category) && config.sessions.includes(session.kind);

/**
 * @description The reminders due now.
 * @param {object} options - `{ sessions, now, config, wasFired, language, timeZone }`.
 * @returns {object[]} `{ key, until, trigger, data }`.
 */
function dueReminders({ sessions, now, config, wasFired, language, timeZone }) {
  const due = [];
  for (const session of sessions) {
    if (!followed(session, config) || /CANCEL/i.test(session.status)) {
      continue;
    }
    for (const lead of LEADS) {
      const at = session.start - Number(lead) * MINUTE_MS;
      const key = `${session.id}|${lead}`;
      if (now >= at && now < at + LATE_MS && !wasFired(key)) {
        due.push({
          key,
          until: session.end + DAY_MS,
          trigger: TRIGGERS.STARTING,
          data: { ...sessionData(session, language, timeZone), lead, lead_minutes: Number(lead) },
        });
      }
    }
  }
  return due;
}

/**
 * @description "1. Marco Bezzecchi, 2. Marc Marquez, 3. Raul Fernandez".
 * @param {object[]} rows - A classification.
 * @param {number} [count] - How many.
 * @returns {string} The podium.
 */
function podiumText(rows, count = 3) {
  return rows
    .filter((row) => row.position !== null)
    .slice(0, count)
    .map((row) => `${row.position}. ${row.name}`)
    .join(', ');
}

/**
 * @description The favorite rider of a classification, as scene data.
 * @param {object[]} rows - A classification.
 * @param {object} favorites - Parsed favorites of the configuration.
 * @returns {object} `{ row, name, number, position, points, result }`.
 */
function favoriteData(rows, favorites) {
  const row = favoriteRow(rows, favorites);
  return {
    row,
    name: row?.name ?? '',
    number: row?.number ?? 0,
    position: row?.position ?? -1,
    points: row?.points ?? 0,
    result: favoriteResult(row),
  };
}

/**
 * @description The text of a classification: podium, then the favorite.
 * @param {object} session - The session.
 * @param {object[]} rows - Its classification.
 * @param {object} favorite - From `favoriteData`.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function resultsText(session, rows, favorite, language) {
  const parts = [
    t('podiumText', language, {
      category: categoryOf(session.category)?.name ?? session.category,
      session: sessionLabel(session, language),
      place: session.place,
      podium: podiumText(rows),
    }),
  ];
  if (favorite.row && favorite.position > 3) {
    parts.push(t('favoritePlace', language, favorite));
  } else if (favorite.row && favorite.position === -1) {
    parts.push(t('favoriteRetired', language, favorite));
  }
  return truncate(parts.join(' '), 1000);
}

/**
 * @description The `results_published` event of a classification, or null
 * when the session was not known before it started or is long over.
 * @param {object} options - `{ session, rows, firstSeen, now, config, language, timeZone }`.
 * @returns {object|null} `{ trigger, data }`.
 */
function resultsEvent({ session, rows, firstSeen, now, config, language, timeZone }) {
  if (
    !config.categories.includes(session.category) ||
    firstSeen === null ||
    firstSeen >= session.start ||
    now - session.end > RESULTS_FRESH_MS
  ) {
    return null;
  }
  const [first, second, third] = rows.filter((row) => row.position !== null);
  const favorite = favoriteData(rows, config.favorites);
  // At most 20 variables per trigger: a subset of the session data.
  const base = sessionData(session, language, timeZone);
  return {
    trigger: TRIGGERS.RESULTS,
    data: {
      ...Object.fromEntries(RESULT_SESSION_KEYS.map((key) => [key, base[key]])),
      winner_name: truncate(first?.name, 100),
      winner_number: first?.number ?? 0,
      winner_team: truncate(first?.team, 100),
      second_name: truncate(second?.name, 100),
      third_name: truncate(third?.name, 100),
      podium: truncate(podiumText(rows), 500),
      favorite_name: truncate(favorite.name, 100),
      favorite_position: favorite.position,
      favorite_points: favorite.points,
      favorite_result: favorite.result,
      text: resultsText(session, rows, favorite, language),
    },
  };
}

/**
 * @description The `leader_changed` event after a reading of the standings,
 * or null when the leader is the same (or was unknown).
 * @param {object} options - `{ category, year, rows, previousLeader, standingsBefore }`.
 * @returns {object|null} `{ trigger, data }`.
 */
function leaderEvent({ category, year, rows, previousLeader, standingsBefore }) {
  const [leader, second] = rows;
  if (!leader || leader.position !== 1 || !previousLeader || previousLeader === leader.riderId) {
    return null;
  }
  const previous = (standingsBefore ?? []).find((row) => row.riderId === previousLeader);
  const previousNow = rows.find((row) => row.riderId === previousLeader);
  return {
    trigger: TRIGGERS.LEADER,
    data: {
      category,
      category_name: categoryOf(category)?.name ?? category,
      year,
      leader_name: truncate(leader.name, 100),
      leader_number: leader.number ?? 0,
      leader_team: truncate(leader.team, 100),
      leader_points: leader.points,
      gap_to_second: second ? leader.points - second.points : 0,
      previous_leader_name: truncate(previousNow?.name ?? previous?.name ?? '', 100),
      previous_leader_points: previousNow?.points ?? 0,
    },
  };
}

/**
 * @description The outputs of the `get_next_session` scene action.
 * @param {object} options - `{ sessions, now, categories, kinds, language, timeZone }`.
 * @returns {object} Exactly the declared outputs.
 */
function nextSessionOutputs({ sessions, now, categories, kinds, language, timeZone }) {
  const [session] = upcomingSessions(sessions, { now, categories, kinds });
  if (!session) {
    return {
      found: false,
      title: '',
      category: '',
      session: '',
      grand_prix: '',
      circuit: '',
      country: '',
      date: '',
      time: '',
      minutes_until: -1,
      text: t('nextSessionNone', language),
    };
  }
  const data = sessionData(session, language, timeZone);
  const when = t('atTime', language, { date: longDate(data.date, language), time: data.time });
  return {
    found: true,
    title: data.title,
    category: data.category_name,
    session: data.session_name,
    grand_prix: data.grand_prix,
    circuit: truncate(sessionPlace(session), 500),
    country: data.country,
    date: data.date,
    time: data.time,
    minutes_until: Math.max(0, Math.round((session.start - now) / MINUTE_MS)),
    text: truncate(
      t('nextSessionText', language, {
        title: data.title,
        when,
        circuit: session.circuit || session.place,
      }),
      1000,
    ),
  };
}

/**
 * @description The outputs of the `get_standings` scene action.
 * @param {object} options - `{ category, year, rows, favorites, language }`.
 * @returns {object} Exactly the declared outputs.
 */
function standingsOutputs({ category, year, rows, favorites, language }) {
  const name = categoryOf(category)?.name ?? category;
  if (!rows?.length) {
    return {
      found: false,
      year,
      leader_name: '',
      leader_points: 0,
      second_name: '',
      second_gap: 0,
      third_name: '',
      third_gap: 0,
      favorite_name: '',
      favorite_position: -1,
      favorite_points: 0,
      favorite_gap: 0,
      text: t('noStandings', language, { category: name }),
    };
  }
  const [leader, second, third] = rows;
  const favorite = favoriteData(rows, favorites);
  const gap = favorite.row ? leader.points - favorite.points : 0;
  const top = rows
    .slice(0, 3)
    .map((row) => `${row.position}. ${row.name} ${t('points', language, { points: row.points })}`)
    .join(', ');
  const parts = [t('standingsText', language, { category: name, top })];
  if (favorite.row && favorite.position === 1) {
    parts.push(t('favoriteLeads', language, favorite));
  } else if (favorite.row && favorite.position > 3) {
    parts.push(t('favoriteStanding', language, { ...favorite, gap }));
  }
  return {
    found: true,
    year,
    leader_name: leader.name,
    leader_points: leader.points,
    second_name: second?.name ?? '',
    second_gap: second ? leader.points - second.points : 0,
    third_name: third?.name ?? '',
    third_gap: third ? leader.points - third.points : 0,
    favorite_name: favorite.name,
    favorite_position: favorite.position,
    favorite_points: favorite.points,
    favorite_gap: gap,
    text: truncate(parts.join(' '), 1000),
  };
}

/**
 * @description The outputs of the `get_last_results` scene action.
 * @param {object} options - `{ session, rows, favorites, language, timeZone, category, kind }`.
 * @returns {object} Exactly the declared outputs.
 */
function lastResultsOutputs({ session, rows, favorites, language, timeZone, category, kind }) {
  if (!session || !rows?.length) {
    return {
      found: false,
      grand_prix: '',
      date: '',
      winner_name: '',
      winner_team: '',
      podium: '',
      favorite_name: '',
      favorite_position: -1,
      favorite_result: 'absent',
      text: t('noResults', language, {
        session: kindName(kind, language).toLowerCase(),
        category: categoryOf(category)?.name ?? category,
      }),
    };
  }
  const [first] = rows;
  const favorite = favoriteData(rows, favorites);
  return {
    found: true,
    grand_prix: session.place,
    date: sessionDay(session, timeZone),
    winner_name: first.name,
    winner_team: first.team,
    podium: truncate(podiumText(rows), 500),
    favorite_name: favorite.name,
    favorite_position: favorite.position,
    favorite_result: favorite.result,
    text: resultsText(session, rows, favorite, language),
  };
}

export {
  TRIGGERS,
  LEADS,
  LATE_MS,
  RESULTS_FRESH_MS,
  RESULT_SESSION_KEYS,
  NEXT_SESSION_OUTPUTS,
  STANDINGS_OUTPUTS,
  LAST_RESULTS_OUTPUTS,
  sessionData,
  dueReminders,
  podiumText,
  favoriteData,
  resultsEvent,
  leaderEvent,
  nextSessionOutputs,
  standingsOutputs,
  lastResultsOutputs,
};
