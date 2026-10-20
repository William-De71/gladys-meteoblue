// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The data are the test fixtures (test/helpers/fixtures.js): made-up but
// shaped exactly like the documented meteoblue answers, for Paris on Tuesday
// 20 October 2026 at 10:00 — rain in the afternoon, a frost night on Friday.
// The credit budget is a key year started on 1 June 2026, spent at the pace
// of the plan.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDailyWidget, buildHourlyWidget, buildMeteogramWidget, buildCreditsWidget } =
  await load('src/widgets.js');
const { iconUrlFromKey } = await load('src/conditions.js');
const { parseForecast } = await load('src/forecast.js');
const { createCredits } = await load('src/credits.js');
const { LANGUAGES } = await load('src/i18n.js');
const fixtures = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const HOUSES = { en: 'Home', fr: 'Maison', de: 'Zuhause', es: 'Casa' };
const { NOW, TIME_ZONE, LATITUDE, LONGITUDE, HOUR } = fixtures;
const forecast = parseForecast(fixtures.forecastAnswer(), { timeZone: TIME_ZONE });
const fetchedAt = NOW - 2 * HOUR;
const METEOGRAM_KEY = 'mb-mg-0123456789-mgxyz';

const clock = { now: Date.parse('2026-10-20T06:12:00Z') };
const settings = { annualCredits: 10000000, keyStartDate: '2026-06-01', minRefreshMinutes: 60 };
const credits = createCredits({ path: null, getConfig: () => settings, now: () => clock.now });
credits.record('forecast', 3904000);
credits.record('forecast', 8000);
clock.now = NOW;

const contents = {};
for (const language of LANGUAGES) {
  const house = { name: HOUSES[language], latitude: LATITUDE, longitude: LONGITUDE };
  const units = language === 'en' ? 'us' : 'metric';
  const common = { forecast, at: fetchedAt, house, language, units, now: NOW };
  contents[language] = {
    daily: buildDailyWidget({ ...common, settings: { days: '7', show_icons: true } }),
    hourly: buildHourlyWidget({ ...common, settings: { metric: 'temperature', hours: '24' } }),
    meteogram: buildMeteogramWidget({
      house,
      imageKey: METEOGRAM_KEY,
      at: NOW - 5 * HOUR,
      timeZone: TIME_ZONE,
      language,
    }),
    credits: buildCreditsWidget({
      credits,
      plan: credits.plan({ locations: 1 }),
      places: 1,
      language,
    }),
  };
}

// The images the widgets show: the meteoblue pictograms, as the image handler
// fetches them, and the stand-in drawing of the meteogram (meteogram.svg).
const images = { [METEOGRAM_KEY]: 'meteogram' };
for (const content of Object.values(contents)) {
  for (const component of content.daily.components) {
    for (const item of component.items ?? []) {
      if (item.image) {
        images[item.image] = iconUrlFromKey(item.image);
      }
    }
  }
}

const cards = Object.fromEntries(
  manifest.widgets.map((widget) => [widget.key, { label: widget.label, icon: widget.icon }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, cards, images, contents }));
