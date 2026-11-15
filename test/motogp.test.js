// The HTTP client against a fake fetch: addresses, headers, errors, spacing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_URL, MotoGpError, createMotoGpClient } from '../src/motogp.js';

/** A fetch answering `answers[path]` = `{ status, body }`, recording the calls. */
function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const path = url.slice(BASE_URL.length);
    const answer = answers[path];
    if (answer instanceof Error) {
      throw answer;
    }
    const { status = 200, body = '[]' } = answer ?? { status: 404, body: '{}' };
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

const client = (answers, extra = {}) => {
  const fake = fakeFetch(answers);
  return {
    fake,
    api: createMotoGpClient({ fetch: fake.fetch, userAgent: 'test/1.0', spacing: 0, ...extra }),
  };
};

test('the addresses of the calendar and the results service, with a user agent', async () => {
  const { fake, api } = client({
    '/events?seasonYear=2026': { body: [{ id: 'a' }] },
    '/results/seasons': { body: [] },
    '/results/categories?seasonUuid=s': { body: [] },
    '/results/events?seasonUuid=s': { body: [] },
    '/results/sessions?eventUuid=e&categoryUuid=c': { body: [] },
    '/results/session/x/classification?test=false': { body: { classification: [{ id: 1 }] } },
    '/results/standings?seasonUuid=s&categoryUuid=c': { body: { classification: [] } },
  });
  assert.deepEqual(await api.calendar(2026), [{ id: 'a' }]);
  await api.resultsSeasons();
  await api.resultsCategories('s');
  await api.resultsEvents('s');
  await api.resultsSessions('e', 'c');
  assert.deepEqual(await api.classification('x'), [{ id: 1 }]);
  assert.deepEqual(await api.standings('s', 'c'), []);
  assert.equal(fake.calls.length, 7);
  assert.equal(fake.calls[0].options.headers['user-agent'], 'test/1.0');
  assert.ok(fake.calls[0].options.signal, 'a timeout');
});

test('errors: 404 not found, HTTP error, not JSON, unexpected shape, network', async () => {
  const { api } = client({
    '/events?seasonYear=2030': { status: 404, body: { error_type: 'event_not_found' } },
    '/events?seasonYear=2031': { status: 503, body: 'busy' },
    '/events?seasonYear=2032': { body: '<html>' },
    '/events?seasonYear=2033': { body: { not: 'a list' } },
    '/events?seasonYear=2034': Object.assign(new Error('fetch failed'), {
      cause: { code: 'ENOTFOUND' },
    }),
    '/results/session/y/classification?test=false': { body: {} },
  });
  const kindOf = async (call) => {
    try {
      await call();
      return 'none';
    } catch (error) {
      assert.ok(error instanceof MotoGpError);
      return `${error.kind} ${error.message}`;
    }
  };
  assert.match(await kindOf(() => api.calendar(2030)), /^not_found /);
  assert.match(await kindOf(() => api.calendar(2031)), /^http .*HTTP 503$/);
  assert.match(await kindOf(() => api.calendar(2032)), /^invalid .*not JSON$/);
  assert.match(await kindOf(() => api.calendar(2033)), /^invalid .*not a list$/);
  assert.equal(await kindOf(() => api.calendar(2034)), 'network ENOTFOUND');
  assert.match(await kindOf(() => api.classification('y')), /^invalid .*no classification$/);
});

test('one request at a time, spaced, even after a failure', async () => {
  let clock = 0;
  const waits = [];
  const { fake, api } = client(
    { '/results/seasons': { body: [] } },
    {
      spacing: 1000,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    },
  );
  await Promise.allSettled([api.resultsSeasons(), api.calendar(1999), api.resultsSeasons()]);
  assert.equal(fake.calls.length, 3);
  assert.deepEqual(waits, [1000, 1000]);
});
