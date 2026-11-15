// -----------------------------------------------------------------------------
// What to read on motogp.com, and when.
//
// Jobs, by priority:
//   1. `calendar|<year>`   the calendar of the season: every 6 hours, every 30
//                          minutes during a race weekend (times move with the
//                          weather), and the next season once a day from
//                          September on, the previous one once a day until
//                          April (standings and results until the first race);
//   2. `result|<session>`  the classification of a race, a sprint or the
//                          second qualifying of a followed class: from 3
//                          minutes after its end, every 5 minutes for 3 hours,
//                          then every hour for 2 days. On a first install, the
//                          last of each kind of the past 30 days is read once
//                          (for the widgets: no scene fires for them);
//   3. `standings|<category>`  the championship: twice a day, and at once
//                          after a race or sprint result.
// The uuids of the results service (season, classes, events) are read when a
// job needs them, at most once a day (every 30 minutes while an event is
// missing). A failed job waits 15 minutes; one request at a time
// (src/motogp.js spaces them by one second).
// -----------------------------------------------------------------------------

import { RESULT_CATEGORY_KEYS, categoryOf } from './categories.js';
import { parseClassification, isComplete } from './results.js';
import { hasClassification, parseCalendar, resultsType } from './sessions.js';
import { DAY_MS, HOUR_MS, MINUTE_MS } from './time.js';

const CALENDAR_EVERY_MS = 6 * HOUR_MS;
const CALENDAR_WEEKEND_EVERY_MS = 30 * MINUTE_MS;
const NEXT_SEASON_EVERY_MS = DAY_MS;
const NEXT_SEASON_FROM_MONTH = 9;
const PREVIOUS_SEASON_UNTIL_MONTH = 4;
const RESULT_DELAY_MS = 3 * MINUTE_MS;
const RESULT_FAST_MS = 5 * MINUTE_MS;
const RESULT_FAST_FOR_MS = 3 * HOUR_MS;
const RESULT_SLOW_MS = HOUR_MS;
const RESULT_WATCH_MS = 2 * DAY_MS;
const BACKFILL_MS = 30 * DAY_MS;
const BACKFILL_EVERY_MS = 6 * HOUR_MS;
const STANDINGS_EVERY_MS = 12 * HOUR_MS;
const IDS_EVERY_MS = DAY_MS;
const IDS_MISSING_EVERY_MS = 30 * MINUTE_MS;
const RETRY_MS = 15 * MINUTE_MS;
const WEEKEND_MARGIN_MS = DAY_MS;

/**
 * @description Create the scanner.
 * @param {object} options - `{ client, store, config, now, logger }`.
 * @returns {object} The scanner.
 */
function createScanner({ client, store, config, now, logger }) {
  const tries = new Map();
  const staleStandings = new Set();
  // The last failure of each job still failing (a success clears its own).
  const errors = new Map();

  const yearOf = (instant) => new Date(instant).getUTCFullYear();

  const triedRecently = (key, every) => now() - (tries.get(key) ?? 0) < every;

  /** Whether a session of the season runs within a day. */
  const inWeekend = () => {
    const at = now();
    return store
      .sessions()
      .some(
        (session) =>
          session.eventKind === 'GP' &&
          session.start - WEEKEND_MARGIN_MS <= at &&
          session.end + 2 * HOUR_MS >= at,
      );
  };

  // --- Jobs ------------------------------------------------------------------------

  const calendarJobs = () => {
    const year = yearOf(now());
    const jobs = [];
    const every = inWeekend() ? CALENDAR_WEEKEND_EVERY_MS : CALENDAR_EVERY_MS;
    if (now() - store.calendarReadAt(year) >= every) {
      jobs.push({ key: `calendar|${year}`, type: 'calendar', year });
    }
    const month = new Date(now()).getUTCMonth() + 1;
    // Until the first race of a season, the standings and results shown are
    // the ones of the previous season: its calendar is needed.
    if (
      month <= PREVIOUS_SEASON_UNTIL_MONTH &&
      now() - store.calendarReadAt(year - 1) >= NEXT_SEASON_EVERY_MS
    ) {
      jobs.push({ key: `calendar|${year - 1}`, type: 'calendar', year: year - 1 });
    }
    if (
      month >= NEXT_SEASON_FROM_MONTH &&
      now() - store.calendarReadAt(year + 1) >= NEXT_SEASON_EVERY_MS
    ) {
      jobs.push({ key: `calendar|${year + 1}`, type: 'calendar', year: year + 1 });
    }
    return jobs;
  };

  /** The sessions with a classification of the followed classes, over. */
  const finished = () =>
    store
      .sessions()
      .filter(
        (session) =>
          hasClassification(session) &&
          config().categories.includes(session.category) &&
          session.end + RESULT_DELAY_MS <= now(),
      );

  const resultJobs = () => {
    const jobs = [];
    const over = finished().filter((session) => !store.result(session.id));
    // Watched: the sessions of the last two days.
    for (const session of over) {
      const since = now() - session.end;
      if (since > RESULT_WATCH_MS) {
        continue;
      }
      const every = since < RESULT_FAST_FOR_MS ? RESULT_FAST_MS : RESULT_SLOW_MS;
      const key = `result|${session.id}`;
      if (!triedRecently(key, every)) {
        jobs.push({ key, type: 'result', session, watched: true });
      }
    }
    // Backfill: the last session of each kind and class, for the widgets.
    const latest = new Map();
    for (const session of finished()) {
      latest.set(`${session.category}|${session.kind}`, session);
    }
    for (const session of latest.values()) {
      const key = `result|${session.id}`;
      if (
        !store.result(session.id) &&
        now() - session.end > RESULT_WATCH_MS &&
        now() - session.end <= BACKFILL_MS &&
        !triedRecently(key, BACKFILL_EVERY_MS)
      ) {
        jobs.push({ key, type: 'result', session, watched: false });
      }
    }
    return jobs.sort((a, b) => b.session.end - a.session.end);
  };

  /**
   * @param {string} category - Category key.
   * @returns {number} The season of the championship to show: the one of the
   * last session with a classification already run, else the current one.
   */
  const standingsYear = (category) => {
    const done = store
      .sessions()
      .filter(
        (session) =>
          session.category === category && hasClassification(session) && session.end <= now(),
      );
    return done.length ? done[done.length - 1].year : yearOf(now());
  };

  const standingsJobs = () =>
    config()
      .categories.filter((category) => RESULT_CATEGORY_KEYS.includes(category))
      .map((category) => {
        const year = standingsYear(category);
        const key = `standings|${category}`;
        const kept = store.standings(year, category);
        const due =
          (staleStandings.has(category) && !triedRecently(key, RESULT_FAST_MS)) ||
          (!kept && !triedRecently(key, RETRY_MS)) ||
          (kept && now() - kept.fetchedAt >= STANDINGS_EVERY_MS && !triedRecently(key, RETRY_MS));
        return due ? { key, type: 'standings', category, year } : null;
      })
      .filter(Boolean);

  /** @returns {object[]} Every job due now, by priority. */
  const dueJobs = () =>
    [...calendarJobs(), ...resultJobs(), ...standingsJobs()].filter(
      (job) => job.type !== 'calendar' || !triedRecently(job.key, RETRY_MS),
    );

  // --- Runs ------------------------------------------------------------------------

  /** The uuids of the results service for a season, read when needed. */
  const idsFor = async (year, eventCode) => {
    const kept = store.ids(year);
    const missing = eventCode && !kept?.events?.[eventCode];
    const age = now() - (kept?.fetchedAt ?? 0);
    if (kept?.season && age < IDS_EVERY_MS && !(missing && age >= IDS_MISSING_EVERY_MS)) {
      return kept;
    }
    const seasons = await client.resultsSeasons();
    const season = seasons.find((candidate) => Number(candidate?.year) === year);
    if (!season?.id) {
      store.setIds(year, { fetchedAt: now(), season: null, categories: {}, events: {} });
      return store.ids(year);
    }
    const categories = {};
    for (const raw of await client.resultsCategories(season.id)) {
      const key = RESULT_CATEGORY_KEYS.find(
        (candidate) => categoryOf(candidate).resultsLegacyId === Number(raw?.legacy_id),
      );
      if (key && raw.id) {
        categories[key] = String(raw.id);
      }
    }
    const events = {};
    for (const raw of await client.resultsEvents(season.id)) {
      if (raw?.id && raw.short_name && !raw.test) {
        events[String(raw.short_name).trim()] = String(raw.id);
      }
    }
    const ids = { fetchedAt: now(), season: String(season.id), categories, events };
    store.setIds(year, ids);
    return ids;
  };

  const runCalendar = async (job) => {
    const sessions = parseCalendar(await client.calendar(job.year), job.year);
    const changes = store.replaceCalendar(job.year, sessions, now());
    store.pruneSeasons((year) => year >= yearOf(now()) - 1);
    return { ...job, changes };
  };

  const runResult = async (job) => {
    const { session } = job;
    const ids = await idsFor(session.year, session.eventCode);
    const event = ids?.events?.[session.eventCode];
    const category = ids?.categories?.[session.category];
    if (!event || !category) {
      return { ...job, rows: null };
    }
    const { type, number } = resultsType(session);
    const candidates = (await client.resultsSessions(event, category)).filter(
      (raw) => raw?.type === type && (number === null || Number(raw.number) === number),
    );
    const official = candidates.find((raw) => raw.status === 'FINISHED') ?? null;
    if (!official?.id) {
      return { ...job, rows: null };
    }
    const rows = parseClassification(await client.classification(official.id));
    if (!isComplete(rows)) {
      return { ...job, rows: null };
    }
    store.setResult(session.id, rows, now());
    if (session.kind === 'race' || session.kind === 'sprint') {
      staleStandings.add(session.category);
    }
    return { ...job, rows };
  };

  const runStandings = async (job) => {
    const ids = await idsFor(job.year);
    const category = ids?.categories?.[job.category];
    if (!ids?.season || !category) {
      staleStandings.delete(job.category);
      return { ...job, rows: null };
    }
    const rows = parseClassification(await client.standings(ids.season, category));
    staleStandings.delete(job.category);
    if (rows.length === 0) {
      return { ...job, rows: null };
    }
    const previous = store.leader(job.year, job.category);
    store.setStandings(job.year, job.category, rows, now());
    const leader = rows[0].position === 1 ? rows[0] : null;
    if (leader) {
      store.setLeader(job.year, job.category, leader.riderId);
    }
    return { ...job, rows, previousLeader: previous };
  };

  /**
   * @description Run one job.
   * @param {object} job - From `dueJobs()`.
   * @returns {Promise<object|null>} What it brought, null when it failed.
   */
  const run = async (job) => {
    tries.set(job.key, now());
    try {
      let done;
      if (job.type === 'calendar') {
        done = await runCalendar(job);
      } else if (job.type === 'result') {
        done = await runResult(job);
      } else {
        done = await runStandings(job);
      }
      errors.delete(job.key);
      return done;
    } catch (error) {
      // Not found: nothing to read yet (a season or an event not published).
      if (error?.kind === 'not_found') {
        errors.delete(job.key);
        logger?.debug?.(`${job.key}: ${error.message}`);
        return { ...job, rows: null };
      }
      const failure = { message: error?.message ?? String(error), at: now() };
      errors.set(job.key, failure);
      logger?.warn(`${job.key} failed: ${failure.message}`);
      return null;
    }
  };

  return {
    dueJobs,
    nextJob: () => dueJobs()[0] ?? null,
    run,
    standingsYear,
    /** @returns {object} `{ lastError, ready }`. */
    status: () => ({
      // A failure older than 2 hours is forgotten (its job may no longer be due).
      lastError:
        [...errors.values()]
          .filter((failure) => now() - failure.at < 2 * HOUR_MS)
          .sort((a, b) => b.at - a.at)[0] ?? null,
      ready: store.calendarReadAt(yearOf(now())) > 0,
    }),
    /** Forget the attempts (configuration changed: read the new classes now). */
    reset() {
      tries.clear();
      errors.clear();
    },
  };
}

export {
  CALENDAR_EVERY_MS,
  CALENDAR_WEEKEND_EVERY_MS,
  RESULT_DELAY_MS,
  RESULT_FAST_MS,
  RESULT_WATCH_MS,
  STANDINGS_EVERY_MS,
  RETRY_MS,
  createScanner,
};
