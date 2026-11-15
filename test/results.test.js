// Classifications and favorite riders.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  favoriteResult,
  favoriteRow,
  gapText,
  isComplete,
  parseClassification,
  parseFavorites,
} from '../src/results.js';
import { fixture } from './helpers.js';

const race = parseClassification(fixture('classification-qat-motogp-rac').classification);
const standings = parseClassification(fixture('standings-2026-motogp').classification);

test('a race: classified riders first, then the ones not classified', () => {
  assert.equal(race[0].name, 'Marco Bezzecchi');
  assert.equal(race[0].number, 72);
  assert.equal(race[0].team, 'Aprilia Racing');
  assert.equal(race[0].constructor, 'Aprilia');
  assert.equal(race[0].points, 25);
  const retired = race.filter((row) => row.position === null);
  assert.ok(retired.length >= 2);
  assert.ok(race.slice(-retired.length).every((row) => row.position === null));
  assert.ok(isComplete(race));
  assert.equal(isComplete([]), false);
});

test('gaps: race time of the winner, seconds, laps behind, nothing when not classified', () => {
  const labels = { lap: 'tour', laps: 'tours' };
  assert.equal(gapText(race[0], labels), '41:29.173');
  assert.equal(gapText(race[1], labels), '+3.083');
  assert.equal(gapText({ ...race[5], lapsBehind: 1 }, labels), '+1 tour');
  assert.equal(gapText({ ...race[5], lapsBehind: 2 }, labels), '+2 tours');
  assert.equal(gapText(race.at(-1), labels), '');
  const q2 = parseClassification(fixture('classification-qat-motogp-q2').classification);
  assert.equal(gapText(q2[0]), '1:50.028', 'the pole: the best lap');
});

test('standings: points, wins and podiums', () => {
  assert.equal(standings[0].name, 'Marc Marquez');
  assert.equal(standings[0].points, 431);
  assert.equal(standings[0].wins, 7);
  assert.equal(standings[0].podiums, 8);
});

test('favorite riders: numbers and parts of names, accents and case ignored', () => {
  assert.deepEqual(parseFavorites('93, bezzecchi; #72\n Viñales, x, '), {
    numbers: [93, 72],
    names: ['bezzecchi', 'vinales'],
  });
  assert.deepEqual(parseFavorites(''), { numbers: [], names: [] });
  assert.equal(favoriteRow(race, parseFavorites('vinales')).name, 'Maverick Viñales');
  assert.equal(
    favoriteRow(race, parseFavorites('Vinales, 93')).name,
    'Marc Marquez',
    'the best placed',
  );
  assert.equal(favoriteRow(race, parseFavorites('Rossi')), null);
});

test('the result of a favorite, as a key', () => {
  assert.equal(favoriteResult(null), 'absent');
  assert.equal(favoriteResult(race[0]), 'win');
  assert.equal(favoriteResult(race[2]), 'podium');
  assert.equal(favoriteResult(race[9]), 'top_ten');
  assert.equal(favoriteResult(race[10]), 'finished');
  assert.equal(favoriteResult(race.at(-1)), 'retired');
});

test('a row without a rider is dropped', () => {
  assert.deepEqual(parseClassification([{ position: 1 }, null]), []);
  assert.deepEqual(parseClassification('nope'), []);
});
