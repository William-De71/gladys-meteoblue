# Meteoblue

## Overview

This integration makes the **meteoblue Forecast API** a weather provider of Gladys. Once installed, the weather card of the dashboard and the chat assistant ("what's the weather like tomorrow?") use it instead of the built-in OpenWeather service.

It provides:

- the **weather of the present hour**: temperature, feels like, humidity, pressure, wind, UV index, day or night, sunrise and sunset;
- the **forecasts**: 24 hours and the 7 days of meteoblue, with the **predictability** meteoblue gives each day (how far its models agree);
- three **scene triggers**: rain expected within 3 hours, frost expected within 12 hours, credits running out;
- three **scene actions**, four **dashboard widgets**, and the meteoblue **meteogram** (optional).

meteoblue (Basel, Switzerland) blends many weather models and corrects them with nearby stations, radar and satellite. Everything goes through meteoblue's servers (cloud only), with **your own API key**: the free Weather API trial gives 10 million credits for one year, for non-commercial use, and the integration spreads them over the year itself.

meteoblue publishes no official warning in this API: the weather-alert trigger of Gladys stays silent with this provider. The rain and frost triggers of the integration are forecasts, not official warnings.

> This integration has not been tested with a real API key yet: it follows the meteoblue API reference to the letter. Please report any problem.

## Requirements

- Gladys 5.3.0 or later.
- A house with a location (Settings → Houses): the forecast of every located house is watched for the scene triggers.
- A meteoblue account with the **Weather API** access (the free trial is enough), for non-commercial use.

## Configuration

### 1. A meteoblue account and its free key

1. Create a free account on [meteoblue.com](https://www.meteoblue.com/en/user/login/index) and log in.
2. Click the account icon (top right) → **Account overview** → **Weather API**: the free trial starts at once, for one year, with 10 million credits. You confirm a non-commercial use.
3. Copy the **API key** shown there. Keys that require signed requests (a shared secret) are not supported.

The steps are those of the [meteoblue documentation](https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview). More credits can be bought later (200 € for 200 million at the time of writing, [pricing](https://content.meteoblue.com/en/business-solutions/weather-apis/pricing)).

### 2. Credits and refresh

meteoblue counts **credits**, not calls ([Forecast API reference](https://my.meteoblue.com/packages/redoc)). What the integration spends:

| Call                                       | Credits | With the 10 million free credits                |
| ------------------------------------------ | ------- | ----------------------------------------------- |
| Forecast refresh (hourly + 7 days, 1 call) | 8,000   | about 3 a day for one house, every 7 h or so    |
| Meteogram picture (optional)               | 16,000  | 24 h kept = 5.8 million a year, half the budget |
| "Test the API key"                         | 8,000   | on demand                                       |

The integration counts what each answer cost (meteoblue says it in a header), keeps the count in `/data`, and **spreads the credits left over the rest of the key year**: the refresh interval is computed, never shorter than the "Refresh at most every" floor. A 2 % reserve stays for the test button. Every located house refreshes on its own, so two houses refresh half as often. The forecasts are kept in `/data`: a restart of Gladys costs nothing. Once the year's credits are spent, no call goes out until the next key year, and the last forecast is served as long as it covers the present hour (7 days).

### 3. In Gladys

1. Integrations → Meteoblue → Configuration.
2. Paste the **API key**. Enter the **start of the key year** if you know it (the day you enabled the Weather API), otherwise the first day of use is taken.
3. Save, then click **Test the API key**: it reads the forecast of your first house now (8,000 credits) and shows the credits used and the refresh interval they allow.

| Field                       | Default    | Purpose                                                      |
| --------------------------- | ---------- | ------------------------------------------------------------ |
| API key                     | —          | Your meteoblue key, stored as a secret                       |
| Credits per key year        | 10,000,000 | Raise it after buying credits; never spent beyond            |
| Start of the key year       | empty      | YYYY-MM-DD; empty = the first day the key was used           |
| Refresh at most every (min) | 60         | 30 to 1,440: a floor, the credits usually decide             |
| Show the meteogram          | off        | The 5-day meteogram picture, 16,000 credits each             |
| Keep a meteogram for (h)    | 24         | 3 to 168: a picture is fetched only when someone looks at it |

## Usage

### Weather card and assistant

Nothing to do: the weather card of the dashboard uses this provider. With several weather providers installed, pin one in the settings of the card. With the meteogram switched on, the card offers it as a provider image. meteoblue covers the whole world; the forecast of a house is cut into days in the time zone of Gladys.

### Widgets

![Generated illustration of the four widgets — 7-day forecast, next hours, meteogram, credits — not a screenshot](https://raw.githubusercontent.com/William-De71/gladys-meteoblue/main/docs/assets/widgets.en.png)

- **7-day forecast**: 3, 5 or 7 days with the meteoblue pictograms, high and low, sky, chance of precipitation; tap a day for the amount and hours of precipitation, the wind, the UV index, the predictability and the sun times. A day of low predictability without rain gets a badge.
- **Next hours**: a curve of the next 12, 24 or 48 hours: temperature and feels like, precipitation, or wind.
- **Meteogram**: the 5-day meteogram of meteoblue (temperature, clouds, precipitation, wind), when switched on in the configuration.
- **meteoblue credits**: the credits used and left this key year, the refresh interval they allow, the days left and the last call.

The forecast widgets have a **House** setting (empty for the first located house), name their source and link to the meteoblue page of the same place.

### Scene triggers

- **Rain expected soon**: the forecast now shows precipitation within the next 3 hours (at least 0.2 mm in an hour, and a chance of 40 % or more when meteoblue gives one), after a check that showed none. Filters: house, kind (rain, snow, rain and snow). Variables: house, kind, start time, minutes until it starts, amount over 3 hours, chance, sky.
- **Frost expected**: the forecast now shows 0 °C or below within the next 12 hours. Variables: house, start time, hours until it starts, lowest temperature and its time.
- **meteoblue credits running out**: 75, 90 or 100 % of the credits of the key year are used, each level once a key year. Variables: level, credits used, per year, left, next key year.

The watcher looks at the cached forecast every 10 minutes (it costs no credit). The first check after a start sets the baseline: a rain already expected does not fire. The forecast is as fresh as the credits allow (about 7 hours old at most with the free key, for one house).

### Scene actions

- **Get the forecast of a day**: today to 6 days ahead: high, low, sky, amount and chance of precipitation, predictability, max wind, summary.
- **Get the current weather**: temperature, feels like, humidity, wind, sky and summary of the present hour.
- **Is rain expected?**: within 3 to 24 hours: yes or no, from when, rain or snow, total amount, max chance, summary.

### Scene examples

- When **rain is expected soon** (house "Home", kind "Rain") → send "Bring the washing in: `{{triggerEvent.data.kind}}` from `{{triggerEvent.data.start_time}}`" to your phone.
- When **frost is expected** → close the garden water valve and send `{{triggerEvent.data.min_temperature}}` °C at `{{triggerEvent.data.coldest_time}}`.
- Every evening at 20:00 → **Is rain expected?** (12 hours) → if no precipitation is expected, start the garden watering.

### Attribution and non-commercial use

The free key is for **non-commercial use** ([meteoblue conditions](https://content.meteoblue.com/en/about-us/legal/commercial-non-commercial-use)), which asks for a direct link to meteoblue for the same place: every forecast widget names meteoblue and carries that link, and the meteogram keeps the meteoblue logo. The weather pictograms are those of meteoblue, offered for free use with a link to their [pictogram page](https://docs.meteoblue.com/en/meteo/variables/pictograms); they are fetched from meteoblue by the integration, never by your browser. Weather data © meteoblue AG.

## Troubleshooting

- **"meteoblue refused the API key (invalid)"**: the key is wrong; copy it again from Account overview → Weather API.
- **"(missing)"**: no key saved in the configuration.
- **"the access of this key has expired"**: the free year is over; renew it or buy credits on meteoblue.com.
- **"requires signed requests"**: the key is protected by a shared secret, not supported; use a key without signature.
- **"refused the request for credits or rate"**: meteoblue's own count is spent, or a daily limit is set on the key in your account; the cached forecast is served meanwhile.
- **"Credits of the key year spent"**: the integration's cap is reached; raise "Credits per key year" after buying credits, or wait for the next key year. The meteoblue account page is the reference (it also counts other uses of the key).
- **The forecast seems old**: the free credits allow a refresh about every 7 hours for one house; the "meteoblue credits" widget shows the interval.
- **No weather for a house**: it has no location in Gladys.
- Logs: Settings → Supervision → Meteoblue. The key never appears in them.
