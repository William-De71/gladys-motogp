// -----------------------------------------------------------------------------
// Configuration of the integration.
//
// Fields of the config_schema:
//   - `categories`        the classes followed (multi_select, src/categories.js):
//                         one calendar each, and the only ones the scenes and
//                         widgets see;
//   - `sessions`          the kinds of sessions put in the calendars and seen
//                         by the "session starts" trigger and the schedule
//                         widgets (src/sessions.js);
//   - `favorite_riders`   numbers or names ("93, Bezzecchi"): their place in
//                         the results and the championship (src/results.js);
//   - `language`          language of the texts Gladys does not ask for in a
//                         language (scene action outputs, scene variables):
//                         `auto` follows the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { CATEGORY_KEYS, DEFAULT_CATEGORIES } from './categories.js';
import { isLanguage } from './i18n.js';
import { parseFavorites } from './results.js';
import { DEFAULT_SESSION_KINDS, SESSION_KINDS } from './sessions.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a list of keys.
 * @param {unknown} raw - An array (multi_select), a JSON array or "a, b".
 * @param {string[]} allowed - The known keys.
 * @param {string[]} fallback - The default when none is valid.
 * @returns {string[]} Known keys, in the order of `allowed`.
 * @example
 * readKeys(['moto2', 'nope', 'motogp'], ['motogp', 'moto2'], ['motogp']); // -> ['motogp', 'moto2']
 */
function readKeys(raw, allowed, fallback) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(/[,;\s]+/);
    }
  }
  const given = new Set((Array.isArray(list) ? list : []).map((value) => String(value).trim()));
  const keys = allowed.filter((key) => given.has(key));
  return keys.length ? keys : [...fallback];
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ categories, sessions, favorites, favoritesText, language, lastLanguage }`.
 */
function normalizeConfig(rawConfig = {}) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const favoritesText = typeof raw.favorite_riders === 'string' ? raw.favorite_riders.trim() : '';
  return {
    categories: readKeys(raw.categories, CATEGORY_KEYS, DEFAULT_CATEGORIES),
    sessions: readKeys(raw.sessions, SESSION_KINDS, DEFAULT_SESSION_KINDS),
    favorites: parseFavorites(favoritesText),
    favoritesText,
    language: isLanguage(raw.language) ? raw.language : AUTO_LANGUAGE,
    lastLanguage: isLanguage(raw[INTERNAL_KEYS.language]) ? raw[INTERNAL_KEYS.language] : 'en',
  };
}

/**
 * @description The language of the texts no Gladys request gives one for.
 * @param {object} config - Normalized config.
 * @returns {string} en, fr, de or es.
 */
function textLanguage(config) {
  return config.language === AUTO_LANGUAGE ? config.lastLanguage : config.language;
}

export { AUTO_LANGUAGE, INTERNAL_KEYS, readKeys, normalizeConfig, textLanguage };
