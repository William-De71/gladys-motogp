// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`, which checks the calendars,
// the scene events and the widgets like the host API), a fake motogp.com
// answering from test/fixtures/ and a clock moved by hand, in Europe/Paris.
//
// The Grand Prix of Qatar 2026 (Lusail, UTC+3) is the weekend of the tests:
// Q2 MotoGP on Saturday 7 November at 12:05 UTC, the sprint at 16:00 UTC, the
// race on Sunday 8 November at 16:00 UTC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import {
  MOTOGP_2026,
  SEASON_2026,
  fakeClient,
  fakeClock,
  silentLogger,
  tempStore,
  TZ,
} from './helpers.js';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const CONFIG = {
  categories: ['motogp', 'moto2'],
  favorite_riders: '93',
  language: 'fr',
};

// A user who enabled the integration in "My calendars".
const JOHN = { user: { selector: 'john', first_name: 'John', language: 'fr' }, config: {} };

const BEFORE_WEEKEND = '2026-11-06T08:00:00Z';

/**
 * @description An integration wired to the fake Gladys, its first readings done.
 * @param {object} [options] - `{ config, start, client }`.
 * @returns {Promise<object>} `{ gladys, fake, app, client, clock, store, cleanup }`.
 */
async function setup({ config = CONFIG, start = BEFORE_WEEKEND, client = fakeClient() } = {}) {
  const gladys = createFakeGladys({ config, calendarAccounts: [JOHN] });
  const clock = fakeClock(start);
  const { store, cleanup } = tempStore();
  const app = createApp(gladys, {
    client,
    store,
    now: clock.now,
    timeZone: TZ,
    sleep: async () => {},
    logger: silentLogger,
  });
  await gladys.connect();
  await app.tick();
  await app.scan();
  return { gladys, fake: gladys.fake, app, client, clock, store, cleanup };
}

/** Move the clock, then let the tick and the readings run. */
async function at(context, iso) {
  context.clock.set(iso);
  await context.app.tick();
  await context.app.scan();
}

const eventsOf = (fake, category) =>
  fake.calendarEvents.filter((event) =>
    event.calendar_external_id.endsWith(`:category-${category}`),
  );
const scene = (fake, key) => fake.sceneEvents.filter((event) => event.key === key);
const outputsOf = (answer) => answer.data?.outputs ?? answer.data ?? answer;
const contentOf = (answer) => answer.data?.content ?? answer.content ?? answer;

test('a calendar per followed class, the chosen sessions, in the language of the user', async () => {
  const { fake, client, cleanup } = await setup();
  try {
    assert.equal(fake.discoveredDevices.length, 0, 'a calendar integration has no devices');
    assert.deepEqual(client.calls, [
      'calendar 2026',
      'calendar 2027',
      'seasons',
      `categories ${SEASON_2026}`,
      `events ${SEASON_2026}`,
      `standings ${SEASON_2026} ${MOTOGP_2026}`,
      `standings ${SEASON_2026} 549640b8-fd9c-4245-acfd-60e4bc38b25c`,
    ]);
    assert.deepEqual(fake.calendars.map((c) => `${c.name} ${c.color}`).sort(), [
      'Moto2 #1f5fbf',
      'MotoGP #c8102e',
    ]);
    const motogp = eventsOf(fake, 'motogp').sort((a, b) => a.start.localeCompare(b.start));
    // Qatar, Portugal, Valencia: Q1, Q2, sprint, race (the window starts 14 days back).
    assert.equal(motogp.length, 12);
    assert.deepEqual(
      motogp.slice(0, 4).map((event) => `${event.start} ${event.name}`),
      [
        '2026-11-07T11:40:00.000Z MotoGP · Qualifications 1 – Qatar',
        '2026-11-07T12:05:00.000Z MotoGP · Qualifications 2 – Qatar',
        '2026-11-07T16:00:00.000Z MotoGP · Sprint – Qatar',
        '2026-11-08T16:00:00.000Z MotoGP · Course – Qatar',
      ],
    );
    const race = motogp[3];
    assert.equal(race.end, '2026-11-08T16:45:00.000Z', 'a race: 45 minutes, estimated');
    assert.equal(race.location, 'Lusail International Circuit, Doha, Qatar');
    assert.equal(
      race.description,
      'Qatar Airways Grand Prix of Qatar\nManche 20\nSource : motogp.com',
    );
    assert.equal(eventsOf(fake, 'moto2').length, 9, 'Moto2 has no sprint');
    assert.equal(fake.connectionStatus.connected, true);
    assert.match(fake.connectionStatus.message.fr, /^21 séances à venir pour 2 catégorie\(s\)\.$/);
  } finally {
    cleanup();
  }
});

test('reminders: 15 minutes before the race, then at the start, each once', async () => {
  const context = await setup();
  try {
    await at(context, '2026-11-08T15:45:10Z');
    await context.app.tick();
    const starting = () => scene(context.fake, 'session_starting');
    assert.deepEqual(
      starting().map((event) => `${event.data.title} ${event.data.lead}`),
      ['MotoGP · Course – Qatar 15'],
    );
    await at(context, '2026-11-08T16:00:05Z');
    assert.equal(starting().length, 2);
    const data = starting()[1].data;
    assert.equal(data.lead, '0');
    assert.equal(data.lead_minutes, 0);
    assert.equal(data.category, 'motogp');
    assert.equal(data.session, 'race');
    assert.equal(data.session_code, 'RAC');
    assert.equal(data.time, '17:00', 'in the timezone of Gladys');
    assert.equal(data.round, 20);
  } finally {
    context.cleanup();
  }
});

test('results: pole, sprint and race fire a scene with the podium and the favorite rider', async () => {
  const context = await setup();
  const { fake } = context;
  try {
    await at(context, '2026-11-07T12:24:00Z');
    await at(context, '2026-11-07T16:29:00Z');
    await at(context, '2026-11-08T16:49:00Z');
    const results = scene(fake, 'results_published');
    assert.deepEqual(
      results.map((event) => `${event.data.session} ${event.data.winner_name}`),
      ['qualifying Marco Bezzecchi', 'sprint Marc Marquez', 'race Marco Bezzecchi'],
    );
    const race = results[2].data;
    assert.equal(race.podium, '1. Marco Bezzecchi, 2. Marc Marquez, 3. Raul Fernandez');
    assert.equal(race.favorite_name, 'Marc Marquez');
    assert.equal(race.favorite_position, 2);
    assert.equal(race.favorite_points, 20);
    assert.equal(race.favorite_result, 'podium');
    assert.equal(
      race.text,
      'MotoGP, Course – Qatar : 1. Marco Bezzecchi, 2. Marc Marquez, 3. Raul Fernandez.',
    );
    const declared = MANIFEST.scene_triggers
      .find((trigger) => trigger.key === 'results_published')
      .variables.map((variable) => variable.key);
    assert.deepEqual(Object.keys(race).sort(), [...declared].sort());
    assert.equal(scene(fake, 'leader_changed').length, 0, 'Marquez still leads');
    // Read once: the classification is not asked for again.
    const calls = context.client.calls.length;
    await at(context, '2026-11-08T17:30:00Z');
    assert.ok(!context.client.calls.slice(calls).some((call) => call.startsWith('classification')));
  } finally {
    context.cleanup();
  }
});

test('a classification not out yet is asked for again 5 minutes later', async () => {
  const client = fakeClient();
  const key = Object.keys(client.answers.sessions)[0];
  const sessions = client.answers.sessions[key];
  client.answers.sessions[key] = sessions.map((raw) =>
    raw.type === 'RAC' ? { ...raw, status: 'NOT-STARTED' } : raw,
  );
  const context = await setup({ client });
  try {
    await at(context, '2026-11-08T16:49:00Z');
    assert.equal(scene(context.fake, 'results_published').length, 0);
    client.answers.sessions[key] = sessions;
    await at(context, '2026-11-08T16:51:00Z');
    assert.equal(scene(context.fake, 'results_published').length, 0, 'not before 5 minutes');
    await at(context, '2026-11-08T16:54:30Z');
    assert.equal(scene(context.fake, 'results_published').length, 1);
  } finally {
    context.cleanup();
  }
});

test('a new leader of the championship fires a scene, once', async () => {
  const client = fakeClient();
  const key = `${SEASON_2026}|${MOTOGP_2026}`;
  const real = client.answers.standings[key];
  // Before the sprint, Jorge Martin led.
  client.answers.standings[key] = [
    { ...real[1], position: 1 },
    { ...real[0], position: 2 },
    ...real.slice(2),
  ];
  const context = await setup({ client });
  try {
    client.answers.standings[key] = real;
    await at(context, '2026-11-07T16:29:00Z');
    const changed = scene(context.fake, 'leader_changed');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].data.leader_name, 'Marc Marquez');
    assert.equal(changed[0].data.previous_leader_name, 'Jorge Martin');
    assert.equal(changed[0].data.gap_to_second, 431 - 371);
    assert.equal(changed[0].data.category, 'motogp');
    await at(context, '2026-11-08T16:49:00Z');
    assert.equal(scene(context.fake, 'leader_changed').length, 1);
  } finally {
    context.cleanup();
  }
});

test('a first install after the race: the results are read for the widgets, no scene fires', async () => {
  const context = await setup({ start: '2026-11-08T19:00:00Z' });
  try {
    assert.equal(context.fake.sceneEvents.length, 0);
    const answer = await context.fake.widgetGet('last_results', {
      settings: { category: 'motogp', session: 'race' },
      language: 'en',
    });
    const content = contentOf(answer);
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].text.en, 'Qatar · Race');
    const rows = content.components[2].items;
    assert.equal(rows[0].label, '1. Marco Bezzecchi #72');
    assert.equal(rows[0].value.en, '41:29.173');
    assert.equal(rows[1].value.en, '+3.083');
    assert.equal(rows[1].color, 'success', 'the favorite rider');
  } finally {
    context.cleanup();
  }
});

test('scene actions: next session, standings, last results, only the declared outputs', async () => {
  const context = await setup({ start: '2026-11-08T19:00:00Z' });
  const { fake } = context;
  try {
    const declared = (key) =>
      MANIFEST.scene_actions.find((action) => action.key === key).outputs.map((o) => o.key);
    const next = outputsOf(await fake.sceneAction('get_next_session', {}));
    assert.deepEqual(Object.keys(next).sort(), [...declared('get_next_session')].sort());
    assert.equal(next.title, 'MotoGP · Qualifications 1 – Portugal');
    assert.match(next.text, /^Prochaine séance : MotoGP · Qualifications 1 – Portugal, /);
    const moto2Race = outputsOf(
      await fake.sceneAction('get_next_session', { category: ['moto2'], session: ['race'] }),
    );
    assert.equal(moto2Race.title, 'Moto2 · Course – Portugal');
    const standings = outputsOf(await fake.sceneAction('get_standings', { category: 'motogp' }));
    assert.deepEqual(Object.keys(standings).sort(), [...declared('get_standings')].sort());
    assert.equal(standings.leader_name, 'Marc Marquez');
    assert.equal(standings.leader_points, 431);
    assert.equal(standings.favorite_position, 1);
    assert.match(standings.text, /Marc Marquez est en tête avec 431 pts\.$/);
    const last = outputsOf(
      await fake.sceneAction('get_last_results', { category: 'motogp', session: 'sprint' }),
    );
    assert.deepEqual(Object.keys(last).sort(), [...declared('get_last_results')].sort());
    assert.equal(last.winner_name, 'Marc Marquez');
    assert.equal(last.favorite_result, 'win');
    const none = outputsOf(
      await fake.sceneAction('get_last_results', { category: 'moto2', session: 'race' }),
    );
    assert.equal(none.found, false);
  } finally {
    context.cleanup();
  }
});

test('widgets: valid content in every language and setting', async () => {
  const context = await setup({ start: '2026-11-08T19:00:00Z' });
  try {
    const settingsOf = {
      next_session: [{}, { categories: ['moto2'], sessions: ['race'] }],
      schedule: [{}, { count: '8' }],
      standings: [{}, { category: 'moto2', count: '10' }, { category: 'moto3' }],
      last_results: [{}, { session: 'qualifying' }, { category: 'moto2' }],
    };
    for (const key of MANIFEST.widgets.map((widget) => widget.key)) {
      for (const settings of settingsOf[key]) {
        for (const language of ['en', 'fr', 'de', 'es']) {
          const content = contentOf(await context.fake.widgetGet(key, { settings, language }));
          assert.deepEqual(validateWidgetContent(content), [], `${key} ${language}`);
        }
      }
    }
  } finally {
    context.cleanup();
  }
});

test('motogp.com unreachable on the first start: the status says so; it reads again 15 minutes later', async () => {
  const client = fakeClient();
  const calendar = client.answers.calendar[2026];
  const down = new Error('ECONNREFUSED');
  down.kind = 'network';
  client.answers.calendar[2026] = down;
  const context = await setup({ client });
  try {
    assert.equal(context.fake.connectionStatus.connected, false);
    assert.match(context.fake.connectionStatus.message.fr, /injoignable \(ECONNREFUSED\)/);
    client.answers.calendar[2026] = calendar;
    const calls = client.calls.length;
    await at(context, '2026-11-06T08:05:00Z');
    assert.ok(!client.calls.slice(calls).includes('calendar 2026'), 'not before 15 minutes');
    await at(context, '2026-11-06T08:16:00Z');
    assert.ok(client.calls.slice(calls).includes('calendar 2026'));
    assert.equal(context.fake.connectionStatus.connected, true);
    assert.equal(eventsOf(context.fake, 'motogp').length, 12);
  } finally {
    context.cleanup();
  }
});

test('a class dropped deletes its calendar; a restart reads nothing again nor fires twice', async () => {
  const first = await setup({ start: '2026-11-08T15:45:10Z' });
  try {
    assert.equal(scene(first.fake, 'session_starting').length, 1);
    await first.fake.configUpdated({ ...CONFIG, categories: ['motogp'] });
    await first.app.scan();
    assert.ok(first.fake.deletedCalendars.some((id) => String(id).endsWith(':category-moto2')));
    first.app.stop();
    const gladys = createFakeGladys({ config: CONFIG, calendarAccounts: [JOHN] });
    const client = fakeClient();
    const app = createApp(gladys, {
      client,
      store: first.store,
      now: first.clock.now,
      timeZone: TZ,
      sleep: async () => {},
      logger: silentLogger,
    });
    await gladys.connect();
    await app.tick();
    await app.scan();
    assert.deepEqual(
      client.calls.filter((call) => !call.startsWith('sessions ')),
      [],
      'everything is fresh (only the Moto2 qualifying, never published, is asked again)',
    );
    assert.equal(gladys.fake.sceneEvents.length, 0, 'the reminder was already sent');
    assert.equal(eventsOf(gladys.fake, 'motogp').length, 12, 'the calendars come from the state');
    app.stop();
  } finally {
    first.cleanup();
  }
});
