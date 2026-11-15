# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the MotoGP World
Championship: a Node.js service (Node 22+, ESM, no build step) that runs in
its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The calendar, the results and the standings
(MotoGP, Moto2, Moto3, Bagger World Cup) come from the public, undocumented
API behind motogp.com (`https://api.motogp.pulselive.com/motogp/v1`), without
a key. Transport: cloud only. Unofficial: not affiliated with Dorna Sports.

A **calendar integration** (`type: "calendar"`, Gladys 5.3.0+): one calendar
per followed class for every user who enabled it in "My calendars", four
dashboard widgets, three scene triggers and three scene actions. No devices:
Gladys does not let one manifest be both.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp + shutdown)
src/app.js              every handler, registered before connect(); the one-minute tick
src/motogp.js           HTTP client of the API of motogp.com: one request at a time, 1 s apart
src/scan.js             what to read and when: calendar, classifications, standings, uuids
src/sessions.js         calendar of motogp.com -> sessions (kinds, numbers, estimated ends)
src/results.js          classifications, gaps, favorite riders
src/categories.js       our class keys -> calendar acronyms, results legacy ids, colors
src/calendar.js         one calendar per class and user, one event per session
src/events.js           scene trigger payloads, reminders, scene action outputs
src/widgets.js          the four widgets (pure, reused by docs/illustrations/gen.mjs)
src/store.js            /data/state.json: sessions, results, standings, uuids, reminders fired
src/config.js           configuration (classes, sessions, favorite riders, language)
src/i18n.js             runtime texts, en / fr / de / es
src/time.js             instants of motogp.com, dates in the timezone of the instance (TZ)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of motogp.com (2026-11-15), reduced
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: the class keys of `src/categories.js` (`motogp`,
  `moto2`, `moto3`, `baggers`: never an acronym nor a uuid), the session
  kinds (`race`, `sprint`, `qualifying`, `practice`, `warmup`, `test`), the
  favorite results (`win`, `podium`, `top_ten`, `finished`, `retired`,
  `absent`), the calendar ids `ext:<selector>:<user>:category-<key>`, the
  event ids `ext:<selector>:<user>:session-<motogp.com broadcast id>`, the keys
  of `config_schema`, of the widgets and their settings, of the scene triggers
  (fields, options, variables, the `lead` values) and of the scene actions
  (fields, outputs). `test/manifest.test.js` ties the manifest to the code.
- **Be gentle with motogp.com.** One request at a time, one second apart
  (`src/motogp.js`), a few dozen a day: the calendar every 6 hours (30 minutes
  during a Grand Prix weekend), the next season once a day from September, the
  previous one once a day until April; a classification from 3 minutes after
  the estimated end, every 5 minutes for 3 hours, then hourly for 2 days (every
  6 hours after, for 30 days); the standings twice a day and right after a race
  or sprint. A failed job waits 15 minutes. Never a retry in a loop.
- **Two id spaces.** The calendar (`/events`) and the results service
  (`/results/*`) do not share ids: a Grand Prix of the calendar is found in the
  results by its `shortname` (`QAT` = `short_name`), a class by its
  `legacy_id` (3, 2, 1), and the season, class and event uuids change every
  season (`ids` in /data, read again once a day).
- **Events once, on transitions.** `session_starting` once per session and
  lead, at most 10 minutes late (`fired` in /data survives restarts), never for
  a cancelled session; `results_published` only for a session first read
  before it started and at most a day after it (a first install announces
  nothing); `leader_changed` only when the stored leader differs (never on the
  first reading). A scene action or a widget never fires an event.
- **Times.** Instants come with the offset of the circuit ("+0100", no
  colon): `parseInstant` adds the colon. A race has no end in the calendar:
  45 minutes are assumed (25 for a sprint). Days are calendar days in the
  timezone of Gladys (`TZ`).
- **Calendars.** Events from 14 days back to 430 days ahead, in the language of
  each user (`account.user.language`); pushed at connection, when an account or
  the configuration changes, after a calendar reading that changed something,
  and at midnight. At most 30 writes a minute (spaced by 2.1 s); a calendar
  with `sync: false` is skipped. It starts private: the user shares it.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Names of riders, teams, circuits and
  Grands Prix stay as motogp.com writes them; scene variables carry keys for
  the filters. Use the words of the Gladys UI (My calendars / Mes calendriers
  / Meine Kalender / Mis calendarios, Enable for me…).
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; at most 20 variables
  per trigger (`results_published` carries a subset of the session data,
  `RESULT_SESSION_KEYS`). Transport: `["cloud"]`. No permission, no
  `countries` (followed everywhere).
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`test/helpers.js` fakes
  motogp.com from `test/fixtures/`).

## Pitfalls

- The calendar codes the Grand Prix of MotoGP `RAC` or `RAC2` although it is
  the only race: only "Nr. <n>" in the name numbers a race (the Baggers have
  `Race Nr. 1` and `Race Nr. 2`).
- `/results/sessions` answers 404 `event_not_found` for an event of the
  calendar id: use the results id found by `short_name`. Before a weekend, the
  results sessions carry placeholder dates: trust `status === 'FINISHED'` and a
  classification with at least one position, never the dates.
- Points can be halves (a shortened race): `286.5`.
- Status texts hold 40 characters, tile labels 24, tile values 12: the tile of
  the next session is "MotoGP Qualifications 1", without the dot of the rows.
- The process must stay alive on its own: the timers of the client are
  `unref()`ed (the SDK socket keeps the container running).
