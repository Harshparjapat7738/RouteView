# Area Detection Engine

Given a calculated route, the engine returns the **geographical areas** the route passes through, in travel order. It is the layer between route calculation and the Journey Stops UI.

```text
Route geometry (Google encoded polyline, kept in the Route)
      ↓  1 normalise      RouteGeometry + RouteGeometryNormalizer: valid SRID 4326 LineString (x = lon, y = lat)
PostGIS candidate query   2 candidates      ← 1 query per route, uses the GiST index
      ↓
AreaSelectionPolicy (plain Java, every candidate gets a SelectionVerdict)
      ├─ 3 relevance        per-type minimum interior crossing, border/graze protection, start/end rule
      ├─ 4 one stop per area id, one stop per place (duplicate records)
      ├─ 5 hierarchy        broad containers hidden where finer areas exist
      └─ 6 order            distance along the route of the first meaningful visit
      ↓
List<DetectedArea>  →  RouteDto.detectedAreas  →  Journey Stops
```

Only areas from RouteView's own `area` table are ever returned. Google Places is not used, and POIs/businesses cannot appear because the table has no such categories (see [`area-import.md`](area-import.md)).

## Code layout

| Class | Package | Role |
| --- | --- | --- |
| `AreaDetector` / `AreaDetectionService` | `area.detection` | Entry point `detectAreas(Route)`. Never throws: any failure gives an empty list. |
| `RouteAreaCandidateSource` / `JdbcRouteAreaCandidateSource` | `area.detection` / `area.repository` | The only code that runs the spatial SQL (`resources/area-detection/route-area-candidates.sql`). |
| `AreaSelectionPolicy` | `area.detection` | All decisions (relevance, hierarchy, de-duplication, order), one method per stage. `evaluate` returns a `SelectionResult` with a `SelectionVerdict` per candidate (accepted, endpoint, not crossed, below minimum, duplicate place, covered by finer area). No database, easy to unit-test. |
| `AreaDetectionProperties` | `area.detection` | Every tunable number (`routeview.area-detection.*`). |
| `DetectedArea` | `area.detection` | The result: provider-independent, no PostGIS types. |
| `RouteGeometry` / `RouteGeometryNormalizer` | `spatial` | Polyline → validated JTS line, SRID 4326; `LineString`/`MultiLineString` accepted, repeated points removed, bad input → `InvalidRouteGeometryException` with a reason (missing, wrong type, wrong SRID, coordinate out of range, too many vertices, no length). |
| `DetectedRoute` | `route.model` | A `Route` plus its own `detectedAreas`. |

`RouteService` calls `AreaDetector` once per route right after the routing provider answered. Spatial logic lives nowhere else: not in controllers, not in the frontend.

## Spatial query strategy

The SQL (heavily commented in the file) runs once per route:

1. **Index pre-filter:** `area.geometry && ST_Expand(route, tolerance)` uses the GiST index `area_geometry_gist`. The expansion in degrees is derived from the tolerance and the route's latitude, so the filter never misses an area that is within tolerance.
2. **Exact filter:** `ST_DWithin(area::geography, route::geography, tolerance_m)`: real metres, not degrees.
3. **Where the route is inside the area:** `ST_Intersection(route, area)` gives line pieces; their length (`ST_Length(::geography)`) is the distance travelled inside the area.
4. **Where along the route:** `ST_LineLocatePoint` gives each piece's position as a fraction of the route; `ST_LineSubstring` converts it to metres. Entry point = `ST_LineInterpolatePoint`.
5. **Grazing protection.** For each piece of route inside an area, the part further than `boundary-band-meters` (12 m) from the area's border is its *interior* length (`ST_Difference` with a buffer of the boundary). A piece counts as a *visit* only when its interior reaches the minimum visit length (`min-crossing-floor-meters`, 60 m). A road running along a shared border (both neighbours "contain" it), a clipped corner and a single-point touch therefore have interior 0 and are not crossings; and the position of an area is its first *meaningful* visit, not its first graze.
6. Also returned: the area's size (`sqrt(ST_Area(::geography))`), whether the route start/end is within tolerance of the area, and whether it is *inside* it (`ST_Covers`).

Rows are grouped per area (one row per area, however often the route crosses it) and come back in arbitrary order. All area geometry stays in the database; Java receives a handful of numbers per candidate. No area is loaded outside the bounding box of the route.

**Coordinates.** Everything is SRID 4326 (lon/lat). `RouteGeometry` stamps the route line with 4326, `JdbcRouteAreaCandidateSource` and `AreaDetectionService` refuse any other SRID before a query is run, the SQL re-stamps the transported WKB with 4326, and the `area.geometry` column is typed `geometry(MultiPolygon, 4326)`. Metres are only ever computed through `::geography`.

## Relevance and tolerance

A route can pass close to an area without going through it. An area counts as **passed through** when:

- the route runs **inside** it (interior length, see above) for at least `required` metres, where
  `required = min(typeCap, max(floor, areaSize × 0.25))`. `typeCap` comes from `minimum-intersection-by-area-type`: a city must really be crossed (500 m), a sector needs little (120 m), a district a lot (3000 m). Small areas need only a fraction of their own size, never less than the floor (60 m); or
- the route **start or end lies inside** the area, or within the tolerance of it while the route actually touches it (so the start and destination areas are represented even when the geocoded point is a few metres outside the boundary). An area that merely lies beside the start/end, without the route touching it, is not a stop.

Everything else is rejected with a verdict: `NOT_CROSSED` (close by, border-touching, border-hugging), `BELOW_MINIMUM_INTERSECTION` (inside, but not enough). The **spatial tolerance** (default 30 m) only widens the candidate search; it never lets a near-miss become a stop by itself, so tolerance does not need to be lowered to fight false positives.

The rule is deterministic and has no score: each threshold is a number you can read in `application.yml`.

| Property (`routeview.area-detection.`) | Default | Meaning |
| --- | --- | --- |
| `tolerance-meters` (`AREA_DETECTION_TOLERANCE_METERS`) | 30 | Candidate search distance and start/end association |
| `min-crossing-meters` (`AREA_DETECTION_MIN_CROSSING_METERS`) | 250 | Cap for types not listed below |
| `minimum-intersection-by-area-type` | CITY 500, TOWN 350, VILLAGE 200, LOCALITY 150, SUBURB 200, SECTOR 120, MUNICIPALITY 1500, DISTRICT 3000 | Per-type cap of the requirement |
| `min-crossing-floor-meters` (`AREA_DETECTION_MIN_CROSSING_FLOOR_METERS`) | 60 | Lowest requirement, and the minimum length of one visit |
| `min-crossing-fraction-of-size` | 0.25 | Requirement for small areas = size × this fraction |
| `boundary-band-meters` (`AREA_DETECTION_BOUNDARY_BAND_METERS`) | 12 | Route this close to an area's border is not "inside" |
| `hierarchy-filtering-enabled` | true | Hide broad containers where finer areas exist |
| `selectable-types` | all except `OTHER` | Types that may become stops |
| `container-types` | `MUNICIPALITY`, `DISTRICT` | Broad types (see hierarchy) |
| `type-priority` | `CITY, TOWN, VILLAGE, SECTOR, SUBURB, LOCALITY, MUNICIPALITY, DISTRICT` | Winner when duplicate records of one place overlap |
| `max-route-vertices` | 100000 | Largest accepted route geometry |

The defaults are a documented starting point, not tuned to a dataset. Adjust them only after looking at real routes. At `DEBUG` level the engine logs per route the number of candidates, journey areas and the count per verdict (never geometry or keys).

## Area-type filtering and hierarchy

- Only `selectable-types` are queried (`OTHER` is excluded). Restaurants, hotels, shops and the like cannot be stored as areas at all.
- **Same name, overlapping stretch.** "Faridabad" may exist as district, municipality and city, or one place may be imported twice. Candidates with the same normalised name (case, spacing, Unicode) whose stretches of the route overlap are one place: the type ranking first in `type-priority` wins (here: the city), then the longer crossing. Verdict `DUPLICATE_PLACE`.
- **Same name, different place.** Different area ids with the same name on *different* stretches are different places and stay separate stops.
- **Broad containers.** `DISTRICT` and `MUNICIPALITY` areas normally cover the whole route; listing them next to villages would be noise. A container is **removed whenever a finer selected area overlaps its stretch of the route**, and kept as a fallback where nothing finer exists (e.g. a rural stretch known only by its district).
- Finer types (village, locality, suburb, sector, town, city) are all kept, so a route through a city can show "Ballabhgarh → NIT → Sector 88". Nothing is deleted from the database; only the returned list is shaped.
- `parent_area_id` is **not** consulted: parents exist only where OpenStreetMap lists sub-areas, which is too sparse to base display decisions on. Type tiers and same-name collapsing carry the hierarchy rules.

## Deduplication

Identity is the **area id** (and, at import, `source + source_id`), never the name alone. One logical stop per area id per route: an area the route leaves and re-enters is reported once, at the position of its first *meaningful* visit (`distanceInsideAreaMeters` sums all visits); re-visits are not repeated as separate stops (deliberate; `A → B → A` is not shown). Duplicate records of one place are collapsed as described above.

## Route order

Each stop's position is the **distance along the route at which the route first reaches the area** (`distanceFromRouteStartMeters`), also given as a fraction `positionAlongRoute` (0 = start, 1 = end). Stops are sorted by it; ties go to the broader type, then to the area id (only to make the result deterministic). Not by name, id, latitude or longitude, and not by the order the database returns. `sequence` is 1-based in that order. An area containing the route start has position 0.

## Start and destination

Areas containing the start/destination (or touching the route right at it) are ordinary detected areas, accepted even if the route runs only briefly inside them (verdict `ACCEPTED_ROUTE_ENDPOINT`). If start and destination lie in the same area it is one stop at position 0. Because each area appears once, the start area is not duplicated, and RouteView never adds the typed start/destination names to the list.

## Route Session integration

The routing response now carries each route's own areas; the frontend `Route` has `detectedAreas`, so the session is:

```text
RouteSession
 ├── startLocation, destinationLocation
 ├── selectedRouteId
 ├── selectedAreaId        (new; always an area of the selected route, cleared when the route changes)
 └── routes[]  ├── route (distance, duration, encodedPolyline, path)
               └── detectedAreas[]
```

Areas are never merged across routes. Detection runs when routes are calculated (never on selection), so selecting routes or stops costs no API call and no database query: the "cache" is the session itself, no Redis.

## API

`POST /api/routes` (unchanged request). Each route in the response gains `detectedAreas`:

```json
{ "routes": [ {
    "id": "…", "index": 0, "distanceMeters": 28400, "durationSeconds": 2520, "summary": "NH19", "encodedPolyline": "…",
    "detectedAreas": [
      { "areaId": "…", "name": "…", "areaType": "VILLAGE", "sequence": 1,
        "positionAlongRoute": 0.0, "distanceFromStartMeters": 0, "latitude": 28.3354, "longitude": 77.4231 }
    ] } ] }
```

`latitude`/`longitude` is the point of the route where the area is first reached (used for the map highlight). No geometry or database internals are exposed. A route with no areas has `"detectedAreas": []` and is a normal result.

## Frontend

- `JourneyStops` (`features/route/components`) shows the **selected** route's stops as a timeline (name, type, distance from start); the other routes show a one-line `A → B → C` summary so they can be compared. Clicking a stop highlights it; clicking it again clears it.
- The highlight (`MapAreaHighlight`) is a marker at the stop's route position and pans the map to it (zooming in to at least level 12). The selected route stays selected, lines are not redrawn, and nothing calls Google Places or the API.
- `routeApi.ts` validates every area; a malformed or unknown entry is dropped without invalidating the route. Names are rendered as text.

## Error handling

Missing/malformed/out-of-range/zero-length/wrong-SRID geometry, wrong SRID, database failures, spatial-query failures and invalid candidate rows all end in an empty or smaller `detectedAreas` for that route, a log line with the exception *class* only, and a normal route response. Route calculation never fails because of area detection.

## Verifying it

Automated: `AreaSelectionPolicyTest`, `AreaSelectionAccuracyTest` (relevance per type, ordering, duplicates, hierarchy, start/end, per-route), `AreaDetectionServiceTest`, `RouteGeometryTest`, `RouteGeometryNormalizerTest` (no database), and `AreaDetectionDatabaseTest` against real PostGIS (adds crossed / nearby-outside / boundary-only / border-hugging / graze / start-inside cases) (`ROUTEVIEW_DB_TESTS=true gradlew test`, rolls back).

On real data, after `gradlew importAreas` for your region, calculate a route in the app and compare **Journey Stops** with the map. To inspect the same candidates in SQL, open `route-area-candidates.sql` and run it with a route's WKB; or check one area:

```sql
SELECT name, area_type FROM area
WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint(77.4231, 28.3354), 4326)); -- which areas contain a point
```

## Known limitations

- Quality is bounded by the imported data. OSM boundaries differ by country and are sometimes incomplete; villages that exist only as points are not imported, so they cannot be detected.
- Ordering is by **first entry**. A city polygon is listed where the route enters the city, i.e. *before* the sectors/localities inside it, even when the destination is deep inside.
- A route that doubles back along the same road can be located at the wrong visit (`ST_LineLocatePoint` returns the nearest point on the line).
- Two different places with the same name whose stretches of the route overlap (adjacent villages sharing a name) are treated as duplicate records and become one stop.
- Parent/child links are not used (see above); thresholds are untuned defaults.
- The border band makes a very narrow area (under about 2 × 12 m + visit length across) uncrossable except as start/destination area.
- One query per route; with the usual 1–3 alternatives that is fine, many routes are processed one after another.
- A single malformed area geometry that makes `ST_Intersection` throw makes the query fail for that route (empty result, logged). The table's check constraint keeps stored geometry valid, so this should not happen.

## Data quality and the index

`backend/db-tools/area-quality-report.sql` is a read-only report (type overview, extreme sizes, probable duplicate records, parent link sanity, spatial index check) to run after an import; see [`database.md`](database.md). Import-time validation additionally rejects polygons under 500 m² and over 150,000 km² (`AREA_TOO_SMALL` / `AREA_TOO_LARGE`) and keeps rejecting invalid, empty, unnamed and out-of-range ones; one bad record never stops the import. The GiST index `area_geometry_gist` is used by the candidate query (confirmed with `EXPLAIN`: bitmap index scan on `area_geometry_gist`); no other index was added.
