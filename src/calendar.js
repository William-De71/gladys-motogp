// -----------------------------------------------------------------------------
// The sessions in the Gladys calendar (manifest `type: "calendar"`).
//
// Every user who enabled the integration in "My calendars" gets one calendar
// per followed class ("MotoGP", "Moto2"…), with one timed event per session
// of the chosen kinds, in the language of the user ("MotoGP · Sprint –
// Valencia"). A window covers what is kept (14 days back, the rest of the
// season and the next one ahead): a session motogp.com drops disappears from
// Gladys too. The calendars are private when created: the user shares them
// with the household (and the scenes) from "My calendars".
//
// Limits of the core: 500 events per request (a class has about 200 sessions
// a season with every kind), 30 calendar writes per minute per integration
// (writes are spaced by 2.1 s).
//
// External ids: ext:<selector>:<user>:category-<key>  (calendar)
//               ext:<selector>:<user>:session-<motogp.com id>  (event)
// -----------------------------------------------------------------------------

import { categoryOf } from './categories.js';
import { sessionLabel, t, truncate } from './i18n.js';
import { calendarUrl, sessionDay } from './sessions.js';
import { addDays } from './time.js';

export const HISTORY_DAYS = 14;
export const FUTURE_DAYS = 430;
export const MAX_EVENTS_PER_REQUEST = 500;
export const WRITE_SPACING_MS = 2100;

/**
 * @description The external id of the calendar of a class for a user.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {string} category - Category key.
 * @returns {string} The external id.
 */
export function calendarId(gladys, user, category) {
  return gladys.externalId(`${user}:category-${category}`);
}

/**
 * @description The category of one of our calendar external ids.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {string} externalId - Calendar external id.
 * @returns {string|null} The category key.
 */
export function categoryOfCalendar(gladys, user, externalId) {
  const prefix = gladys.externalId(`${user}:category-`);
  return String(externalId).startsWith(prefix) ? String(externalId).slice(prefix.length) : null;
}

/**
 * @description The title of a session: "MotoGP · Sprint – Valencia".
 * @param {object} session - A session.
 * @param {string} language - The language.
 * @returns {string} The title.
 */
export function sessionTitle(session, language) {
  return t('eventTitle', language, {
    category: categoryOf(session.category)?.name ?? session.category,
    session: sessionLabel(session, language),
    place: session.place,
  });
}

/**
 * @description Circuit, city and country, as one line.
 * @param {object} session - A session.
 * @returns {string} "Circuit Ricardo Tormo, Cheste, Spain".
 */
export function sessionPlace(session) {
  return [session.circuit, session.city, session.country].filter(Boolean).join(', ');
}

/**
 * @description The calendar event of a session.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {object} session - A session.
 * @param {string} language - The user's language.
 * @returns {object} The event.
 */
export function buildEvent(gladys, user, session, language) {
  const description = [
    session.eventName,
    session.round ? t('round', language, { round: session.round }) : '',
    t('source', language),
  ]
    .filter(Boolean)
    .join('\n');
  const event = {
    external_id: gladys.externalId(`${user}:session-${session.id}`),
    name: truncate(sessionTitle(session, language), 200),
    description: truncate(description, 1000),
    url: calendarUrl(),
    start: new Date(session.start).toISOString(),
    end: new Date(session.end).toISOString(),
    full_day: false,
  };
  const place = sessionPlace(session);
  if (place) {
    event.location = truncate(place, 500);
  }
  return event;
}

/**
 * @description Create the calendar synchronizer.
 * @param {object} gladys - SDK client.
 * @param {object} options - Dependencies.
 * @param {Function} options.config - `() => normalized config`.
 * @param {Function} options.sessions - `() => every session kept`.
 * @param {Function} options.ready - `() => boolean`: a calendar was read at
 * least once (an empty calendar would wipe the events of a restart).
 * @param {Function} options.today - `() => 'YYYY-MM-DD'`.
 * @param {string} [options.timeZone] - IANA timezone.
 * @param {Function} [options.sleep] - Delay between two writes.
 * @param {object} [options.logger] - SDK logger.
 * @returns {{ syncAll: Function, syncUser: Function, forget: Function }} The synchronizer.
 */
export function createCalendarSync(
  gladys,
  { config, sessions, ready, today, timeZone, sleep = defaultSleep, logger },
) {
  // Last content pushed per calendar: an unchanged calendar is not pushed again.
  const pushed = new Map();
  let lastWrite = 0;
  let queue = Promise.resolve();

  const write = async (call) => {
    const wait = lastWrite + WRITE_SPACING_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastWrite = Date.now();
    return call();
  };

  const syncAccount = async (account, { force = false } = {}) => {
    const user = account.user.selector;
    const language = account.user.language;
    const { categories, sessions: kinds } = config();
    const followed = new Set(categories);

    // Calendars of classes no longer followed: deleted with their events.
    for (const calendar of await gladys.getCalendars(user)) {
      const category = categoryOfCalendar(gladys, user, calendar.external_id);
      if (category !== null && !followed.has(category)) {
        await write(() => gladys.deleteCalendar(calendar.external_id));
        pushed.delete(calendar.external_id);
      }
    }

    const calendars = categories.map((key) => {
      const category = categoryOf(key);
      return {
        external_id: calendarId(gladys, user, key),
        name: truncate(category.name, 100),
        description: truncate(t('calendarDescription', language, { category: category.name }), 500),
        color: category.color,
      };
    });
    const calendarsKey = JSON.stringify(calendars);
    if (force || pushed.get(`calendars:${user}`) !== calendarsKey) {
      await write(() => gladys.publishCalendars(user, calendars));
      pushed.set(`calendars:${user}`, calendarsKey);
    }

    if (!ready()) {
      return;
    }
    const skipped = new Set(
      (await gladys.getCalendars(user)).filter((c) => !c.sync).map((c) => c.external_id),
    );
    const from = addDays(today(), -HISTORY_DAYS);
    const to = addDays(today(), FUTURE_DAYS);
    const every = sessions();
    for (const key of categories) {
      const id = calendarId(gladys, user, key);
      if (skipped.has(id)) {
        continue;
      }
      const events = every
        .filter((session) => session.category === key && kinds.includes(session.kind))
        .filter((session) => {
          const day = sessionDay(session, timeZone);
          return day >= from && day < to;
        })
        .slice(0, MAX_EVENTS_PER_REQUEST)
        .map((session) => buildEvent(gladys, user, session, language));
      const content = JSON.stringify([from, to, events]);
      if (!force && pushed.get(id) === content) {
        continue;
      }
      try {
        await write(() => gladys.publishCalendarEvents(id, events, { from, to }));
        pushed.set(id, content);
      } catch (error) {
        // The user turned the sync of this calendar off meanwhile.
        if (error?.status === 403) {
          logger?.info(`calendar ${key} of ${user} not synchronized: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.warn(`calendar sync failed: ${error.message}`));
    return result;
  };

  return {
    /**
     * @param {object} [options] - `{ force }`: push even what did not change.
     * @returns {Promise<void>} Every enabled user synchronized.
     */
    syncAll: (options) =>
      enqueue(async () => {
        for (const account of await gladys.getCalendarAccounts()) {
          await syncAccount(account, options);
        }
      }),
    /**
     * @param {string} userSelector - The user whose account changed.
     * @returns {Promise<void>} That user synchronized (nothing if disabled).
     */
    syncUser: (userSelector) =>
      enqueue(async () => {
        const account = (await gladys.getCalendarAccounts()).find(
          (candidate) => candidate.user.selector === userSelector,
        );
        if (account) {
          await syncAccount(account, { force: true });
        } else {
          // Disabled: the core already deleted the calendars.
          for (const key of [...pushed.keys()]) {
            if (key.includes(`:${userSelector}:`) || key === `calendars:${userSelector}`) {
              pushed.delete(key);
            }
          }
        }
      }),
    /** Forget what was pushed (reconnection: the core may have changed meanwhile). */
    forget: () => pushed.clear(),
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
