# Hong Kong Observatory for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the open data of the [Hong Kong Observatory](https://www.hko.gov.hk/en/)
(HKO) to Gladys: the weather of houses in Hong Kong, the warning signals in
force, and rain within the hour. No account, no API key.

Not affiliated with the Hong Kong Observatory.

## What it does

A **weather provider** (manifest `type: "weather"`): the Gladys weather
widget, the chat assistant and the built-in weather alert trigger use it.

- **Current weather**: the temperature of the station nearest the house (27
  stations, every 10 minutes), the humidity at the Observatory, the UV index of
  the past hour, the current sky, sunrise and sunset.
- **8 days** from the 9-day forecast: sky, minimum and maximum temperatures,
  humidity, wind, chance of significant rain.
- **Warnings and signals** as alerts: tropical cyclone signals No. 1 to No. 10,
  amber / red / black rainstorm, thunderstorm, flooding, landslip, strong
  monsoon, very hot, cold, frost, fire danger, tsunami.
- **Scene triggers**: "Hong Kong warning changed" (issued, upgraded,
  downgraded, updated, cancelled) and "Rain expected within the hour" (rainfall
  nowcast).
- **Scene actions**: "Get the rain of the next hour", "Get the forecast of the
  day", "Get the Hong Kong warnings" (typhoon signal number, rainstorm colour,
  highest severity).
- Texts in English, French, German and Spanish.

Outside Hong Kong it answers "no forecast", and Gladys moves on to its next
weather provider. Full user documentation: [`docs/en.md`](docs/en.md)
([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)).

## Install

Requires Gladys 5.2 or later, and a house with a location (**Settings →
Houses**).

In Gladys, **Integrations → Install from GitHub**, with the address
`https://github.com/guim31/gladys-hko` (or install it from the integration
store). Then click **Test the Observatory** in its Configuration tab.

## Calls and the Observatory's terms

Open data published through [DATA.GOV.HK](https://data.gov.hk/en/), under its
[terms of use](https://data.gov.hk/en/terms-and-conditions), with no published
rate limit. Every request is the same for everyone (no location is sent):

| Data                                   | Endpoint (`data.weather.gov.hk`)                      | Every  |
| -------------------------------------- | ----------------------------------------------------- | ------ |
| Current weather report                 | `weatherAPI/opendata/weather.php?dataType=rhrread`    | 10 min |
| Warnings in force, their texts         | `…dataType=warnsum`, `…dataType=warningInfo`          | 10 min |
| 9-day forecast, local forecast         | `…dataType=fnd`, `…dataType=flw`                      | 30 min |
| Gridded rainfall nowcast (CSV, 2.7 MB) | `weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv` | 30 min |

Nothing is called while no house is in Hong Kong. A 429 pauses every call (10
minutes, doubling up to 2 hours, or `Retry-After`), a 403 for 6 hours.

## Limits

- **Developed without a Gladys running in Hong Kong**: tested against real
  answers of the Observatory (24 October 2026) and, for the typhoon and
  rainstorm signals, the documented format of the API. Feedback welcome.
- No hourly forecast in the Observatory's open data: the 24-hour strip of the
  weather widget stays empty.
- Warnings are territory-wide; texts of the Observatory (details, forecast
  text) stay in English.
- The nowcast is downloaded every 30 minutes: a shower starting between two
  downloads is announced by the next one.

## Development

Node.js 22+, ESM, no build step; the only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm ci
npm run format:check   # Prettier (Markdown included)
npm run lint           # ESLint
npm test               # node --test, never touches the network
npx github:GladysAssistant/integration-store .   # store admission checks
```

The architecture is described in [`CLAUDE.md`](CLAUDE.md). Run it against a
Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="hko" \
LOG_LEVEL=debug \
npm start
```

## Releasing

Versions belong to the **Release** workflow (Actions → Release → patch, minor
or major): it bumps `package.json` and the manifest `version`/`docker_image`,
moves the `## [Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md), tags,
builds the multi-arch image to `ghcr.io/guim31/gladys-hko` and publishes the
GitHub Release.

> A hand-pushed tag (`git tag v1.0.0 && git push --tags`) triggers the same
> build and Release but touches no file: bump `version` in `package.json` and
> in `gladys-assistant-integration.json` (with the `docker_image` tag) and
> commit **before** tagging.

## Credits

- Data: Hong Kong Observatory, through DATA.GOV.HK. Icons and signal codes
  follow the documentation of the Observatory's open data API.
- Inspired by the Home Assistant [`hko`](https://www.home-assistant.io/integrations/hko/)
  integration (Apache 2.0); sunrise and sunset from the NOAA solar calculator
  algorithms.
- Cover: the official logo of the Hong Kong Observatory (vector reproduction
  from its publications, as hosted on Wikipedia), in white on its blue.
- Started from the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js).

## License

Apache-2.0
