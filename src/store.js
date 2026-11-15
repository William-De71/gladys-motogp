// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/state.json (the only
// writable place of the container):
//   - `calendars`  per season: `{ fetchedAt, sessions }` (src/sessions.js);
//   - `firstSeen`  when each session was first read (`<id>` -> ms): the
//                  results of a session only fire a scene when the session
//                  was known before it started (never on a first install);
//   - `results`    per session id: `{ fetchedAt, rows }` (a final
//                  classification, src/results.js);
//   - `standings`  per `<year>|<category>`: `{ fetchedAt, rows }`;
//   - `leaders`    per `<year>|<category>`: the rider id of the leader, to
//                  tell a change;
//   - `ids`        per season: the uuids of the results service
//                  (`{ fetchedAt, season, categories, events }`);
//   - `fired`      the reminders already sent (`<session>|<lead>` -> until),
//                  so a restart never sends one twice.
// Writes are atomic (a temporary file, then a rename) and grouped: at most
// one every few seconds, and one at shutdown.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
const FLUSH_DELAY_MS = 5000;
const PARTS = ['calendars', 'firstSeen', 'results', 'standings', 'leaders', 'ids', 'fired'];

const EMPTY = () => Object.fromEntries(PARTS.map((part) => [part, {}]));

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger, flushDelay }`.
 * @returns {object} The store.
 */
function createStore({ path = DEFAULT_PATH, logger, flushDelay = FLUSH_DELAY_MS } = {}) {
  const data = EMPTY();
  let timer = null;

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const part of PARTS) {
      if (raw?.[part] && typeof raw[part] === 'object' && !Array.isArray(raw[part])) {
        data[part] = raw[part];
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`unable to read ${path}: ${error.message}`);
    }
  }

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(data));
      renameSync(`${path}.tmp`, path);
    } catch (error) {
      logger?.warn(`unable to write ${path}: ${error.message}`);
    }
  };

  const changed = () => {
    if (!timer) {
      timer = setTimeout(flush, flushDelay);
      timer.unref?.();
    }
  };

  const prune = (part, keep) => {
    for (const [key, value] of Object.entries(data[part])) {
      if (!keep(key, value)) {
        delete data[part][key];
        changed();
      }
    }
  };

  return {
    // --- Calendars -------------------------------------------------------------

    /** @returns {object[]} Every session of every season kept, by start. */
    sessions: () =>
      Object.values(data.calendars)
        .flatMap((season) => season.sessions ?? [])
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    /**
     * @param {string} id - Session id.
     * @returns {object|undefined} The session.
     */
    session(id) {
      for (const season of Object.values(data.calendars)) {
        const found = (season.sessions ?? []).find((session) => session.id === id);
        if (found) {
          return found;
        }
      }
      return undefined;
    },
    /**
     * @param {number} year - Season.
     * @returns {number} When its calendar was last read, 0 when never.
     */
    calendarReadAt: (year) => data.calendars[year]?.fetchedAt ?? 0,
    /**
     * @description Replace the calendar of a season.
     * @param {number} year - Season.
     * @param {object[]} sessions - Its sessions.
     * @param {number} at - When it was read.
     * @returns {{ added: object[], updated: { before: object, after: object }[], removed: object[] }} What changed.
     */
    replaceCalendar(year, sessions, at) {
      const before = new Map((data.calendars[year]?.sessions ?? []).map((s) => [s.id, s]));
      const result = { added: [], updated: [], removed: [] };
      for (const session of sessions) {
        const old = before.get(session.id);
        if (!old) {
          result.added.push(session);
        } else if (JSON.stringify(old) !== JSON.stringify(session)) {
          result.updated.push({ before: old, after: session });
        }
        before.delete(session.id);
        if (!(session.id in data.firstSeen)) {
          data.firstSeen[session.id] = at;
        }
      }
      result.removed = [...before.values()];
      data.calendars[year] = { fetchedAt: at, sessions };
      changed();
      return result;
    },
    /**
     * @param {string} id - Session id.
     * @returns {number|null} When it was first read, null when never.
     */
    firstSeen: (id) => data.firstSeen[id] ?? null,
    /** @param {Function} keep - `(year) => boolean`: drop the other seasons. */
    pruneSeasons(keep) {
      prune('calendars', (year) => keep(Number(year)));
      prune('ids', (year) => keep(Number(year)));
      prune('standings', (key) => keep(Number(key.split('|')[0])));
      prune('leaders', (key) => keep(Number(key.split('|')[0])));
      const known = new Set(
        Object.values(data.calendars).flatMap((s) => (s.sessions ?? []).map((x) => x.id)),
      );
      prune('firstSeen', (id) => known.has(id));
      prune('results', (id) => known.has(id));
    },

    // --- Results service ----------------------------------------------------------

    /**
     * @param {number} year - Season.
     * @returns {object|null} `{ fetchedAt, season, categories, events }`.
     */
    ids: (year) => data.ids[year] ?? null,
    /**
     * @param {number} year - Season.
     * @param {object} ids - `{ fetchedAt, season, categories, events }`.
     */
    setIds(year, ids) {
      data.ids[year] = ids;
      changed();
    },
    /**
     * @param {string} id - Session id.
     * @returns {object|null} `{ fetchedAt, rows }`.
     */
    result: (id) => data.results[id] ?? null,
    /**
     * @param {string} id - Session id.
     * @param {object[]} rows - Its final classification.
     * @param {number} at - When it was read.
     */
    setResult(id, rows, at) {
      data.results[id] = { fetchedAt: at, rows };
      changed();
    },
    /**
     * @param {number} year - Season.
     * @param {string} category - Category key.
     * @returns {object|null} `{ fetchedAt, rows }`.
     */
    standings: (year, category) => data.standings[`${year}|${category}`] ?? null,
    /**
     * @param {number} year - Season.
     * @param {string} category - Category key.
     * @param {object[]} rows - The championship classification.
     * @param {number} at - When it was read.
     */
    setStandings(year, category, rows, at) {
      data.standings[`${year}|${category}`] = { fetchedAt: at, rows };
      changed();
    },
    /**
     * @param {number} year - Season.
     * @param {string} category - Category key.
     * @returns {string|null} The rider id of the last leader seen.
     */
    leader: (year, category) => data.leaders[`${year}|${category}`] ?? null,
    /**
     * @param {number} year - Season.
     * @param {string} category - Category key.
     * @param {string} riderId - The leader now.
     */
    setLeader(year, category, riderId) {
      data.leaders[`${year}|${category}`] = riderId;
      changed();
    },
    /** @returns {number} When motogp.com was last read successfully, 0 when never. */
    lastRead: () =>
      Math.max(
        0,
        ...Object.values(data.calendars).map((s) => s.fetchedAt ?? 0),
        ...Object.values(data.standings).map((s) => s.fetchedAt ?? 0),
        ...Object.values(data.results).map((s) => s.fetchedAt ?? 0),
      ),

    // --- Reminders -----------------------------------------------------------------

    /**
     * @param {string} key - `<session>|<lead>`.
     * @returns {boolean} Whether this reminder was sent.
     */
    wasFired: (key) => key in data.fired,
    /**
     * @param {string} key - `<session>|<lead>`.
     * @param {number} until - When the entry can be forgotten.
     */
    markFired(key, until) {
      data.fired[key] = until;
      changed();
    },
    /** @param {number} now - Forget the reminders of sessions long over. */
    pruneFired(now) {
      prune('fired', (key, until) => until >= now);
    },
    flush,
  };
}

export { DEFAULT_PATH, createStore };
