// Widget contents: valid for the core, the budget of a card, the empty states.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { normalizeConfig } from '../src/config.js';
import { parseClassification } from '../src/results.js';
import { parseCalendar } from '../src/sessions.js';
import {
  buildLastResultsWidget,
  buildNextSessionWidget,
  buildScheduleWidget,
  buildStandingsWidget,
  tableRows,
} from '../src/widgets.js';
import { fixture, TZ } from './helpers.js';

const sessions = parseCalendar(fixture('calendar-2026'), 2026);
const standings = parseClassification(fixture('standings-2026-motogp').classification);
const config = normalizeConfig({ categories: ['motogp', 'moto2'], favorite_riders: 'Aldeguer' });
const now = Date.parse('2026-11-20T08:00:00Z');
const base = { sessions, now, timeZone: TZ, config, ready: true, fetchedAt: now };

const valid = (content) => assert.deepEqual(validateWidgetContent(content), []);

test('next session: countdown, day, the rest of the weekend, a link', () => {
  const content = buildNextSessionWidget(base);
  valid(content);
  const [heading, , countdown, , weekend] = content.components;
  assert.equal(heading.text, 'Portugal · 21/22');
  assert.equal(countdown.label.fr, 'MotoGP Qualifications 1');
  assert.ok(weekend.items.length <= 6);
  assert.equal(weekend.items[0].value.en, 'MotoGP · Qualifying 1');
});

test('schedule: one card per session, the badge colored by kind', () => {
  const content = buildScheduleWidget({ ...base, settings: { count: '8' } });
  valid(content);
  const items = content.components[1].items;
  assert.equal(items.length, 8);
  assert.equal(items[0].title.fr, 'MotoGP · Qualifications 1 – Portugal');
  assert.match(items[0].subtitle.fr, /^sam 21 nov · \d\d:\d\d · Autódromo/);
  assert.ok(
    items.some((item) => item.badge.color === 'danger'),
    'a race',
  );
});

test('empty states: reading, nothing planned, no standings, no results for the Baggers', () => {
  valid(buildScheduleWidget({ ...base, sessions: [], ready: false, fetchedAt: 0 }));
  assert.match(
    buildNextSessionWidget({ ...base, sessions: [] }).components[1].text.en,
    /No session planned/,
  );
  const none = buildStandingsWidget({ standings: null, year: 2026, timeZone: TZ, config });
  valid(none);
  const baggers = buildLastResultsWidget({
    sessions,
    result: () => null,
    timeZone: TZ,
    config: normalizeConfig({ categories: ['baggers'] }),
  });
  valid(baggers);
  assert.match(baggers.components[0].text.en, /no results for Baggers/);
});

test('standings: leader, gap, the top and the favorite added below it', () => {
  const content = buildStandingsWidget({
    standings: { fetchedAt: now, rows: standings },
    year: 2026,
    timeZone: TZ,
    config,
    settings: { category: 'motogp' },
  });
  valid(content);
  assert.equal(content.components[1].value, 'Marquez');
  assert.equal(content.components[2].value, 60);
  assert.equal(content.components[2].label.fr, 'devant Martin');
  const rows = content.components[3].items;
  assert.equal(rows.length, 6, 'top 5 + the favorite');
  assert.match(rows[5].label, /Fermin Aldeguer/);
  assert.equal(rows[5].color, 'success');
  assert.equal(tableRows(standings, 10, config.favorites).length, 10);
});

test('last results: the gaps, the riders not classified', () => {
  const race = sessions.find(
    (s) => s.eventCode === 'QAT' && s.category === 'motogp' && s.kind === 'race',
  );
  const rows = parseClassification(fixture('classification-qat-motogp-rac').classification);
  const content = buildLastResultsWidget({
    sessions,
    result: (id) => (id === race.id ? { fetchedAt: now, rows } : null),
    timeZone: TZ,
    config: normalizeConfig({ favorite_riders: 'Binder' }),
    settings: { count: '10' },
  });
  valid(content);
  const items = content.components[2].items;
  assert.equal(items.length, 10, 'the favorite is beyond the cap of 10 rows');
  const top = buildLastResultsWidget({
    sessions,
    result: (id) => (id === race.id ? { fetchedAt: now, rows } : null),
    timeZone: TZ,
    config: normalizeConfig({ favorite_riders: 'Binder' }),
  });
  const last = top.components[2].items.at(-1);
  assert.match(last.label, /^– Brad Binder #33$/);
  assert.equal(last.value.fr, 'Non classé');
});
