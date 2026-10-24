# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Hong Kong Observatory as a weather provider for Gladys: the temperature of
  the station nearest each house in Hong Kong, the humidity and UV index, the
  current sky, sunrise and sunset, and the 9-day forecast (8 days shown: sky,
  temperatures, humidity, wind, chance of significant rain), in metric or US
  units. Outside Hong Kong, Gladys moves on to its next weather provider.
- The warnings and signals in force (tropical cyclone signals No. 1 to No. 10,
  rainstorm, thunderstorm, flooding, landslip, strong monsoon, very hot, cold,
  frost, fire danger, tsunami) as alerts of the weather widget, for the
  built-in weather alert trigger of Gladys too.
- Scene trigger "Hong Kong warning changed": a signal issued, upgraded,
  downgraded, updated or cancelled, filtered by change, severity and
  phenomenon.
- Scene trigger "Rain expected within the hour", from the Observatory's
  rainfall nowcast.
- Scene actions "Get the rain of the next hour", "Get the forecast of the day"
  and "Get the Hong Kong warnings" (typhoon signal number, rainstorm colour,
  highest severity).
- "Test the Observatory" in the configuration tab.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-hko/commits/main
