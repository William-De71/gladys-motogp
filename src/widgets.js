// -----------------------------------------------------------------------------
// Dashboard widgets (pure: also used by docs/illustrations/gen.mjs).
//
//   - `next_session`   the next session: countdown, day and time, then the
//                      sessions left in that Grand Prix weekend;
//   - `schedule`       the next sessions, as a list of cards (day, time,
//                      Grand Prix, a badge colored by kind);
//   - `standings`      the championship of a class: leader, gap, top 5 or 10,
//                      the favorite riders highlighted (and added below when
//                      outside the top);
//   - `last_results`   the last classification of a class (race, sprint or
//                      qualifying), the favorite riders highlighted.
// Settings: `categories` and `sessions` (empty: every followed one) for the
// first two, `category`, `session` and `count` for the others. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { sessionTitle } from './calendar.js';
import { CATEGORY_KEYS, categoryOf, hasResults } from './categories.js';
import { readKeys } from './config.js';
import { LANGUAGES, all, kindName, sessionLabel, t, truncate } from './i18n.js';
import { gapText, isFavorite } from './results.js';
import {
  RESULT_KINDS,
  SESSION_KINDS,
  calendarUrl,
  hasClassification,
  sessionDay,
  upcomingSessions,
} from './sessions.js';
import { MINUTE_MS, dayMonth, formatTime, shortDate } from './time.js';

const WIDGETS = {
  NEXT: 'next_session',
  SCHEDULE: 'schedule',
  STANDINGS: 'standings',
  RESULTS: 'last_results',
};
const SCHEDULE_COUNTS = [3, 5, 8];
const DEFAULT_SCHEDULE_COUNT = 5;
const TABLE_COUNTS = [5, 10];
const DEFAULT_TABLE_COUNT = 5;
const KIND_COLORS = {
  race: 'danger',
  sprint: 'warning',
  qualifying: 'primary',
  practice: 'info',
  warmup: 'neutral',
  test: 'neutral',
};
// How long Gladys caches a content: the countdown moves every minute, the
// lists with the readings.
const TTL_SECONDS = { next_session: 60, schedule: 300, standings: 900, last_results: 300 };
const WEEKEND_ROWS = 6;

/** @returns {object} A text in the four languages, built per language. */
const each = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

/**
 * @description The classes and kinds of sessions a widget instance shows.
 * @param {object} settings - The widget settings.
 * @param {object} config - Normalized config.
 * @returns {{ categories: string[], kinds: string[] }} Within what is followed.
 */
function widgetFilters(settings, config) {
  const categories = readKeys(settings?.categories, CATEGORY_KEYS, []).filter((key) =>
    config.categories.includes(key),
  );
  const kinds = readKeys(settings?.sessions, SESSION_KINDS, []).filter((kind) =>
    config.sessions.includes(kind),
  );
  return {
    categories: categories.length ? categories : config.categories,
    kinds: kinds.length ? kinds : config.sessions,
  };
}

/**
 * @description The class a single-class widget shows: its setting when
 * followed, else the first followed class with results.
 * @param {object} settings - The widget settings.
 * @param {object} config - Normalized config.
 * @returns {string} A category key.
 */
function widgetCategory(settings, config) {
  const [chosen] = readKeys(settings?.category, CATEGORY_KEYS, []);
  if (chosen && config.categories.includes(chosen)) {
    return chosen;
  }
  return config.categories.find((key) => hasResults(key)) ?? config.categories[0];
}

const tableCount = (settings) =>
  TABLE_COUNTS.includes(Number(settings?.count)) ? Number(settings.count) : DEFAULT_TABLE_COUNT;

/**
 * @description "Sat 28 Nov · 15:00".
 * @param {object} session - A session.
 * @param {string} language - The language.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The day and time.
 */
function when(session, language, timeZone) {
  return `${shortDate(sessionDay(session, timeZone), language)} · ${formatTime(session.start, timeZone)}`;
}

/**
 * @description "2 d 4 h", "35 min", "On now".
 * @param {object} session - A session.
 * @param {number} now - The instant, in ms.
 * @param {string} language - The language.
 * @returns {string} At most 12 characters.
 */
function countdown(session, now, language) {
  const minutes = Math.round((session.start - now) / MINUTE_MS);
  if (minutes <= 0) {
    return t('onNow', language);
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) {
    return t('inDaysHours', language, { days, hours });
  }
  if (hours > 0) {
    return t('inHoursMinutes', language, { hours, minutes: minutes % 60 });
  }
  return t('inMinutes', language, { minutes });
}

/** The caption under the title: the source and the last reading. */
const sourceCaption = (fetchedAt, timeZone) =>
  fetchedAt
    ? all('sourceCaption', { time: formatTime(fetchedAt, timeZone) })
    : all('sourceCaptionNever');

const bodyText = (key, values) => ({ type: 'text', variant: 'body', text: all(key, values) });

// --- next_session ------------------------------------------------------------------

/**
 * @description The `next_session` widget.
 * @param {object} data - `{ sessions, now, timeZone, config, ready, fetchedAt, settings }`.
 * @returns {object} The widget content.
 */
function buildNextSessionWidget({
  sessions,
  now,
  timeZone,
  config,
  ready,
  fetchedAt,
  settings = {},
}) {
  const filters = widgetFilters(settings, config);
  const upcoming = upcomingSessions(sessions, { now, ...filters });
  const caption = { type: 'text', variant: 'caption', text: sourceCaption(fetchedAt, timeZone) };
  const [session] = upcoming;
  if (!session) {
    return {
      ttl_seconds: TTL_SECONDS.next_session,
      components: [caption, bodyText(ready ? 'noSession' : 'readingCalendar')],
    };
  }
  const weekend = upcoming.filter((other) => other.eventId === session.eventId);
  const heading = session.round
    ? `${session.place} · ${session.round}/${roundsOf(sessions, session)}`
    : session.place;
  const components = [
    { type: 'text', variant: 'heading', text: truncate(heading, 40) },
    caption,
    {
      type: 'value',
      value: each((language) => truncate(countdown(session, now, language), 12)),
      // 24 characters: "MotoGP Qualifications 1", without the dot of the rows.
      label: each((language) =>
        truncate(sessionTitleShort(session, language).replace(' · ', ' '), 24),
      ),
      icon: 'clock',
      color: session.start <= now ? 'danger' : 'primary',
    },
    {
      type: 'value',
      value: each((language) => truncate(dayMonth(sessionDay(session, timeZone), language), 12)),
      label: all('tileAt', { time: formatTime(session.start, timeZone) }),
      icon: 'calendar',
    },
    {
      type: 'status',
      items: weekend.slice(0, WEEKEND_ROWS).map((other) => ({
        label: each((language) => truncate(when(other, language, timeZone), 40)),
        value: each((language) => truncate(sessionTitleShort(other, language), 40)),
        color: KIND_COLORS[other.kind],
      })),
    },
    {
      type: 'button',
      label: all('buttonCalendar'),
      icon: 'external-link',
      style: 'secondary',
      link: { url: calendarUrl() },
    },
  ];
  return { ttl_seconds: TTL_SECONDS.next_session, components };
}

/** "MotoGP · Sprint". */
function sessionTitleShort(session, language) {
  return `${categoryOf(session.category)?.name ?? session.category} · ${sessionLabel(session, language)}`;
}

/** The number of Grands Prix of the season of a session. */
function roundsOf(sessions, session) {
  return Math.max(
    session.round,
    ...sessions
      .filter((other) => other.year === session.year && other.round)
      .map((other) => other.round),
  );
}

// --- schedule ----------------------------------------------------------------------

/**
 * @description The `schedule` widget.
 * @param {object} data - `{ sessions, now, timeZone, config, ready, fetchedAt, settings }`.
 * @returns {object} The widget content.
 */
function buildScheduleWidget({ sessions, now, timeZone, config, ready, fetchedAt, settings = {} }) {
  const count = SCHEDULE_COUNTS.includes(Number(settings.count))
    ? Number(settings.count)
    : DEFAULT_SCHEDULE_COUNT;
  const list = upcomingSessions(sessions, { now, ...widgetFilters(settings, config) }).slice(
    0,
    count,
  );
  const caption = { type: 'text', variant: 'caption', text: sourceCaption(fetchedAt, timeZone) };
  if (list.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.schedule,
      components: [caption, bodyText(ready ? 'noSession' : 'readingCalendar')],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS.schedule,
    components: [
      caption,
      {
        type: 'card-list',
        display: 'list',
        items: list.map((session) => ({
          title: each((language) => truncate(sessionTitle(session, language), 60)),
          // A list shows the date OR the subtitle: the time goes in the subtitle.
          subtitle: each((language) =>
            truncate(
              [when(session, language, timeZone), session.circuit].filter(Boolean).join(' · '),
              60,
            ),
          ),
          badge: {
            text: each((language) => truncate(kindName(session.kind, language), 16)),
            color: KIND_COLORS[session.kind],
          },
          description: each((language) =>
            truncate(
              [
                session.eventName,
                session.round ? t('round', language, { round: session.round }) : '',
                [session.circuit, session.city, session.country].filter(Boolean).join(', '),
              ]
                .filter(Boolean)
                .join('\n'),
              2000,
            ),
          ),
          links: [{ url: calendarUrl(), label: all('linkCalendar') }],
        })),
      },
    ],
  };
}

// --- standings ---------------------------------------------------------------------

/**
 * @description One row of a table, the favorites in green.
 * @param {object} row - A classification row.
 * @param {object} favorites - Parsed favorites.
 * @param {Function} value - `(row) => value`.
 * @returns {object} A status row.
 */
function tableRow(row, favorites, value) {
  const position = row.position === null ? '–' : `${row.position}.`;
  const number = row.number === null ? '' : ` #${row.number}`;
  return {
    label: truncate(`${position} ${row.name}${number}`, 40),
    value,
    color: isFavorite(row, favorites) ? 'success' : row.position === 1 ? 'primary' : 'neutral',
  };
}

/**
 * @description The rows of a table: the top, then the favorites below it.
 * @param {object[]} rows - A classification.
 * @param {number} count - The size of the top.
 * @param {object} favorites - Parsed favorites.
 * @returns {object[]} The rows to show (10 at most).
 */
function tableRows(rows, count, favorites) {
  const top = rows.slice(0, count);
  const extra = rows.slice(count).filter((row) => isFavorite(row, favorites));
  return [...top, ...extra].slice(0, 10);
}

/**
 * @description The `standings` widget.
 * @param {object} data - `{ standings, year, now, timeZone, config, settings }`:
 * `standings` is `{ fetchedAt, rows }` or null.
 * @returns {object} The widget content.
 */
function buildStandingsWidget({ standings, year, timeZone, config, settings = {} }) {
  const category = widgetCategory(settings, config);
  const name = categoryOf(category)?.name ?? category;
  const rows = standings?.rows ?? [];
  const caption = {
    type: 'text',
    variant: 'caption',
    text: standings
      ? all('standingsCaption', {
          category: name,
          year,
          time: formatTime(standings.fetchedAt, timeZone),
        })
      : sourceCaption(0, timeZone),
  };
  if (!hasResults(category)) {
    return {
      ttl_seconds: TTL_SECONDS.standings,
      components: [caption, bodyText('noResultsCategory', { category: name })],
    };
  }
  if (rows.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.standings,
      components: [caption, bodyText('noStandings', { category: name })],
    };
  }
  const [leader, second] = rows;
  const components = [
    caption,
    {
      type: 'value',
      value: truncate(leader.name.split(' ').slice(-1)[0], 12),
      label: each((language) => truncate(t('points', language, { points: leader.points }), 24)),
      icon: 'award',
      color: 'primary',
    },
  ];
  if (second) {
    components.push({
      type: 'value',
      value: leader.points - second.points,
      unit: all('pointsUnit'),
      label: each((language) =>
        truncate(t('aheadOf', language, { name: second.name.split(' ').slice(-1)[0] }), 24),
      ),
      icon: 'trending-up',
    });
  }
  components.push({
    type: 'status',
    items: tableRows(rows, tableCount(settings), config.favorites).map((row) =>
      tableRow(
        row,
        config.favorites,
        each((language) => t('points', language, { points: row.points })),
      ),
    ),
  });
  return { ttl_seconds: TTL_SECONDS.standings, components };
}

// --- last_results ------------------------------------------------------------------

/**
 * @description The last session with a classification kept, of a class and kind.
 * @param {object[]} sessions - Every session.
 * @param {Function} result - `(id) => { fetchedAt, rows } | null`.
 * @param {string} category - Category key.
 * @param {string} kind - race, sprint or qualifying.
 * @returns {{ session: object, rows: object[] }|null} The session and its rows.
 */
function lastResult(sessions, result, category, kind) {
  const done = sessions
    .filter(
      (session) =>
        session.category === category &&
        session.kind === kind &&
        hasClassification(session) &&
        result(session.id),
    )
    .sort((a, b) => b.start - a.start);
  return done.length ? { session: done[0], rows: result(done[0].id).rows } : null;
}

/**
 * @description The `last_results` widget.
 * @param {object} data - `{ sessions, result, timeZone, config, settings }`.
 * @returns {object} The widget content.
 */
function buildLastResultsWidget({ sessions, result, timeZone, config, settings = {} }) {
  const category = widgetCategory(settings, config);
  const [kind] = readKeys(settings?.session, RESULT_KINDS, ['race']);
  const name = categoryOf(category)?.name ?? category;
  if (!hasResults(category)) {
    return {
      ttl_seconds: TTL_SECONDS.last_results,
      components: [bodyText('noResultsCategory', { category: name })],
    };
  }
  const last = lastResult(sessions, result, category, kind);
  if (!last) {
    return {
      ttl_seconds: TTL_SECONDS.last_results,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: each((language) =>
            t('noResults', language, {
              session: kindName(kind, language).toLowerCase(),
              category: name,
            }),
          ),
        },
      ],
    };
  }
  const { session, rows } = last;
  const labels = (language) => ({ lap: t('lap', language), laps: t('laps', language) });
  return {
    ttl_seconds: TTL_SECONDS.last_results,
    components: [
      {
        type: 'text',
        variant: 'heading',
        text: each((language) =>
          truncate(
            t('resultsHeading', language, {
              place: session.place,
              session: sessionLabel(session, language),
            }),
            40,
          ),
        ),
      },
      {
        type: 'text',
        variant: 'caption',
        text: each((language) =>
          t('resultsCaption', language, {
            category: name,
            date: shortDate(sessionDay(session, timeZone), language),
          }),
        ),
      },
      {
        type: 'status',
        items: tableRows(rows, tableCount(settings), config.favorites).map((row) =>
          tableRow(
            row,
            config.favorites,
            each((language) =>
              truncate(
                row.position === null ? t('retired', language) : gapText(row, labels(language)),
                40,
              ),
            ),
          ),
        ),
      },
      {
        type: 'button',
        label: all('buttonResults'),
        icon: 'external-link',
        style: 'secondary',
        link: { url: 'https://www.motogp.com/en/gp-results' },
      },
    ],
  };
}

export {
  WIDGETS,
  SCHEDULE_COUNTS,
  TABLE_COUNTS,
  KIND_COLORS,
  TTL_SECONDS,
  widgetFilters,
  widgetCategory,
  countdown,
  lastResult,
  tableRows,
  buildNextSessionWidget,
  buildScheduleWidget,
  buildStandingsWidget,
  buildLastResultsWidget,
};
