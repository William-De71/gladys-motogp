// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import {
  LAST_RESULTS_OUTPUTS,
  LEADS,
  NEXT_SESSION_OUTPUTS,
  RESULT_SESSION_KEYS,
  STANDINGS_OUTPUTS,
  TRIGGERS,
} from '../src/events.js';
import { SCENE_ACTIONS } from '../src/app.js';
import { SCHEDULE_COUNTS, TABLE_COUNTS, WIDGETS } from '../src/widgets.js';
import { AUTO_LANGUAGE, INTERNAL_KEYS, normalizeConfig } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  DEFAULT_CATEGORIES,
  RESULT_CATEGORY_KEYS,
} from '../src/categories.js';
import { DEFAULT_SESSION_KINDS, RESULT_KINDS, SESSION_KINDS } from '../src/sessions.js';
import { FAVORITE_RESULTS } from '../src/results.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a calendar integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'calendar');
  assert.equal(manifest.name, 'MotoGP');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-motogp:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-motogp/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-motogp');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: the API behind motogp.com', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/motogp.js'), /'https:\/\/api\.motogp\.pulselive\.com\/motogp\/v1'/);
});

test('requires Gladys 5.3.0 (calendar integrations, catalog keywords); no permission, no device', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['leisure']);
  for (const key of [
    'location',
    'network_wake',
    'containers',
    'network_discovery',
    'webhooks',
    'account_schema',
  ]) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.doesNotMatch(source('../src/app.js'), /publishDiscoveredDevices|onSetValue|onPoll/);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.equal(manifest.actions, undefined, 'no configuration button');
});

test('the configuration of the code: classes, sessions, favorite riders, language', () => {
  const config = byKey(manifest.config_schema);
  const categories = config.get('categories');
  assert.equal(categories.type, 'multi_select');
  assert.deepEqual(values(categories), CATEGORY_KEYS);
  assert.deepEqual(categories.default, DEFAULT_CATEGORIES);
  const sessions = config.get('sessions');
  assert.equal(sessions.type, 'multi_select');
  assert.deepEqual(values(sessions), SESSION_KINDS);
  assert.deepEqual(sessions.default, DEFAULT_SESSION_KINDS);
  assert.equal(config.get('favorite_riders').type, 'string');
  assert.notEqual(config.get('favorite_riders').required, true);
  assert.equal(config.get(INTERNAL_KEYS.language), undefined, 'internal key, never shown');
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password', 'secret'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
    if (field.placeholder) {
      assert.deepEqual(Object.keys(field.placeholder).sort(), [...LANGUAGES].sort(), field.key);
    }
  }
  // The defaults of the manifest are the defaults of the code.
  const defaults = normalizeConfig({});
  assert.deepEqual(defaults.categories, categories.default);
  assert.deepEqual(defaults.sessions, sessions.default);
});

test('every filter is a key of its event; the options are the keys of the code', () => {
  const triggers = byKey(manifest.scene_triggers);
  for (const trigger of manifest.scene_triggers) {
    const variables = byKey(trigger.variables);
    for (const key of byKey(trigger.fields).keys()) {
      assert.ok(variables.has(key), `${trigger.key}: the filter ${key} is a key of the event`);
    }
  }
  const starting = byKey(triggers.get(TRIGGERS.STARTING).fields);
  assert.deepEqual(values(starting.get('lead')), LEADS);
  assert.deepEqual(values(starting.get('category')), CATEGORY_KEYS);
  assert.deepEqual(values(starting.get('session')), SESSION_KINDS);
  const results = triggers.get(TRIGGERS.RESULTS);
  const resultFields = byKey(results.fields);
  assert.deepEqual(values(resultFields.get('category')), RESULT_CATEGORY_KEYS);
  assert.deepEqual(values(resultFields.get('session')), RESULT_KINDS);
  assert.deepEqual(values(resultFields.get('favorite_result')), FAVORITE_RESULTS);
  for (const key of RESULT_SESSION_KEYS) {
    assert.ok(byKey(results.variables).has(key), key);
  }
  assert.deepEqual(
    values(byKey(triggers.get(TRIGGERS.LEADER).fields).get('category')),
    RESULT_CATEGORY_KEYS,
  );
  const actions = byKey(manifest.scene_actions);
  const outputs = (key) => actions.get(key).outputs.map((output) => output.key);
  assert.deepEqual(outputs(SCENE_ACTIONS.NEXT), NEXT_SESSION_OUTPUTS);
  assert.deepEqual(outputs(SCENE_ACTIONS.STANDINGS), STANDINGS_OUTPUTS);
  assert.deepEqual(outputs(SCENE_ACTIONS.RESULTS), LAST_RESULTS_OUTPUTS);
  for (const key of [SCENE_ACTIONS.STANDINGS, SCENE_ACTIONS.RESULTS]) {
    const fields = byKey(actions.get(key).fields);
    assert.deepEqual(values(fields.get('category')), RESULT_CATEGORY_KEYS, key);
    assert.equal(fields.get('category').default, 'motogp', key);
  }
  assert.deepEqual(
    values(byKey(actions.get(SCENE_ACTIONS.RESULTS).fields).get('session')),
    RESULT_KINDS,
  );
});

test('widget settings: the keys of the code', () => {
  const widgets = byKey(manifest.widgets);
  for (const key of [WIDGETS.NEXT, WIDGETS.SCHEDULE]) {
    const settings = byKey(widgets.get(key).settings);
    assert.deepEqual(values(settings.get('categories')), CATEGORY_KEYS, key);
    assert.deepEqual(values(settings.get('sessions')), SESSION_KINDS, key);
  }
  const schedule = byKey(widgets.get(WIDGETS.SCHEDULE).settings);
  assert.deepEqual(values(schedule.get('count')), SCHEDULE_COUNTS.map(String));
  for (const key of [WIDGETS.STANDINGS, WIDGETS.RESULTS]) {
    const settings = byKey(widgets.get(key).settings);
    assert.deepEqual(values(settings.get('category')), RESULT_CATEGORY_KEYS, key);
    assert.deepEqual(values(settings.get('count')), TABLE_COUNTS.map(String), key);
  }
  assert.deepEqual(
    values(byKey(widgets.get(WIDGETS.RESULTS).settings).get('session')),
    RESULT_KINDS,
  );
});

test('categories: unique acronyms, a hex color for each calendar, badges of 16 characters', () => {
  const list = Object.values(CATEGORIES);
  assert.equal(new Set(list.map((c) => c.acronym)).size, list.length);
  for (const [key, category] of Object.entries(CATEGORIES)) {
    assert.match(key, /^[a-z0-9_]+$/);
    assert.match(category.color, /^#[0-9a-f]{6}$/);
    assert.ok(category.name.length <= 16);
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog fields of Gladys 5.3: search keywords, available worldwide', () => {
  assert.ok(Array.isArray(manifest.keywords), 'keywords');
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10, '1 to 10 keywords');
  for (const keyword of manifest.keywords) {
    assert.ok(keyword.length <= 30 && keyword.trim().length >= 2, keyword);
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  // No `countries`: usable anywhere, the catalog shows it in every country.
  assert.equal(manifest.countries, undefined);
});
