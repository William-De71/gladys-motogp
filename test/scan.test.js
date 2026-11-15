// What is read on motogp.com, and when.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig } from '../src/config.js';
import { createScanner } from '../src/scan.js';
import { fakeClient, fakeClock, silentLogger, tempStore } from './helpers.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** A scanner on the fixtures, its first readings done. */
async function setup(start, config = { categories: ['motogp'] }) {
  const clock = fakeClock(start);
  const client = fakeClient();
  const { store, cleanup } = tempStore();
  const scanner = createScanner({
    client,
    store,
    config: () => normalizeConfig(config),
    now: clock.now,
    logger: silentLogger,
  });
  const runAll = async () => {
    const done = [];
    for (let job = scanner.nextJob(); job; job = scanner.nextJob()) {
      done.push(await scanner.run(job));
      assert.ok(done.length < 50, 'the scan ends');
    }
    return done;
  };
  await runAll();
  return { clock, client, store, scanner, runAll, cleanup };
}

const keys = (scanner) => scanner.dueJobs().map((job) => job.key);

test('the calendar: every 6 hours, every 30 minutes around a Grand Prix', async () => {
  const quiet = await setup('2026-11-15T10:00:00Z');
  try {
    quiet.clock.advance(5 * HOUR);
    assert.deepEqual(keys(quiet.scanner), []);
    quiet.clock.advance(HOUR);
    assert.deepEqual(keys(quiet.scanner), ['calendar|2026']);
  } finally {
    quiet.cleanup();
  }
  const weekend = await setup('2026-11-07T10:00:00Z');
  try {
    weekend.clock.advance(31 * MINUTE);
    assert.ok(keys(weekend.scanner).includes('calendar|2026'));
  } finally {
    weekend.cleanup();
  }
});

test('the next season only from September, once a day', async () => {
  const spring = await setup('2026-04-15T10:00:00Z');
  try {
    assert.ok(!spring.client.calls.includes('calendar 2027'));
  } finally {
    spring.cleanup();
  }
  const autumn = await setup('2026-09-15T10:00:00Z');
  try {
    assert.ok(autumn.client.calls.includes('calendar 2027'));
    autumn.clock.advance(7 * HOUR);
    assert.deepEqual(keys(autumn.scanner), ['calendar|2026']);
    autumn.clock.advance(17 * HOUR);
    assert.ok(keys(autumn.scanner).includes('calendar|2027'));
  } finally {
    autumn.cleanup();
  }
});

test('a result: 3 minutes after the end, every 5 minutes, every hour, then every 6 hours', async () => {
  const context = await setup('2026-11-08T12:00:00Z');
  const { client, clock, scanner, runAll } = context;
  try {
    const key = Object.keys(client.answers.sessions)[0];
    client.answers.sessions[key] = [];
    clock.set('2026-11-08T16:47:00Z');
    assert.ok(!keys(scanner).some((k) => k.startsWith('result|')), 'race end + 2 min');
    clock.set('2026-11-08T16:48:00Z');
    await runAll();
    clock.advance(4 * MINUTE);
    assert.ok(!keys(scanner).some((k) => k.startsWith('result|')));
    clock.advance(MINUTE);
    assert.equal(keys(scanner).filter((k) => k.startsWith('result|')).length, 1);
    clock.set('2026-11-08T20:00:00Z');
    await runAll();
    clock.advance(30 * MINUTE);
    assert.ok(!keys(scanner).some((k) => k.startsWith('result|')), 'hourly after 3 hours');
    clock.advance(31 * MINUTE);
    assert.equal(keys(scanner).filter((k) => k.startsWith('result|')).length, 1);
    clock.set('2026-11-10T17:00:00Z');
    await runAll();
    clock.advance(5 * HOUR);
    assert.ok(!keys(scanner).some((k) => k.startsWith('result|')), 'every 6 hours after 2 days');
    clock.advance(HOUR);
    assert.equal(keys(scanner).filter((k) => k.startsWith('result|')).length, 1);
  } finally {
    context.cleanup();
  }
});

test('a first install reads the last results of the month once, for the widgets', async () => {
  const context = await setup('2026-11-13T12:00:00Z');
  try {
    const read = context.client.calls.filter((call) => call.startsWith('classification'));
    assert.equal(read.length, 3, 'the Qatar Q2, sprint and race');
    context.clock.advance(HOUR);
    await context.runAll();
    assert.equal(
      context.client.calls.filter((call) => call.startsWith('classification')).length,
      3,
    );
  } finally {
    context.cleanup();
  }
});

test('the standings: twice a day, at once after a race; the season of the last race', async () => {
  const context = await setup('2026-11-08T12:00:00Z');
  const { clock, scanner, runAll } = context;
  try {
    assert.equal(scanner.standingsYear('motogp'), 2026);
    clock.set('2026-11-08T16:48:00Z');
    const done = await runAll();
    const order = done.map((job) => job.key.split('|')[0]);
    assert.deepEqual(order, ['calendar', 'result', 'standings'], 'the race, then the standings');
    clock.advance(11 * HOUR);
    assert.ok(!keys(scanner).includes('standings|motogp'));
    clock.advance(HOUR);
    assert.ok(keys(scanner).includes('standings|motogp'));
  } finally {
    context.cleanup();
  }
  const january = await setup('2027-01-10T12:00:00Z');
  try {
    assert.equal(january.scanner.standingsYear('motogp'), 2026, 'the 2027 season has no race yet');
  } finally {
    january.cleanup();
  }
});

test('no standings for a class without results', async () => {
  const context = await setup('2026-11-15T10:00:00Z', { categories: ['baggers'] });
  try {
    assert.ok(!context.client.calls.some((call) => call.startsWith('standings')));
    assert.ok(!context.client.calls.some((call) => call.startsWith('classification')));
  } finally {
    context.cleanup();
  }
});
