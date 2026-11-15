// Shared test doubles: a fake motogp.com answering from the real answers of
// test/fixtures/ (2026-11-15, reduced to the fields read), a state file in a
// temporary folder and a clock the tests move by hand. Nothing here touches
// the network.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStore } from '../src/store.js';

export const TZ = 'Europe/Paris';

/**
 * @param {string} name - A file of test/fixtures, without `.json`.
 * @returns {any} Its content.
 */
export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

// Uuids of the results service, from the fixtures.
export const SEASON_2026 = 'e88b4e43-2209-47aa-8e83-0e0b1cedde6e';
export const MOTOGP_2026 = 'e8c110ad-64aa-4e8e-8a86-f2f152f6a942';
export const MOTO2_2026 = '549640b8-fd9c-4245-acfd-60e4bc38b25c';
export const QAT_RESULTS = fixture('results-events-2026').find((e) => e.short_name === 'QAT').id;
export const QAT_RACE = '67c2f209-bea0-47e9-9375-d7958fd4fe1d';
export const QAT_SPRINT = 'a0b6a09b-0a93-4181-8614-7bcc0c507381';
export const QAT_Q2 = 'f167c84a-83d8-4865-96f0-a5774f7352a4';

/** The answers of the fixtures, by request. */
export function defaultAnswers() {
  return {
    calendar: { 2026: fixture('calendar-2026'), 2027: [] },
    seasons: fixture('results-seasons'),
    categories: { [SEASON_2026]: fixture('results-categories-2026') },
    events: { [SEASON_2026]: fixture('results-events-2026') },
    sessions: { [`${QAT_RESULTS}|${MOTOGP_2026}`]: fixture('sessions-qat-motogp') },
    classification: {
      [QAT_RACE]: fixture('classification-qat-motogp-rac').classification,
      [QAT_SPRINT]: fixture('classification-qat-motogp-spr').classification,
      [QAT_Q2]: fixture('classification-qat-motogp-q2').classification,
    },
    standings: {
      [`${SEASON_2026}|${MOTOGP_2026}`]: fixture('standings-2026-motogp').classification,
      [`${SEASON_2026}|${MOTO2_2026}`]: fixture('standings-2026-moto2').classification,
    },
  };
}

/**
 * @description A fake client with the interface of src/motogp.js. A value
 * that is an Error is thrown; a missing value is a 404 (`not_found`).
 * @param {object} [answers] - Like `defaultAnswers()`, replaced in place by the tests.
 * @returns {object} The client, with `calls` and `answers`.
 */
export function fakeClient(answers = defaultAnswers()) {
  const calls = [];
  const answer = (table, key, call) => {
    calls.push(call);
    const value = table === undefined ? undefined : table[key];
    if (value instanceof Error) {
      return Promise.reject(value);
    }
    if (value === undefined) {
      const error = new Error(`${call}: not found`);
      error.kind = 'not_found';
      return Promise.reject(error);
    }
    return Promise.resolve(structuredClone(value));
  };
  return {
    calls,
    answers,
    calendar: (year) => answer(answers.calendar, year, `calendar ${year}`),
    resultsSeasons: () => answer({ all: answers.seasons }, 'all', 'seasons'),
    resultsCategories: (season) => answer(answers.categories, season, `categories ${season}`),
    resultsEvents: (season) => answer(answers.events, season, `events ${season}`),
    resultsSessions: (event, category) =>
      answer(answers.sessions, `${event}|${category}`, `sessions ${event} ${category}`),
    classification: (session) =>
      answer(answers.classification, session, `classification ${session}`),
    standings: (season, category) =>
      answer(answers.standings, `${season}|${category}`, `standings ${season} ${category}`),
  };
}

/**
 * @description A store in a fresh temporary folder.
 * @returns {{ store: object, path: string, cleanup: Function }} The store.
 */
export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'motogp-test-'));
  const path = join(dir, 'state.json');
  return {
    store: createStore({ path, flushDelay: 0 }),
    path,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * @description A clock moved by hand.
 * @param {string} iso - Start instant.
 * @returns {{ now: Function, set: Function, advance: Function }} The clock.
 */
export function fakeClock(iso) {
  let current = Date.parse(iso);
  return {
    now: () => current,
    set: (value) => {
      current = Date.parse(value);
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
