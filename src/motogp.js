// -----------------------------------------------------------------------------
// HTTP client of the public API behind motogp.com
// (https://api.motogp.pulselive.com/motogp/v1), no key needed.
//
// Two services:
//   - the calendar:  /events?seasonYear=<year>   (one answer per season,
//                    every event with its sessions and their times);
//   - the results:   /results/seasons, /results/categories?seasonUuid=,
//                    /results/events?seasonUuid=, /results/sessions?eventUuid=
//                    &categoryUuid=, /results/session/<id>/classification,
//                    /results/standings?seasonUuid=&categoryUuid=.
//
// The API is undocumented: the one of the website and the official apps.
// It announces 1 000 requests a minute (x-ratelimit-limit); the integration
// stays far below: one request at a time, one second apart, a few dozen a
// day outside the race weekends. A 404 answers JSON with an `error_type`
// (`event_not_found`, `session_not_found`).
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.motogp.pulselive.com/motogp/v1';
const TIMEOUT_MS = 20 * 1000;
const SPACING_MS = 1000;

/** An answer the integration cannot use. */
class MotoGpError extends Error {
  /**
   * @param {string} kind - `not_found`, `http`, `network` or `invalid`.
   * @param {string} message - What happened.
   * @param {number} [status] - The HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'MotoGpError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description Create the client.
 * @param {object} [options] - `{ fetch, userAgent, baseUrl, spacing, sleep, now }`.
 * @returns {object} The client.
 */
function createMotoGpClient({
  fetch: fetchImpl = globalThis.fetch,
  userAgent = 'gladys-motogp',
  baseUrl = BASE_URL,
  spacing = SPACING_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
} = {}) {
  let queue = Promise.resolve();
  let last = -Infinity;

  const request = async (path) => {
    const wait = last + spacing - now();
    if (wait > 0) {
      await sleep(wait);
    }
    last = now();
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new MotoGpError('network', error?.cause?.code ?? error?.message ?? 'network error');
    }
    const text = await response.text();
    if (response.status === 404) {
      throw new MotoGpError('not_found', `${path}: not found`, 404);
    }
    if (!response.ok) {
      throw new MotoGpError('http', `${path}: HTTP ${response.status}`, response.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new MotoGpError('invalid', `${path}: not JSON`, response.status);
    }
  };

  // One request at a time, in order.
  const get = (path) => {
    const result = queue.then(() => request(path));
    queue = result.catch(() => {});
    return result;
  };

  const list = async (path) => {
    const answer = await get(path);
    if (!Array.isArray(answer)) {
      throw new MotoGpError('invalid', `${path}: not a list`);
    }
    return answer;
  };

  const classificationOf = async (path) => {
    const answer = await get(path);
    if (!answer || !Array.isArray(answer.classification)) {
      throw new MotoGpError('invalid', `${path}: no classification`);
    }
    return answer.classification;
  };

  const q = encodeURIComponent;
  return {
    /** @param {number} year - Season. @returns {Promise<object[]>} Events with sessions. */
    calendar: (year) => list(`/events?seasonYear=${q(year)}`),
    /** @returns {Promise<object[]>} `{ id, year, current }`. */
    resultsSeasons: () => list('/results/seasons'),
    /** @param {string} season - Uuid. @returns {Promise<object[]>} `{ id, name, legacy_id }`. */
    resultsCategories: (season) => list(`/results/categories?seasonUuid=${q(season)}`),
    /** @param {string} season - Uuid. @returns {Promise<object[]>} `{ id, short_name, test }`. */
    resultsEvents: (season) => list(`/results/events?seasonUuid=${q(season)}`),
    /**
     * @param {string} event - Uuid of the results service.
     * @param {string} category - Uuid of the results service.
     * @returns {Promise<object[]>} `{ id, type, number, status }`.
     */
    resultsSessions: (event, category) =>
      list(`/results/sessions?eventUuid=${q(event)}&categoryUuid=${q(category)}`),
    /** @param {string} session - Uuid. @returns {Promise<object[]>} The classification. */
    classification: (session) =>
      classificationOf(`/results/session/${q(session)}/classification?test=false`),
    /**
     * @param {string} season - Uuid.
     * @param {string} category - Uuid.
     * @returns {Promise<object[]>} The championship classification.
     */
    standings: (season, category) =>
      classificationOf(`/results/standings?seasonUuid=${q(season)}&categoryUuid=${q(category)}`),
  };
}

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolved after the delay.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export { BASE_URL, MotoGpError, createMotoGpClient };
