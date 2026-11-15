// The calendar of motogp.com read into sessions: kinds, numbers, places,
// estimated ends, which sessions have a classification.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionLabel } from '../src/i18n.js';
import {
  hasClassification,
  parseCalendar,
  resultsType,
  sessionNumber,
  titleCase,
  upcomingSessions,
} from '../src/sessions.js';
import { parseInstant } from '../src/time.js';
import { fixture } from './helpers.js';

const sessions = parseCalendar(fixture('calendar-2026'), 2026);
const find = (code, category, kind) =>
  sessions.find(
    (s) => s.eventCode === code && s.category === category && (!kind || s.kind === kind),
  );

test('keeps the Grands Prix and the tests, drops media days, press and shows', () => {
  assert.ok(sessions.length > 80);
  assert.deepEqual([...new Set(sessions.map((s) => s.eventCode))].sort(), [
    'MY2',
    'POR',
    'QAT',
    'USA',
    'VAL',
  ]);
  assert.ok(sessions.every((s) => s.eventKind === 'GP' || s.eventKind === 'TEST'));
  assert.ok(!sessions.some((s) => /Press|Talk|GearUp|After the Flag/i.test(s.apiName)));
  assert.deepEqual(
    sessions.map((s) => s.start),
    [...sessions.map((s) => s.start)].sort((a, b) => a - b),
    'sorted by start',
  );
});

test('kinds, numbers and labels of a Grand Prix weekend', () => {
  const qatar = sessions.filter((s) => s.eventCode === 'QAT' && s.category === 'motogp');
  assert.deepEqual(
    qatar.map((s) => `${s.kind}:${s.code}:${s.number ?? '-'}`),
    [
      'practice:FP1:1',
      'practice:PR:-',
      'practice:FP2:2',
      'qualifying:Q1:1',
      'qualifying:Q2:2',
      'sprint:SPR:-',
      'warmup:WUP:-',
      'race:RAC:-',
    ],
  );
  assert.deepEqual(
    qatar.map((s) => sessionLabel(s, 'fr')),
    [
      'Essais libres 1',
      'Essais',
      'Essais libres 2',
      'Qualifications 1',
      'Qualifications 2',
      'Sprint',
      'Warm-up',
      'Course',
    ],
  );
  const race = find('QAT', 'motogp', 'race');
  assert.equal(race.place, 'Qatar');
  assert.equal(race.round, 20);
  assert.equal(race.circuit, 'Lusail International Circuit');
  assert.equal(race.start, Date.parse('2026-11-08T16:00:00Z'));
  assert.equal(race.end - race.start, 45 * 60 * 1000, 'estimated: the calendar has no end');
  assert.equal(
    find('QAT', 'motogp', 'sprint').end - find('QAT', 'motogp', 'sprint').start,
    25 * 60 * 1000,
  );
  const q2 = find('QAT', 'motogp', 'qualifying');
  assert.equal(q2.end - q2.start, 15 * 60 * 1000, 'the end of the calendar when given');
});

test('the Baggers have two numbered races; a test session is labelled by day', () => {
  const baggers = sessions.filter((s) => s.eventCode === 'USA' && s.category === 'baggers');
  assert.deepEqual(
    baggers.map((s) => `${s.kind}:${s.number ?? '-'}`),
    ['practice:1', 'practice:2', 'qualifying:-', 'race:1', 'race:2'],
  );
  assert.equal(sessionLabel(baggers[3], 'en'), 'Race 1');
  const test0 = sessions.find((s) => s.eventCode === 'MY2');
  assert.equal(test0.kind, 'test');
  assert.equal(test0.place, 'Sepang Test');
  assert.equal(test0.round, null);
  assert.equal(sessionLabel(test0, 'de'), 'Tag 1, Session 1');
  assert.ok(sessions.filter((s) => s.kind === 'test').every((s) => !hasClassification(s)));
});

test('a classification for races, sprints and Q2 of the classes with results only', () => {
  const qatar = sessions.filter((s) => s.eventCode === 'QAT' && hasClassification(s));
  assert.deepEqual(
    qatar.map((s) => `${s.category}:${s.code}`).sort(),
    [
      'moto2:Q2',
      'moto2:RAC',
      'moto3:Q2',
      'moto3:RAC',
      'motogp:Q2',
      'motogp:RAC',
      'motogp:SPR',
    ].sort(),
  );
  assert.ok(!sessions.some((s) => s.category === 'baggers' && hasClassification(s)));
  assert.deepEqual(resultsType(find('QAT', 'motogp', 'race')), { type: 'RAC', number: null });
  assert.deepEqual(resultsType(find('QAT', 'motogp', 'sprint')), { type: 'SPR', number: null });
  const q2 = sessions.find((s) => s.eventCode === 'QAT' && s.code === 'Q2');
  assert.deepEqual(resultsType(q2), { type: 'Q', number: 2 });
});

test('a Grand Prix coded RAC2 is still the race, not a race number 2', () => {
  assert.equal(sessionNumber('race', { shortname: 'RAC2', name: 'Grand Prix' }), null);
  assert.equal(sessionNumber('race', { shortname: 'RAC2', name: 'Race Nr. 2' }), 2);
  assert.equal(sessionNumber('practice', { shortname: 'FP2', name: 'Free Practice Nr. 2' }), 2);
  assert.equal(sessionNumber('qualifying', { shortname: 'Q1', name: 'Qualifying Nr. 1 ' }), 1);
});

test('names in title case, acronyms and small words kept', () => {
  assert.equal(titleCase('SEPANG TEST '), 'Sepang Test');
  assert.equal(titleCase('USA'), 'USA');
  assert.equal(
    titleCase('TISSOT GRAND PRIX OF THE NETHERLANDS '),
    'Tissot Grand Prix of the Netherlands',
  );
  assert.equal(titleCase('PORTIMAO MOTO3 TEST'), 'Portimao Moto3 Test');
  assert.equal(titleCase(null), '');
});

test('upcoming sessions: not over yet, of the classes and kinds asked', () => {
  const now = Date.parse('2026-11-08T16:10:00Z');
  const list = upcomingSessions(sessions, { now, categories: ['motogp'], kinds: ['race'] });
  assert.equal(list[0].eventCode, 'QAT', 'a race on now is still listed');
  assert.deepEqual(
    list.map((s) => s.eventCode),
    ['QAT', 'POR', 'VAL'],
  );
});

test('instants with an offset without a colon', () => {
  assert.equal(parseInstant('2026-11-27T09:00:00+0100'), Date.parse('2026-11-27T08:00:00Z'));
  assert.equal(parseInstant('2026-03-27T08:25:00-0500'), Date.parse('2026-03-27T13:25:00Z'));
  assert.equal(parseInstant('2026-11-06T14:45:00+00:00'), Date.parse('2026-11-06T14:45:00Z'));
  assert.equal(parseInstant(''), null);
  assert.equal(parseInstant('soon'), null);
});

test('a malformed calendar gives no session rather than an error', () => {
  assert.deepEqual(parseCalendar(null, 2026), []);
  assert.deepEqual(parseCalendar([{ kind: 'GP', broadcasts: [{ type: 'SESSION' }] }], 2026), []);
});
