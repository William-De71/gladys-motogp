// -----------------------------------------------------------------------------
// Entry point of the MotoGP external integration.
//
// Brings the MotoGP World Championship (MotoGP, Moto2, Moto3 and the Bagger
// World Cup) into Gladys, from the public API behind motogp.com:
//   - calendars: one per followed class, for every user who enabled the
//     integration in "My calendars" (src/calendar.js);
//   - scene triggers: a session starts (or will start), results are out,
//     the championship has a new leader;
//   - scene actions: the next session, the standings, the last results;
//   - dashboard widgets: next session, schedule, standings, last results.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR, TZ
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = createApp(gladys, {
  userAgent: `gladys-motogp/${version} (+https://github.com/William-De71/gladys-motogp)`,
});

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the MotoGP integration ${version}...`);
gladys
  .connect()
  .then(() => app.start())
  .catch((err) => {
    logger.error('Initial connection failed', err);
    process.exit(1);
  });
