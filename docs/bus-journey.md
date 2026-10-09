# Delhi Bus Journey Engine

Plans `Start → Destination` journeys by bus from the imported Delhi GTFS data (see `bus.md` for the import): walking → bus → walking, or walking → bus → transfer → bus → walking. It runs inside the backend; no routing provider is asked.

## Using it

- `POST /api/routes` with `travelMode: "BUS"` (the normal route endpoint; Route Session, area detection and error handling are unchanged) or `POST /api/bus/journey` (same request and response). Each route carries a `bus` field. Optional `departureTime`; `arrivalTime` is rejected.
- `GET /api/bus/stops/nearby?latitude&longitude[&at]` returns at most 8 bus stops that have service, for map hints. There is no import endpoint (import is the `importBus` command).
- No raw GTFS rows are exposed. Ids are RouteView's stable UUIDs plus the GTFS ids as references.

## The model

| | |
|---|---|
| route | what the rider sits on (`route_id`, number/name). Two routes with the same name are never merged |
| trip | one scheduled run (`trip_id`) |
| direction / headsign | separate from the route; the headsign is the trip's own, else the last stop (marked `TERMINAL_STOP`) |
| pattern | derived: trips of one route with the same ordered stop list. Built at import, in SQL, from `stop_times` ordered by `stop_sequence` |

Stop order always comes from `stop_sequence`; it is never rebuilt from names or coordinates.

## Algorithm

1. **Nearby stops** (PostGIS): a GiST-indexed `ST_DWithin` + KNN `<->` query, 600 m then 1 500 m, at most 60 candidates, at most 8 chosen. A stop must be served by a pattern that runs that day; the score is walking time minus a small bonus for connectivity, so a closer dead-end stop does not beat a well-served one.
2. **Pattern graph**: stops, routes and patterns (about 99 k pattern stops for 3.7 M stop times) are cached in memory for 10 minutes. `stop_times` is never loaded.
3. **Search**: a round-based (RAPTOR-style) search over patterns: round k = journeys with k bus legs (max 3). Cost = scheduled ride time + expected wait (half the headway, 2–15 min) + a boarding penalty + weighted walking. A rider cannot board the route they just left (that would be the same bus, not a transfer); footpaths of at most 300 m connect nearby stops between rounds. Alternatives come from banning the first-leg route.
4. **Real trips**: the winners are resolved against the timetable with indexed queries, one candidate query and one stop-list query per leg: the first trip leaving at or after the rider's ready time (including past-midnight trips of the previous service day). A wait over 90 minutes drops the journey.
5. **Assembly**: segments, stops, counts, geometry and notices (`BusJourneyBuilder`).

## Counts

- `transfers` = changes of route. Bus A → Bus A is one ride, not a transfer.
- `listedStopCount` = distinct stops shown along the journey (boarding, intermediate, exit). A transfer at the same stop lists it once; a transfer between two distinct stops lists both.
- Per ride, `listedStopCount` is the stops shown for that ride and `stopToStopSegments` the hops between them (`listed − 1`). They are never mixed.

## Geometry

`shapes.txt` is used when it exists and is valid: it is sliced between the boarding and exit stops, and rejected if a stop is more than 300 m from it or the order is wrong. The current Delhi feed has no `shapes.txt`, so rides are drawn along the ordered stops (`geometrySource: STOP_SEQUENCE`), walking as straight lines (a straight-line estimate, flagged `estimated`). Nothing is drawn as a straight line when a valid shape exists.

## Fares and time

- No fare file is ingested, so every journey says `fareStatus: UNAVAILABLE` (`fare: null`). A fare is never guessed.
- Times come from the static GTFS schedule (`timetableBasis: STATIC_SCHEDULE`) in `Asia/Kolkata`; the journey says so and nothing is presented as a live arrival. If the dataset has no calendar, every trip is assumed to run and a notice says so.

## Bus stops are not Journey Stops

Bus stops are returned in `bus.stops` and the map only. They are never Journey Stops or Passing Areas; area detection still runs on the journey's polyline exactly as for other modes.

## Failure reasons

`NO_BUS_DATA`, `NO_STOP_NEAR_START`, `NO_STOP_NEAR_DESTINATION`, `NO_SERVICE`, `NO_JOURNEY`: all return an empty route list (the app shows a "no bus route" message).

## Performance (real Delhi feed, local PostgreSQL 16 / PostGIS 3.4)

Cached graph load about 1 s; a journey takes roughly 0.3–0.5 s with 15–33 bounded SQL queries (more transfers/legs add queries, never more per stop); the candidate-trip query is index driven (about 6 ms, 0.4 ms prepared). No query reads a whole table; the graph traversal is bounded by 3 rounds.

## Configuration

`routeview.bus-journey.time-zone` (default `Asia/Kolkata`) and `max-alternatives` (default 3, max 5).

## Database

`V8__bus_patterns.sql` adds `bus_pattern`, `bus_pattern_stop` and `bus_trip.pattern_id`. They are rebuilt at the end of every import in the same transaction. `backend/db-tools/bus-verify.sql` checks them.

## Limits

- Static schedule only: no delays, no live positions, no service alerts.
- Walking is a straight-line estimate, not a pedestrian route.
- No fare. No shapes in the current feed.
- At most 3 bus legs; a rider cannot board a route they just left.

## Frontend and map (Bus mode)

- **Selector**: Bus is the seventh travel mode (SVG bus icon, caption "Bus"). Other modes are unchanged. Bus requests go to `POST /api/bus/journey`; the answer carries `emptyReason` when there is no route, so the app can say why (no data, no stop near start or destination, no service at that time, no journey).
- **Route cards**: route-number pills for the whole chain, duration, transfers, riding stops, walking time, boarding and exit stop, direction ("Towards ..."), and the schedule window labelled "not live". Fare is shown only when the backend sends one; otherwise "Fare unavailable". Nothing is invented.
- **Journey View / bottom sheet**: Walk -> Bus -> Change -> Bus -> Walk -> Destination timeline, each step visually distinct, with an expandable "N stops on the way" list. On mobile the existing bottom sheet shows the compact summary first and expands to the full stop sequence.
- **Map**: the selected journey is drawn dominant (white casing + route colour for bus rides, dashed line for walking); other routes are secondary. Stop markers (Board / Change / Exit) appear from zoom 14; the optional "Bus stops" layer fetches `GET /api/bus/stops/in-view` only when zoomed in (window <= 0.04 degrees, max 150 stops) and mutes itself while a journey is selected. Bus stops are never Passing Areas.
- **Sync**: the list card, Journey View, map and selected stop all read the same route session; selecting never recalculates.
- **Limits**: the Delhi feed has no shapes, so ride geometry follows the stop sequence and walks are straight-line estimates. Times come from the static timetable.
