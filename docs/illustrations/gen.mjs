// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Friday 20 November 2026, 10:00 in Paris, the morning before the Grand Prix
// of Portugal, following MotoGP and Moto2, Pedro Acosta as favorite rider.
// The calendar, the classification of the Qatar race and the standings are
// the real answers of motogp.com kept in test/fixtures/, read through the
// real parsers and widget builders.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const {
  buildNextSessionWidget,
  buildScheduleWidget,
  buildStandingsWidget,
  buildLastResultsWidget,
} = await load('src/widgets.js');
const { parseCalendar } = await load('src/sessions.js');
const { parseClassification } = await load('src/results.js');
const { normalizeConfig } = await load('src/config.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}.json`, 'utf8'));

const NOW = Date.parse('2026-11-20T09:00:00Z');
const TZ = 'Europe/Paris';
const sessions = parseCalendar(fixture('calendar-2026'), 2026);
const race = sessions.find(
  (s) => s.eventCode === 'QAT' && s.category === 'motogp' && s.kind === 'race',
);
const results = {
  [race.id]: {
    fetchedAt: NOW,
    rows: parseClassification(fixture('classification-qat-motogp-rac').classification),
  },
};
const standings = {
  fetchedAt: NOW - 7 * 60 * 1000,
  rows: parseClassification(fixture('standings-2026-motogp').classification),
};
const config = normalizeConfig({ categories: ['motogp', 'moto2'], favorite_riders: 'Acosta' });
const data = {
  sessions,
  now: NOW,
  timeZone: TZ,
  config,
  ready: true,
  fetchedAt: NOW - 7 * 60 * 1000,
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    next_session: buildNextSessionWidget({ ...data, settings: {} }),
    schedule: buildScheduleWidget({ ...data, settings: { count: '5' } }),
    standings: buildStandingsWidget({
      standings,
      year: 2026,
      timeZone: TZ,
      config,
      settings: { category: 'motogp', count: '5' },
    }),
    last_results: buildLastResultsWidget({
      sessions,
      result: (id) => results[id] ?? null,
      timeZone: TZ,
      config,
      settings: { category: 'motogp', session: 'race', count: '5' },
    }),
  };
}

const cards = Object.fromEntries(
  manifest.widgets.map((widget) => [widget.key, { icon: widget.icon, label: widget.label }]),
);
writeFileSync(out, JSON.stringify({ contents, images: {}, cards }));
