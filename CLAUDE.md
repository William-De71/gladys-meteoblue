# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** of type `weather` built on the
[meteoblue Forecast API](https://my.meteoblue.com/packages/redoc): it answers
the weather requests of Gladys in the pivot format from one cached forecast per
place, watches the forecast of every located house for three scene triggers,
and adds three scene actions, four dashboard widgets and the meteoblue
meteogram (Image API). A Node.js service (Node 22+, ESM, no build step) in its
own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Only dependency: the SDK (`fetch` is native). Transport: cloud only. The user
brings the API key of their own meteoblue account (free Weather API trial:
10 million credits for one year, non-commercial use).

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js               SDK wiring only (new GladysIntegration + createApp)
src/app.js             every handler, registered before connect(): weather and its
                       images, watcher, scene actions, widgets and their images,
                       test action, configuration, connection status
src/meteoblue-api.js   Forecast API (basic-1h_basic-day) and Image API (meteogram)
                       client: documented requests, error classes, budget check
src/credits.js         the yearly credit budget: count (/data/credits.json), key
                       year, plan (refresh interval), hard cap, usage levels
src/forecast-store.js  one forecast per rounded place, refreshed at the plan's
                       interval, single flight, stale on failure, /data/forecasts.json
src/forecast.js        a meteoblue answer -> hours and days (°C, m/s, mm, instants)
src/weather.js         a forecast -> the pivot weather of Gladys
src/watcher.js         the scene triggers rain_expected, frost_expected, credits_level
src/meteograms.js      the meteogram cache (/data/meteograms) and its image keys
src/conditions.js      pictocodes -> pivot conditions, 4-language skies, icon keys/URLs
src/scene-actions.js   outputs of get_forecast, get_current, get_rain
src/widgets.js         daily, hourly, meteogram and credits widgets (pure builders)
src/houses.js / time.js / sun.js / units.js / config.js / i18n.js
```

## meteoblue facts (from the API reference, to re-check when in doubt)

- `GET https://my.meteoblue.com/packages/basic-1h_basic-day?lat&lon&apikey&format=json&tz`.
  Column arrays per section (`data_1h`, `data_day`), time axis "YYYY-MM-DD hh:mm"
  local to `tz` (DST change: an hour repeated or skipped, see time.js). Defaults:
  °C, m/s, degrees, mm; the `units` object of the answer is read anyway.
- Credits, not calls: basic-1h + basic-day in one call = 8,000 (the most
  expensive resolution of a package is charged once), `current` 4,000,
  `sunmoon` 4,000, an Image API picture 16,000. The cost of each call is in the
  `MB-Credits-Accounted` header. Free Weather API: 10 million credits a year,
  packages Basic (1h, 3h, 6h, day), Clouds, Solar, Wind, Air, Air quality,
  Agro, PVPro day, Trend day — **not** `current` nor `sunmoon` — and the
  meteograms of the Image API. 500 calls a minute at most.
- Errors: JSON `{ "error": true, "error_message": "…" }`; seen live on
  2026-10-20: 400 "Please specify an apikey…", 403 "Apikey was specified, but is
  not valid.", 403 "This api key requires signature validation…"; documented:
  403 "Access to the image API expired…", 429 "Available credits exceeded…".
- Pictocodes: hourly set 1-35, daily set 1-17 and 20-25. PNG pictograms on
  `static.meteoblue.com/assets/images/picto/`: `NN_day.png` / `NN_night.png`
  (1-35) and `NN_iday.png` (1-19 only). Free use with a link to the pictogram
  page; fetched at run time, never committed.
- Non-commercial use asks for a direct link to meteoblue for the same place:
  `https://www.meteoblue.com/<lang path>/<lat>N<lon>E` (signed numbers).
- Never tested with a real key.

## Rules

- **Keys are forever**: `config_schema`, actions, widgets and their settings and
  option values, scene triggers (fields, option values, variables), scene actions
  (fields, option values, outputs), the scene event data keys and the image
  keys. `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json` (0.1.0): never update the baseline
  without a documented migration.
- **Credits first**: every meteoblue call goes through the budget (credits.js)
  and, for forecasts, the store. A new call path must say what it costs a year
  and enter `plan()`; the figures of the form and the docs must stay right
  (`test/manifest.test.js` checks them).
- **Scenes**: events on transitions only; the first round after a start is a
  baseline. Never fire a scene event as a consequence of a scene action.
- **Secrets**: the API key is a `secret` field. meteoblue wants it in the query
  string: a URL is never logged nor put in an error (fetch errors are rebuilt
  without their cause).
- **No SSRF**: pictograms only from a known code, meteograms only for a
  registered place.
- **The container rootfs is read-only**: only `/data` is written
  (`credits.json`, `forecasts.json`, `meteograms/`).
- **Four languages** everywhere (manifest, `src/i18n.js`, widget texts, scene
  sentences, sky descriptions, docs, README); `test/i18n.test.js` checks it.
  Spanish follows Gladys: "vivienda", "activador".
- **Widget images**: after any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
