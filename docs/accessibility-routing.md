# Accessibility-aware routing

Two optional switches in the Preferences panel (both **off** by default), plus per-route indicators. They use only what the
Metro and Bus datasets explicitly state about stations and stops. Nothing is scraped, estimated or assumed.

## What the data actually contains (inspected)

| Source | Finding |
|---|---|
| Delhi Metro GTFS (`stops.txt`) | columns `stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon`: **no `wheelchair_boarding`**, no `parent_station`, `stop_desc` empty for all 262 stops |
| Delhi Metro GTFS (`trips.txt`) | has `wheelchair_accessible`, **0 ("no information") on all 5,438 trips**; also not read by the importer; it is a vehicle statement, not a station one |
| Delhi Metro GTFS (other files) | no `pathways.txt`, `levels.txt` (no lift / step-free connection data) |
| Delhi Bus GTFS | `stops.txt` has `stop_code, stop_id, stop_lat, stop_lon, stop_name, zone_id`; `trips.txt` has no wheelchair column; no pathways / levels |
| Google Routes (transit) | RouteView's field mask requests no accessibility fields and the transit details used (stops, lines, times, fare) carry none |
| Existing station metadata | none; the importers read no accessibility field before this change |

**Consequence: with the current datasets every Metro station and Bus stop is *Unknown*.** The feature is built so that a dataset
that does state wheelchair access is used correctly the day it is imported; until then it reports, truthfully, that nothing is known.

## Data model

`Accessible | Inaccessible | Unknown`, plus `source` (the dataset) and `sourceVersion` (its version, the freshness the repo has).

* GTFS `stops.txt` `wheelchair_boarding`: `1` → Accessible, `2` → Inaccessible, `0`, empty, missing column or any other value → **Unknown**.
* A stop with no statement of its own takes its parent station's (the GTFS rule); its own statement wins.
* A Metro station made of several stops is Accessible/Inaccessible only if **every** stop says so; a mix or a gap is Unknown.
* Metro: stored in `metro_station.metadata` (`wheelchairBoarding`, only when stated). Bus: `bus_stop.wheelchair_boarding` (new nullable
  column, migration `V9__wheelchair_boarding.sql`; NULL = unknown). Imports are idempotent; a re-import of an updated dataset updates the value.
* The journey responses carry `accessibility {status, source, sourceVersion}` on every Metro station and Bus stop; a station that the
  routing provider named but that did not match the dataset has no statement (Unknown).
* The frontend parser accepts only the two explicit statuses; anything else is Unknown.

Code: `backend/.../common/accessibility/Accessibility.java`, `MetroGtfsImporter`, `BusGtfsImporter`, `MetroStation`, `BusStop`,
`MetroJourneyBuilder`, `BusJourneyBuilder`; `frontend/src/features/accessibility/`, `features/preferences/`.

## Which stations count

Per route: where the rider boards, where they leave and where they change (Metro: ride boarding/exit and transfer stations; Bus:
ride boarding/exit and transfer stop), each once. Stations the rider only passes are ignored. Routes without station data
(cars, walking, cycling, Google Train) are "not applicable": nothing is claimed.

A route is then **ALL_LISTED** (every one Accessible), **HAS_INACCESSIBLE** (any one Inaccessible), **PARTIAL** or **UNKNOWN**.

## Selection

* **Prefer step-free stations** (ranking, hides nothing): ALL_LISTED first, then PARTIAL, then UNKNOWN / not applicable, then HAS_INACCESSIBLE.
  It is the first sort key; the other preferences (including less walking) order routes inside each group. Equal groups = no reordering.
* **Avoid inaccessible stations** (filtering): hides routes with a station listed as not accessible, **only when another route remains**.
  If every route has one, all stay and the panel and list say so. Unknown stations are not "inaccessible", so they are never hidden.
* **Less walking** is the existing ranking preference (under "Rank routes by"). It reduces walking distance and says nothing about
  step-free access; the Accessibility section says so.
* Selection only uses the alternatives the routing engines returned; routing, transfers and station relationships are not changed.
  The travel-mode filter still applies first.
* Nothing satisfied? It is said ("No route could be verified as step-free…", "Every route uses a station listed as not accessible…",
  "…accessibility is unknown for N routes, so none could be ruled out") and the routes stay visible.

## What is claimed, and what is not

Claimed (always with its source on the Journey View): "listed as accessible / not accessible / unknown" for the boarding, leaving and
changing stations. **Never claimed**: that a journey is wheelchair accessible. Lifts, step-free connections inside stations, vehicles,
and the walk to the station are not in any dataset and are stated as "not verified" wherever stations are described as accessible.
GTFS `wheelchair_boarding = 1` means "some vehicles at this stop can be boarded in a wheelchair"; it is the dataset's statement,
shown as such.

## UI

* Preferences panel: an "Accessibility" section (two switches, hints, the "unknown is never accessible" note).
* Route card: one compact note. Shown when an accessibility preference is on (for every route, including "unknown"), and **always**
  when a station is listed as not accessible (a warning needs no setting). Text, not colour alone.
* Journey View: an "Accessibility" block listing each boarding / leaving / changing station, its status and source + dataset version,
  and the caveat that the data is static and may be out of date.
* The route list's note lines and the entry row summarise what the switches did.

## Storage

Same key and version as the other preferences (`routeview.preferences`, version 1); `accessibility: {stepFree, avoidInaccessible}` is
written only when something is on. Data from before this feature stays valid and means "off". Only a literal `true` turns a switch on.

## Tests

* Backend (importers, journeys): accessible / inaccessible / unknown / `0` / junk values, mixed stops, parent inheritance, dataset with
  no column, status + source + version carried into Metro and Bus journeys, unmatched provider stations.
* Frontend unit: parsing, route assessment (transfers, missing metadata, intermediate stations, Bus and Metro, no-data routes),
  ranking, hiding, nothing-matches cases, interplay with less walking and the mode filter, storage, wording.
* Browser: panel, indicators, ordering, hiding, Journey View, reload, reset, no data, all-inaccessible, Bus, car mode, phone widths.

## Limitations

* No real dataset states accessibility today, so in practice every station is Unknown and the app says so. The pipeline has been
  verified with synthetic feeds only, **not against a real accessible-station dataset or a running PostgreSQL** (migration `V9` and
  the changed SQL were not executed here).
* Metro station accessibility is attached only to stations matched to the imported dataset (by name and distance, the existing matcher).
* Selection can only choose among the alternatives the routing engines return; it does not ask them to avoid a station.
* "Freshness" is the dataset's source version; there is no per-station update date.
* Vehicles (GTFS trip `wheelchair_accessible`), pathways and levels are not read.
