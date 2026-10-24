# Fixtures

- `gladys-feature-table.json`: the category/type pairs the Gladys front end can
  display (from the core's code). Unused here (a weather integration publishes
  no device), kept for the maintainer's tooling.
- `real-*.json`: real answers of the Hong Kong Observatory open data API
  (`https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=…&lang=en`),
  recorded on 2026-10-24 around 12:10 Hong Kong time: `rhrread` (current
  weather report of 12:00), `fnd` (9-day forecast of 11:30, from 25 October),
  `flw` (local forecast), `warnsum` and `warningInfo` (a red fire danger
  warning in force). Only re-indented.
- `real-nowcast-hk.csv`: the gridded rainfall nowcast
  (`https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv`)
  issued at 12:00 the same day, cut to the grid points over Hong Kong
  (latitude 22.15-22.57, longitude 113.83-114.45; the real file covers the
  Pearl River Delta, 2.7 MB). It was dry: the tests stage rain with
  `withRain()`.
- `sample-warnsum-typhoon.json`, `sample-warningInfo-typhoon.json`: no typhoon
  signal was in force when recording. Written by hand in the documented format
  of the API (the structure of the real answers above, the codes of the API
  documentation): a No. 8 Northeast signal, an amber rainstorm signal and a
  cancelled fire danger warning.

Data: Hong Kong Observatory, through DATA.GOV.HK.
