// Scene events: when they fire, and the limits of their data.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig } from '../src/config.js';
import { dueReminders, leaderEvent, resultsEvent, standingsOutputs } from '../src/events.js';
import { parseClassification } from '../src/results.js';
import { parseCalendar } from '../src/sessions.js';
import { fixture, TZ } from './helpers.js';

const sessions = parseCalendar(fixture('calendar-2026'), 2026);
const race = sessions.find(
  (s) => s.eventCode === 'QAT' && s.category === 'motogp' && s.kind === 'race',
);
const rows = parseClassification(fixture('classification-qat-motogp-rac').classification);
const standings = parseClassification(fixture('standings-2026-motogp').classification);
const config = normalizeConfig({ categories: ['motogp'], favorite_riders: 'Binder' });

/** Flat, scalar, at most 30 keys, texts of 1 000 characters at most. */
function assertSceneData(data) {
  assert.ok(Object.keys(data).length <= 30);
  for (const [key, value] of Object.entries(data)) {
    assert.ok(
      value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 1000),
      key,
    );
  }
}

test('results: only for a session known before it started, and a day at most after it', () => {
  const options = { session: race, rows, config, language: 'en', timeZone: TZ };
  const before = race.start - 3600 * 1000;
  const after = race.end + 10 * 60 * 1000;
  const event = resultsEvent({ ...options, firstSeen: before, now: after });
  assert.equal(event.trigger, 'results_published');
  assertSceneData(event.data);
  assert.equal(event.data.favorite_result, 'retired');
  assert.equal(event.data.favorite_position, -1);
  assert.match(event.data.text, /Brad Binder: not classified\.$/);
  assert.equal(resultsEvent({ ...options, firstSeen: race.start + 1, now: after }), null);
  assert.equal(resultsEvent({ ...options, firstSeen: null, now: after }), null);
  assert.equal(
    resultsEvent({ ...options, firstSeen: before, now: race.end + 25 * 3600 * 1000 }),
    null,
  );
  const other = normalizeConfig({ categories: ['moto2'] });
  assert.equal(resultsEvent({ ...options, config: other, firstSeen: before, now: after }), null);
});

test('reminders: only the followed classes and kinds, not for a cancelled session', () => {
  const now = race.start - 30 * 60 * 1000 + 1000;
  const due = (overrides = {}, list = sessions) =>
    dueReminders({
      sessions: list,
      now,
      config: normalizeConfig({ categories: ['motogp'], ...overrides }),
      wasFired: () => false,
      language: 'en',
      timeZone: TZ,
    });
  assert.deepEqual(
    due().map((reminder) => reminder.key),
    [`${race.id}|30`],
  );
  assertSceneData(due()[0].data);
  assert.deepEqual(due({ sessions: ['practice'] }), []);
  assert.deepEqual(due({}, [{ ...race, status: 'CANCELLED' }]), []);
});

test('leader: an event only when another rider leads', () => {
  const swapped = [
    { ...standings[1], position: 1 },
    { ...standings[0], position: 2 },
  ];
  assert.equal(
    leaderEvent({ category: 'motogp', year: 2026, rows: standings, previousLeader: null }),
    null,
    'first reading',
  );
  assert.equal(
    leaderEvent({
      category: 'motogp',
      year: 2026,
      rows: standings,
      previousLeader: standings[0].riderId,
    }),
    null,
  );
  const event = leaderEvent({
    category: 'motogp',
    year: 2026,
    rows: swapped,
    previousLeader: standings[0].riderId,
  });
  assert.equal(event.data.leader_name, 'Jorge Martin');
  assert.equal(event.data.previous_leader_name, 'Marc Marquez');
  assertSceneData(event.data);
});

test('standings outputs: a favorite outside the top three, with the gap', () => {
  const outputs = standingsOutputs({
    category: 'motogp',
    year: 2026,
    rows: standings,
    favorites: normalizeConfig({ favorite_riders: 'Acosta' }).favorites,
    language: 'es',
  });
  assert.equal(outputs.favorite_name, 'Pedro Acosta');
  assert.equal(outputs.favorite_position, 4);
  assert.equal(outputs.favorite_gap, 431 - 309);
  assert.match(outputs.text, /^Campeonato de MotoGP: 1\. Marc Marquez 431 pts, /);
  assert.match(outputs.text, /Pedro Acosta: P4, 309 pts, a 122\.$/);
});
