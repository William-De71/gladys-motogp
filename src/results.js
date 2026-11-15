// -----------------------------------------------------------------------------
// Classifications of a session and of the championship, and the favorite
// riders of the user.
//
// A classification row of the results service: `position` (null for a rider
// not classified), `rider` (`full_name`, `number`, `country.iso`), `team`,
// `constructor`, `points`, `status` (INSTND = classified, OUTSTND = not
// classified, retired), `gap.first` (seconds behind the winner, as text),
// `gap.lap` (laps behind), `time` (race time of the winner), `best_lap.time`
// (qualifying). A standings row adds `race_wins`, `podiums`, `sprint_wins`.
//
// Favorite riders: the `favorite_riders` field of the configuration, a list
// of numbers or names ("93, Bezzecchi"); a number matches in every class, a
// name matches a part of the full name, accents and case ignored.
// -----------------------------------------------------------------------------

const FAVORITE_RESULTS = ['win', 'podium', 'top_ten', 'finished', 'retired', 'absent'];

/** Lower case, no accent: "Viñales" -> "vinales". */
const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * @description One row of a classification (session or championship).
 * @param {object} raw - A row of the results service.
 * @returns {object|null} `{ position, riderId, name, number, country, team, constructor, points, … }`.
 */
function parseRow(raw) {
  const rider = raw?.rider;
  if (!rider?.full_name) {
    return null;
  }
  const position = toNumber(raw.position);
  const lapsBehind = toNumber(raw.gap?.lap) ?? 0;
  return {
    position: position && position > 0 ? position : null,
    riderId: String(rider.id ?? ''),
    name: String(rider.full_name).trim(),
    number: toNumber(rider.number),
    country: String(rider.country?.iso ?? ''),
    team: String(raw.team?.name ?? '').trim(),
    constructor: String(raw.constructor?.name ?? '').trim(),
    points: toNumber(raw.points) ?? 0,
    status: String(raw.status ?? ''),
    gap: String(raw.gap?.first ?? ''),
    lapsBehind,
    time: String(raw.time ?? raw.best_lap?.time ?? ''),
    wins: toNumber(raw.race_wins),
    podiums: toNumber(raw.podiums),
    sprintWins: toNumber(raw.sprint_wins),
  };
}

/**
 * @description A classification: classified riders first, by position.
 * @param {object[]} raw - The rows of the results service.
 * @returns {object[]} The rows.
 */
function parseClassification(raw) {
  const rows = (Array.isArray(raw) ? raw : []).map(parseRow).filter(Boolean);
  return rows.sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * @description "41:29.173" for the winner, "+3.083", "+1 lap", '' for a rider
 * not classified (the caller says "retired").
 * @param {object} row - A row of a session.
 * @param {object} [labels] - `{ lap, laps }` in the language of the reader.
 * @returns {string} The gap.
 */
function gapText(row, labels = { lap: 'lap', laps: 'laps' }) {
  if (row.position === null) {
    return '';
  }
  if (row.position === 1) {
    // "01:50.028" -> "1:50.028".
    return row.time.replace(/^0(?=\d:)/, '');
  }
  if (row.lapsBehind > 0) {
    return `+${row.lapsBehind} ${row.lapsBehind === 1 ? labels.lap : labels.laps}`;
  }
  return row.gap && row.gap !== '0.000' ? `+${row.gap}` : row.time;
}

/**
 * @description Read the favorite riders of the configuration.
 * @param {unknown} raw - "93, Bezzecchi; 72".
 * @returns {{ numbers: number[], names: string[] }} Numbers and folded names.
 */
function parseFavorites(raw) {
  const numbers = [];
  const names = [];
  for (const token of String(raw ?? '').split(/[,;\n]+/)) {
    const value = token.trim().replace(/^#/, '');
    if (!value) {
      continue;
    }
    if (/^\d{1,3}$/.test(value)) {
      numbers.push(Number(value));
    } else if (fold(value).length >= 3) {
      names.push(fold(value));
    }
  }
  return { numbers: [...new Set(numbers)], names: [...new Set(names)] };
}

/**
 * @param {object} row - A row.
 * @param {{ numbers: number[], names: string[] }} favorites - Parsed favorites.
 * @returns {boolean} Whether the rider is a favorite.
 */
function isFavorite(row, favorites) {
  if (!favorites) {
    return false;
  }
  if (row.number !== null && favorites.numbers.includes(row.number)) {
    return true;
  }
  const name = fold(row.name);
  return favorites.names.some((part) => name.includes(part));
}

/**
 * @description The best placed favorite rider of a classification.
 * @param {object[]} rows - A classification, in order.
 * @param {{ numbers: number[], names: string[] }} favorites - Parsed favorites.
 * @returns {object|null} The row, null when no favorite is in it.
 */
function favoriteRow(rows, favorites) {
  return rows.find((row) => isFavorite(row, favorites)) ?? null;
}

/**
 * @description The result of the favorite rider, as a key the scenes filter on.
 * @param {object|null} row - The row of the favorite.
 * @returns {string} win, podium, top_ten, finished, retired or absent.
 */
function favoriteResult(row) {
  if (!row) {
    return 'absent';
  }
  if (row.position === null) {
    return 'retired';
  }
  if (row.position === 1) {
    return 'win';
  }
  if (row.position <= 3) {
    return 'podium';
  }
  return row.position <= 10 ? 'top_ten' : 'finished';
}

/**
 * @param {object[]} rows - A classification.
 * @returns {boolean} Whether it has at least one classified rider.
 */
function isComplete(rows) {
  return rows.some((row) => row.position !== null);
}

export {
  FAVORITE_RESULTS,
  fold,
  parseRow,
  parseClassification,
  gapText,
  parseFavorites,
  isFavorite,
  favoriteRow,
  favoriteResult,
  isComplete,
};
