# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Weather provider for Gladys built on the meteoblue Forecast API (basic-1h and basic-day packages, in the free Weather API trial): the weather of the present hour (temperature, feels like, humidity, pressure, wind, UV index, day or night, sunrise and sunset), 24 hourly and 7 daily forecasts, in metric or US units.
- Scene triggers "Rain expected soon" (precipitation within 3 hours, filtered by house and by rain, snow or both), "Frost expected" (0 °C or below within 12 hours) and "meteoblue credits running out" (75, 90 and 100 % of the key year).
- Scene actions: the forecast of a day (today to 6 days ahead, with meteoblue's predictability), the current weather, and whether precipitation is expected in the next hours.
- Dashboard widgets: a 7-day forecast with the meteoblue pictograms and predictability, a curve of the next 12 to 48 hours (temperature, precipitation or wind), the meteoblue meteogram, and the credit budget of the key year.
- Optional meteoblue meteogram in the weather card and its widget, fetched only when someone looks at it and kept 24 hours by default.
- Credit budget: one call (8,000 credits) feeds everything, the refresh interval is spread over the credits left until the end of the key year, forecasts and counter are kept in /data so a restart costs nothing, and a hard yearly cap; a "Test the API key" action shows the credits used.
- Attribution as meteoblue asks of free uses: every forecast widget names meteoblue and links to the meteoblue page of the same place.
- English, French, German and Spanish everywhere: settings, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-meteoblue/releases/tag/v0.1.0
