# Bus network: dataset ingestion and database foundation

This is the **data foundation** for Delhi buses only: the GTFS dataset is validated and stored in PostgreSQL/PostGIS.
There is no journey calculation, no API and no UI for buses yet.

## The dataset

Location: `backend/metro.data/bus/` (git-ignored; the original files are never modified by the importer).

| File | Rows | Used |
|---|---|---|
| `agency.txt` | 2 (DTC, DIMTS) | yes |
| `calendar.txt` | 1 service, 2024-01-01 to 2027-01-01, all seven days | yes |
| `stops.txt` | 10,559 | yes |
| `routes.txt` | 2,403 | yes |
| `trips.txt` | 89,393 | yes |
| `stop_times.txt` | 3,724,320 | yes (streamed) |
| `fare_attributes.txt`, `fare_rules.txt` | 2,305,138 each | **not read** (fares are out of scope) |

Not in the dataset: `shapes.txt` (so no route geometry; trips have no `shape_id`), `calendar_dates.txt`, `feed_info.txt`,
`transfers.txt`. It states **no version or publication date**, which is why `BUS_IMPORT_SOURCE_VERSION` is required.

Properties worth knowing (all measured, none assumed): `stop_sequence` starts at **0**; stop times pass midnight (hours up to
**33**); `stop_code` is **not** unique (3,679 codes are shared by co-located stop ids) and neither are stop names or route long
names (422 long names are used by more than one route), `route_short_name` is empty, trips have no headsign or direction.
A route is therefore always identified by its GTFS `route_id`, never by its name.

## Running the import

1. Put the dataset in `backend/metro.data/bus/` and set `BUS_IMPORT_SOURCE_VERSION` in `backend/.env` (see `.env.example`).
2. `gradlew importBus` (PostgreSQL must be running; Flyway applies `V7__bus_network.sql` on start).
3. Read the statistics printed at the end. Check the result with `psql -f backend/db-tools/bus-verify.sql`.

There is no HTTP endpoint for the import and a normal start never imports.

## Importer behaviour

* **Validation** (invalid records are counted by reason and skipped; nothing is invented): missing/duplicate ids, bad or
  out-of-region coordinates, unknown agency/route/service/stop/trip references, malformed times (`H:MM:SS`, hours 0-47),
  negative or duplicate stop sequences, trips with fewer than two stop times or times going backwards, shapes with fewer than
  two points, unknown shape references (cleared and counted).
* **Streaming:** `stop_times` is read row by row and validated trip by trip; accepted trips are written in batches
  (`BUS_IMPORT_BATCH_SIZE`, default 5,000). A trip is never split over two batches.
* **One transaction:** the whole import commits or rolls back; a failed import leaves the previous data untouched. An empty or
  unusable dataset is refused.
* **Idempotent:** ids are derived from `source + kind + GTFS id`; every write is an upsert on `(source, external_id)`; a
  trip's stop times are replaced as a whole. Importing the same data twice changes nothing but timestamps.
* **Records no longer in the dataset:** stops, routes and agencies are marked `active = false`; trips (with their stop times),
  services and shapes are removed.
* **Metadata:** `bus_dataset` holds source, version, publisher date, import time, service period, operating days and the
  statistics (counts, rejection reasons, warnings).

## Schema (`V7__bus_network.sql`)

`bus_dataset`, `bus_agency`, `bus_stop` (`geometry(Point, 4326)`), `bus_route`, `bus_service`, `bus_service_date`,
`bus_shape` (`geometry(LineString, 4326)`), `bus_trip`, `bus_stop_time`. Foreign keys: route -> agency, trip -> route /
service / shape, stop time -> trip / stop. Times are integer seconds since the start of the service day (may exceed 86,400).

Indexes: unique `(source, external_id)` on every entity; GiST on `bus_stop.location` and `bus_shape.geometry`;
`bus_trip(route_id)`, `bus_trip(service_id)`; `bus_stop_time(trip_id, stop_sequence)` (primary key) and
`bus_stop_time(stop_id, departure_seconds)` for "which buses call here, and when".

Spatial query note: `ST_DWithin(location::geography, ...)` does not use the geometry GiST index; use the KNN operator
(`ORDER BY location <-> point LIMIT n`) or a geometry `ST_DWithin` with a degree bound / bounding-box prefilter.

## Not done (on purpose)

Journey calculation, stop search, bus API endpoints, UI, fares, transfers, live data.

See also [the bus journey engine](bus-journey.md), which plans journeys over this data.
