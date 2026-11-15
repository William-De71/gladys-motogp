// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
// A calendar integration (manifest `type: "calendar"`): one calendar per
// followed class for every user who enabled it (src/calendar.js), four
// widgets, three scene triggers and three scene actions.
//
// A one-minute tick drives everything: it sends the reminders that are due,
// slides the calendar window at midnight, and runs the readings of
// motogp.com that are due (src/scan.js) in the background, one at a time.
// A new classification fires `results_published`, new standings may fire
// `leader_changed`; the calendars follow a changed calendar, the widgets
// every reading. The tests drive it with the fake Gladys of the SDK, a fake
// motogp.com and a clock moved by hand (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { createCalendarSync } from './calendar.js';
import { CATEGORY_KEYS } from './categories.js';
import { INTERNAL_KEYS, normalizeConfig, readKeys, textLanguage } from './config.js';
import {
  dueReminders,
  lastResultsOutputs,
  leaderEvent,
  nextSessionOutputs,
  resultsEvent,
  standingsOutputs,
} from './events.js';
import { all, truncate } from './i18n.js';
import { createMotoGpClient } from './motogp.js';
import { createScanner } from './scan.js';
import { RESULT_KINDS, SESSION_KINDS, upcomingSessions } from './sessions.js';
import { createStore } from './store.js';
import { MINUTE_MS, localClock } from './time.js';
import {
  buildLastResultsWidget,
  buildNextSessionWidget,
  buildScheduleWidget,
  buildStandingsWidget,
  lastResult,
  widgetCategory,
  WIDGETS,
} from './widgets.js';

const SCENE_ACTIONS = {
  NEXT: 'get_next_session',
  STANDINGS: 'get_standings',
  RESULTS: 'get_last_results',
};
const TICK_MS = MINUTE_MS;
const MAX_JOBS_PER_SCAN = 60;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies, replaced in the tests.
 * @param {object} [deps.client] - motogp.com client (src/motogp.js).
 * @param {object} [deps.store] - State file (src/store.js).
 * @param {Function} [deps.now] - Clock, in ms.
 * @param {string} [deps.timeZone] - Timezone of the instance (TZ by default).
 * @param {Function} [deps.sleep] - Delay between calendar writes.
 * @param {string} [deps.userAgent] - Sent to motogp.com.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ start, stop, tick, scan, store }`.
 */
export function createApp(gladys, deps = {}) {
  const {
    now = () => Date.now(),
    timeZone = process.env.TZ || undefined,
    sleep,
    userAgent = 'gladys-motogp (+https://github.com/William-De71/gladys-motogp)',
    logger = sdkLogger,
  } = deps;
  let config = normalizeConfig(gladys.config ?? {});
  const client = deps.client ?? createMotoGpClient({ userAgent });
  const store = deps.store ?? createStore({ logger });

  let timer = null;
  let stopped = false;
  let today = null;
  let ticking = null;
  let scanning = null;
  let lastConnection = null;
  const lastWidgetRefresh = new Map();
  const pendingWidgetRefresh = new Map();

  const currentDay = () => localClock(now(), timeZone).date;
  const language = () => textLanguage(config);

  const scanner = createScanner({ client, store, config: () => config, now, logger });
  const ready = () => store.sessions().length > 0;

  const calendarSync = createCalendarSync(gladys, {
    config: () => config,
    sessions: () => store.sessions(),
    ready,
    today: currentDay,
    timeZone,
    sleep,
    logger,
  });

  const safely = async (call) => {
    try {
      return await call();
    } catch (error) {
      logger.warn(error.message);
      return undefined;
    }
  };

  // --- Publications ------------------------------------------------------------

  const refreshWidget = (key) => {
    const wait = (lastWidgetRefresh.get(key) ?? 0) + WIDGET_REFRESH_SPACING_MS - Date.now();
    if (wait <= 0) {
      lastWidgetRefresh.set(key, Date.now());
      safely(() => gladys.requestWidgetRefresh(key));
      return;
    }
    if (!pendingWidgetRefresh.has(key)) {
      const pending = setTimeout(() => {
        pendingWidgetRefresh.delete(key);
        refreshWidget(key);
      }, wait);
      pending.unref?.();
      pendingWidgetRefresh.set(key, pending);
    }
  };

  const connectionStatus = () => {
    const { lastError } = scanner.status();
    if (lastError) {
      return {
        connected: ready(),
        message: all('statusUnreachable', { error: truncate(lastError.message, 80) }),
      };
    }
    if (!ready()) {
      return { connected: true, message: all('statusReading') };
    }
    const count = upcomingSessions(store.sessions(), {
      now: now(),
      categories: config.categories,
      kinds: config.sessions,
    }).length;
    return {
      connected: true,
      message: all('statusOk', { count, categories: config.categories.length }),
    };
  };

  const publishConnection = async () => {
    const status = connectionStatus();
    const message = Object.fromEntries(
      Object.entries(status.message).map(([lang, text]) => [lang, truncate(text, 200)]),
    );
    const key = JSON.stringify([status.connected, message]);
    if (key !== lastConnection) {
      await gladys.setConnectionStatus(status.connected, message);
      lastConnection = key;
    }
  };

  const refreshAllWidgets = () => {
    for (const key of Object.values(WIDGETS)) {
      refreshWidget(key);
    }
  };

  const publishAll = async () => {
    if (!gladys.connected) {
      return;
    }
    await safely(() => calendarSync.syncAll());
    await safely(() => publishConnection());
    refreshAllWidgets();
  };

  // --- Scanning ----------------------------------------------------------------

  /** What a reading brought: scene events, and whether the calendars changed. */
  const handle = async (job, done, before) => {
    if (!done) {
      return false;
    }
    if (done.type === 'calendar') {
      const { added, updated, removed } = done.changes;
      return added.length + updated.length + removed.length > 0;
    }
    if (done.type === 'result' && done.rows && done.watched) {
      const event = resultsEvent({
        session: done.session,
        rows: done.rows,
        firstSeen: store.firstSeen(done.session.id),
        now: now(),
        config,
        language: language(),
        timeZone,
      });
      if (event && gladys.connected) {
        await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
      }
    }
    if (done.type === 'standings' && done.rows) {
      const event = leaderEvent({
        category: done.category,
        year: done.year,
        rows: done.rows,
        previousLeader: done.previousLeader,
        standingsBefore: before,
      });
      if (event && gladys.connected) {
        await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
      }
    }
    return false;
  };

  /** Run the due readings in the background; resolves when they are done. */
  const scan = () => {
    if (!scanning) {
      scanning = (async () => {
        let calendarsChanged = false;
        let ran = 0;
        for (let job = scanner.nextJob(); job && !stopped; job = scanner.nextJob()) {
          const before =
            job.type === 'standings' ? store.standings(job.year, job.category)?.rows : null;
          const done = await scanner.run(job);
          calendarsChanged = (await handle(job, done, before)) || calendarsChanged;
          ran += 1;
          if (ran >= MAX_JOBS_PER_SCAN) {
            break;
          }
        }
        if (ran > 0 && gladys.connected) {
          if (calendarsChanged) {
            await safely(() => calendarSync.syncAll());
          }
          await safely(() => publishConnection());
          refreshAllWidgets();
        }
      })()
        .catch((error) => logger.warn(`scan failed: ${error.message}`))
        .finally(() => {
          scanning = null;
        });
    }
    return scanning;
  };

  // --- The tick ------------------------------------------------------------------

  const runTick = async () => {
    const day = currentDay();
    const dayChanged = today !== null && day !== today;
    today = day;
    if (gladys.connected) {
      const reminders = dueReminders({
        sessions: store.sessions(),
        now: now(),
        config,
        wasFired: (key) => store.wasFired(key),
        language: language(),
        timeZone,
      });
      for (const reminder of reminders) {
        await safely(() => gladys.publishSceneEvent(reminder.trigger, reminder.data));
        store.markFired(reminder.key, reminder.until);
      }
      store.pruneFired(now());
    }
    if (dayChanged) {
      await publishAll();
    }
    if (scanner.nextJob()) {
      scan();
    }
  };

  /** One tick at a time. */
  const tick = () => {
    if (!ticking) {
      ticking = runTick()
        .catch((error) => logger.warn(`tick failed: ${error.message}`))
        .finally(() => {
          ticking = null;
        });
    }
    return ticking;
  };

  // --- Language ----------------------------------------------------------------

  const rememberLanguage = (value) => {
    if (typeof value !== 'string' || !/^[a-z]{2}$/.test(value) || value === config.lastLanguage) {
      return;
    }
    config = { ...config, lastLanguage: value };
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: value })
      .catch((error) => logger.warn(`unable to store the language: ${error.message}`));
  };

  // --- Handlers ------------------------------------------------------------------

  const applyConfig = async (raw) => {
    config = normalizeConfig(raw ?? {});
    scanner.reset();
    lastConnection = null;
    await publishAll();
    tick();
  };

  gladys.on('connected', async () => {
    // Calendars may have changed while disconnected: push everything again.
    calendarSync.forget();
    await applyConfig(gladys.config ?? {});
    logger.info(`connected, following ${config.categories.join(', ')}`);
  });

  gladys.onConfigUpdated(async (raw) => {
    await applyConfig(raw);
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    await calendarSync.syncUser(userSelector);
  });

  const sessionsData = (settings) => ({
    sessions: store.sessions(),
    now: now(),
    timeZone,
    config,
    ready: ready(),
    fetchedAt: store.lastRead(),
    settings: settings ?? {},
  });

  gladys.onWidgetGet(WIDGETS.NEXT, async ({ settings, language: lang }) => {
    rememberLanguage(lang);
    return buildNextSessionWidget(sessionsData(settings));
  });

  gladys.onWidgetGet(WIDGETS.SCHEDULE, async ({ settings, language: lang }) => {
    rememberLanguage(lang);
    return buildScheduleWidget(sessionsData(settings));
  });

  gladys.onWidgetGet(WIDGETS.STANDINGS, async ({ settings, language: lang }) => {
    rememberLanguage(lang);
    const category = widgetCategory(settings ?? {}, config);
    const year = scanner.standingsYear(category);
    return buildStandingsWidget({
      standings: store.standings(year, category),
      year,
      timeZone,
      config,
      settings: settings ?? {},
    });
  });

  gladys.onWidgetGet(WIDGETS.RESULTS, async ({ settings, language: lang }) => {
    rememberLanguage(lang);
    return buildLastResultsWidget({
      sessions: store.sessions(),
      result: (id) => store.result(id),
      timeZone,
      config,
      settings: settings ?? {},
    });
  });

  /** The class of a scene action field, within the followed ones. */
  const actionCategory = (raw) => {
    const [chosen] = readKeys(raw, CATEGORY_KEYS, []);
    return widgetCategory({ category: chosen }, config);
  };

  gladys.onSceneAction(SCENE_ACTIONS.NEXT, async (fields = {}) => {
    const categories = readKeys(fields?.category, CATEGORY_KEYS, []).filter((key) =>
      config.categories.includes(key),
    );
    const kinds = readKeys(fields?.session, SESSION_KINDS, []);
    return nextSessionOutputs({
      sessions: store.sessions(),
      now: now(),
      categories: categories.length ? categories : config.categories,
      kinds: kinds.length ? kinds : config.sessions,
      language: language(),
      timeZone,
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.STANDINGS, async (fields = {}) => {
    const category = actionCategory(fields?.category);
    const year = scanner.standingsYear(category);
    return standingsOutputs({
      category,
      year,
      rows: store.standings(year, category)?.rows ?? [],
      favorites: config.favorites,
      language: language(),
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.RESULTS, async (fields = {}) => {
    const category = actionCategory(fields?.category);
    const [kind] = readKeys(fields?.session, RESULT_KINDS, ['race']);
    const last = lastResult(store.sessions(), (id) => store.result(id), category, kind);
    return lastResultsOutputs({
      session: last?.session ?? null,
      rows: last?.rows ?? [],
      favorites: config.favorites,
      language: language(),
      timeZone,
      category,
      kind,
    });
  });

  return {
    /** Start the one-minute tick (after connect). */
    start() {
      timer ??= setInterval(tick, TICK_MS);
      timer.unref?.();
    },
    /** Stop the timers and write the state (shutdown). */
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      for (const pending of pendingWidgetRefresh.values()) {
        clearTimeout(pending);
      }
      pendingWidgetRefresh.clear();
      store.flush();
    },
    tick,
    scan,
    store,
  };
}

export { SCENE_ACTIONS };
