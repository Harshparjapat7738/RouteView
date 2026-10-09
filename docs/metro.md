# Delhi Metro journeys

Metro is a travel mode like the others. Choosing it only changes search state; **Find Routes** sends the single
request, with `travelMode = METRO`. Delhi / NCR is the first supported network. The model is not Delhi-specific, so
another network is a new import, not new code.

## What comes from where

| Information | Source |
| --- | --- |
| The journey (route, duration, walking, lines, boarding/exit stops, stop counts, times, **fare**) | Google Routes API `TRANSIT` request with a subway preference. Calculated per request. |
| Stations, lines, the order of stations on each line, interchanges | RouteView's own tables, filled **once** by an explicit import of a published GTFS dataset. Never queried from the dataset at runtime. |
| Station and line **colours** | The dataset's own `route_color`. A line without one is drawn grey; no colour is invented. |
| Fare | Google's `travelAdvisory.transitFare`, only when Google returns one. Otherwise the UI says "Fare unavailable". RouteView never estimates a fare and has no fare table. |

There is no real-time data anywhere: no live positions, delays, crowding or platform information. The timeline says
"Static data, not real time" next to the dataset version.

There is no Google "metro" mode. Google returns what it finds (it may include walking, buses or rail other than the
metro); a ride whose vehicle is not a subway/metro rail is shown as "not metro" and never counted as a metro ride.
A driving route is never substituted and labelled Metro.

## Importing the station data

The data is the DMRC GTFS static dataset published on the Delhi Open Transit Data portal
(<https://otd.delhi.gov.in>). The publicly listed dataset is dated **2023-08-10**.

1. Read the portal's terms of use, then download the GTFS `.zip` yourself. The dataset is **not** part of this
   repository and must not be committed. Nothing is scraped.
2. Put the downloaded `.zip` (or its unzipped folder, the one containing `stops.txt`) into **`backend/metro.data/`** (the metro dataset in `metro.data/metro/`; the bus dataset lives beside it in `metro.data/bus/`, see [bus.md](bus.md)).
   Keep only one dataset there; its files are git-ignored. To import from elsewhere set `METRO_IMPORT_SOURCE_FILE`
   (a `.zip` or a folder containing `stops.txt`).
3. Set in `backend/.env` (see `.env.example`; the file is git-ignored):

   ```
   METRO_IMPORT_SOURCE_VERSION=2023-08-10             # required: stored with every record
   METRO_IMPORT_SOURCE_UPDATED_AT=2023-08-10          # optional: the publisher's date
   ```

4. Run `./gradlew importMetro`. It never runs at startup and there is no HTTP endpoint for it.

The import validates required files and columns, names, coordinates (inside India), line/trip/stop relations and
stop order; skips duplicates and bad records and prints statistics (stations, routes, trips, stop times, invalid
records with reasons, duplicates, non-station stops, interchange stations). It is **idempotent**: records are matched
by `(source, external_id)`, so re-running updates them, and records missing from a newer dataset are deactivated, not
deleted. Importing a newer dataset replaces the old one in one transaction.

Only `METRO_IMPORT_SOURCE_VERSION` is required in `.env` (plus the normal `POSTGRES_*` settings). The dataset path,
`METRO_IMPORT_SOURCE`, the cluster radius and the gap limit have working defaults. The service period is read from the
dataset's own `calendar.txt`; nothing about it is configured.

### Identity: stations, services and logical lines

* **Station** identity is the GTFS `stop_id` (the station's `external_id`) and a derived stable UUID, never the name.
  Two stops become one station only when the feed says so (`parent_station`), when the display names are identical, or
  when they differ only by a bracketed service note ("Sikanderpur" / "Sikanderpur (Rapid Metro)") and are within the
  cluster radius. Every such merge is logged as a warning in the import statistics. Stations with similar names are kept
  separate and logged; so are different stations at identical coordinates (the source data has one such pair).
* **Service** = one GTFS route (`metro_line`). Its identity is its id / `route_id`, never its name or colour. Two
  services may have the same name and colour.
* **Logical line** (`group_id`, `group_name`, `branch_name`) = services of the same colour that share trunk connections,
  e.g. Blue Line = Noida main line + Vaishali branch. A station is an **interchange** only when two or more *logical*
  lines serve it, so the Blue trunk is not 27 interchanges and a Blue-to-Blue branch change is not a transfer.
  Branch information stays visible internally (`branch_name`, service id) and the journey names it when it is certain.
* **Graph** (`metro_connection`): consecutive stations of real trips, per service. Journey stations are rebuilt by
  walking this graph from the boarding to the exit station on the services of the provider's line, keeping only paths
  whose length equals Google's stop count. A shared trunk therefore yields one station sequence whichever service runs on it;
  if two different sequences remained, nothing would be guessed and only boarding/exit would be listed.
* **Shapes** (`metro_shape`): `shapes.txt` geometry per service, drawn by the network layer when present (the map falls
  back to station connections for a service without a shape). Journey geometry stays Google's polyline.
* **Direction**: the dataset has no `trip_headsign` / `direction_id`, so no "towards" is derived from it; a ride shows
  "towards" only when Google reports a heading, otherwise "Direction unavailable".
* **Counts**: `stationCount` = stations listed for the journey, `travelledStops` = station-to-station segments
  (10 stations listed = 9 segments). The UI words them as such.
* **Service period**: `servicePeriodStart/End` and `operatingDays` come from `calendar.txt` for the services that have
  trips. The UI flags a period that has ended; the data is static and is never presented as a current timetable.

## Database (migrations `V5__metro_network.sql`, `V6__metro_services_graph_shapes.sql`)

`metro_dataset` (one row per source: version, publisher date, import time, statistics, service period and operating
days), `metro_line` (+ `group_id`, `group_name`, `branch_name`), `metro_station` (`geometry(Point, 4326)` with a GiST
index), `metro_station_line` (line, pattern, sequence, station), `metro_connection` (service, from, to, trip count) and
`metro_shape` (`geometry(LineString, 4326)` per service). Same PostgreSQL/PostGIS and Flyway as the rest of the
application. `backend/db-tools/metro-verify.sql` is a read-only script that checks the imported contents (counts,
duplicates, orphans, invalid coordinates and sequences, shapes).

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/metro/stations` | Imported stations with their lines. |
| `GET /api/metro/network` | Stations, lines and the ordered stations of each line, for the map layer. Cached in memory for 10 minutes (static data only). |
| `POST /api/metro/journey` | Same as `POST /api/routes` with `travelMode = METRO`. |
| `POST /api/routes` (`METRO`) | Each route carries a `metro` object next to the usual fields. |

Optional request fields prepare for departure/arrival time and preferences: `departureTime`, `arrivalTime`,
`transitPreference` (`LESS_WALKING`, `FEWER_TRANSFERS`). The UI sends none of them yet ("leave now").

## What a metro route contains

Ordered segments: first-mile **walk**, **metro** rides, **transfer** (interchange), last-mile **walk**. Walking
distances and durations are Google's. For each ride: line name and short name, direction ("towards", only when Google
reports one), boarding and exit station, stop count, duration and times when given. A station lists only the lines the
journey uses there (a Yellow Line ride through Sikanderpur does not list Rapid Metro), plus an `interchange` flag. The stations between boarding and exit are listed **only** when
they could be verified against the imported order of stations and Google's stop count; otherwise only boarding and
exit are shown. A station count is shown only when every ride reported one.

Google stops are matched to imported stations by name and by distance; an unmatched stop keeps Google's name and has no
line list. Metro stations are **not** Journey Stops or passing areas: Area Detection and Passing Area Search remain
purely geographic, and the Journey View shows the metro timeline separately ("Areas passed through" is its own
section).

## Map

A compact toggle (train icon, "Show metro network") shows the network: lines drawn from the dataset's `shapes.txt`
geometry (station-to-station connections only for a service without a shape) and stations by zoom (interchanges from zoom 11, all stations from 13,
names from 15). The calculated journey itself is Google's polyline. The stations of the selected journey are always
marked (boarding, interchange, exit and in-between differ by shape, not only colour); other lines are drawn lighter
while a journey is selected. A station opens a card with its name, lines, interchange status and its position on each
line. It does not claim platforms, gates, facilities or live status, because the data has none.

## Freshness and limitations

* The dataset's own calendar ends 2025-12-31 and has no Sunday service; RouteView shows that period and does not
  extend or invent it.
* The source places Bhikaji Cama Place and Sarojini Nagar at identical coordinates; both are kept and reported.
* The dataset is static and was last published on 2023-08-10; lines or stations opened since are missing from
  RouteView's network layer. Google's journey itself may know about them, in which case their stations appear
  without line details. Data older than a year is flagged in the timeline.
* The fare is Google's, and Google does not return a fare for every journey.
* Real Google behaviour (coverage of the subway preference, returned vehicle types, fare availability) must be checked
  with a real key; automated tests use mocked responses.
