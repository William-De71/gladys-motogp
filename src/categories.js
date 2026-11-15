// -----------------------------------------------------------------------------
// The classes of the championship the integration follows.
//
// Our keys are forever (config, calendars, scenes, widgets). The calendar of
// motogp.com names a class by an acronym (MGP, MT2, MT3, BWC); the results
// service names it by a uuid that changes every season, found through its
// `legacy_id` (3, 2, 1). The Bagger World Cup (Harley-Davidson, since 2026)
// has sessions in the calendar but no results in the results service.
// MotoE is paused in 2026: it is not offered.
// -----------------------------------------------------------------------------

const CATEGORIES = {
  motogp: { acronym: 'MGP', name: 'MotoGP', resultsLegacyId: 3, color: '#c8102e' },
  moto2: { acronym: 'MT2', name: 'Moto2', resultsLegacyId: 2, color: '#1f5fbf' },
  moto3: { acronym: 'MT3', name: 'Moto3', resultsLegacyId: 1, color: '#d9730d' },
  baggers: { acronym: 'BWC', name: 'Baggers', resultsLegacyId: null, color: '#4a4a4a' },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);
const DEFAULT_CATEGORIES = ['motogp'];

/** Categories whose results and standings the results service publishes. */
const RESULT_CATEGORY_KEYS = CATEGORY_KEYS.filter(
  (key) => CATEGORIES[key].resultsLegacyId !== null,
);

/**
 * @param {string} key - A category key.
 * @returns {object|undefined} The category.
 */
function categoryOf(key) {
  return CATEGORIES[key];
}

/**
 * @param {string} acronym - MGP, MT2, MT3 or BWC.
 * @returns {string|null} Our key, null for a class we do not follow.
 */
function categoryOfAcronym(acronym) {
  return CATEGORY_KEYS.find((key) => CATEGORIES[key].acronym === acronym) ?? null;
}

/**
 * @param {string} key - A category key.
 * @returns {boolean} Whether results and standings exist for it.
 */
function hasResults(key) {
  return RESULT_CATEGORY_KEYS.includes(key);
}

export {
  CATEGORIES,
  CATEGORY_KEYS,
  DEFAULT_CATEGORIES,
  RESULT_CATEGORY_KEYS,
  categoryOf,
  categoryOfAcronym,
  hasResults,
};
