// -----------------------------------------------------------------------------
// Entry point of the Meteoblue external integration.
//
// A weather provider for Gladys built on the meteoblue Forecast API: the
// conditions of the present hour, 24-hour and 7-day forecasts, rain and frost
// scene triggers, scene actions, four dashboard widgets and the meteogram of
// meteoblue. The user brings the API key of their own meteoblue account (the
// free Weather API trial: 10 million credits a year).
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the time zone of Gladys, the fallback for the local times)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Meteoblue integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
