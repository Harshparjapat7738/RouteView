# Area data import

RouteView answers "which geographical areas does this route pass through?", so it needs real area boundaries in PostgreSQL/PostGIS. This document describes the import that fills the `area` table. After import, the Area Detection Engine matches each calculated route's geometry to these stored boundaries and returns the areas it genuinely crosses in travel order; see [`area-detection.md`](area-detection.md).

```text
OpenStreetMap (Overpass API or a saved file)
        ↓  OpenStreetMapAreaDataProvider (implements AreaDataProvider)
NormalizedArea  (source, externalId, name, areaType, geometry, metadata)
        ↓  AreaGeometryNormalizer (validate / repair / reject)
        ↓  AreaImportService (batches, de-duplication, statistics, parent links)
PostgreSQL + PostGIS  (table `area`, SRID 4326)
```

## Data source and licence

The initial source is **OpenStreetMap**, read through the Overpass API. OSM data is © OpenStreetMap contributors and available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright): keep that attribution wherever the data or results derived from it are shown. The public Overpass server is shared infrastructure: import small regions, not repeatedly, or run your own Overpass instance (`AREA_IMPORT_OVERPASS_URL`).

Only `area/ingest/osm/` knows about OSM. The rest of the application sees `NormalizedArea`. A different source means a new `AreaDataProvider` implementation (and a new `source` name); the importer, validation and database stay unchanged.

## What is imported (and what never is)

Only named geographical areas **that have a boundary**. The mapping lives in one class, `OsmAreaTypeMapper`, and is applied in this order:

| # | OSM tags | Result |
| --- | --- | --- |
| 1 | any of `amenity`, `shop`, `tourism`, `building`, `highway`, `railway`, `public_transport`, `healthcare`, `office`, `craft`, `leisure`, `aeroway`, `historic`, `man_made` | **Skipped**: never an area (restaurants, hotels, hospitals, petrol pumps, shops, malls, schools, banks, ATMs, parking, attractions, buildings, roads, bus stops, railway stations, businesses) |
| 2 | `place=city` | `CITY` |
| | `place=town` | `TOWN` |
| | `place=village` | `VILLAGE` |
| | `place=hamlet`, `neighbourhood`, `locality` | `LOCALITY` |
| | `place=suburb`, `quarter`, `borough` | `SUBURB` |
| | `place=suburb/quarter/borough/neighbourhood/locality/hamlet` **and** name matches `Sector <number>[letter]` | `SECTOR` |
| | any other `place` (state, island, square, farm, ...) | Skipped |
| 3 | no `place`, `boundary=administrative`, `admin_level=6` | `DISTRICT` |
| | `admin_level=7` or `8` | `MUNICIPALITY` |
| | `admin_level=9` or `10` | `LOCALITY` |
| | other levels (country, state, division, or finer than 10) | Skipped |
| 4 | anything else | Skipped |

`place` wins over `admin_level` (a city boundary tagged `place=city` and `admin_level=8` is a `CITY`). The Overpass query is generated from the same table, so it only requests named relations/closed ways with these tags and levels; it never asks for POIs, buildings or roads. Admin levels differ between countries; the defaults follow common (Indian) usage. To adapt them, change `ADMIN_LEVEL_TYPES` in `OsmAreaTypeMapper` (the query and the rules follow).

Supported `AreaType`s: `VILLAGE`, `LOCALITY`, `SUBURB`, `SECTOR`, `TOWN`, `CITY`, `MUNICIPALITY`, `DISTRICT` (and `OTHER`, which no rule produces yet).

## Geometry and SRID

Everything is stored as `geometry(MultiPolygon, 4326)` (WGS 84 longitude/latitude, see [database.md](database.md)). For OSM relations the importer joins the way fragments into closed rings, makes outer rings polygons and puts each inner ring into the smallest outer ring containing it. Then every geometry goes through `AreaGeometryNormalizer`:

| Situation | Result |
| --- | --- |
| missing / empty geometry | rejected (`NULL_GEOMETRY`, `EMPTY_GEOMETRY`) |
| not a polygon or multipolygon | rejected (`UNSUPPORTED_GEOMETRY`) |
| coordinates outside lon/lat range | rejected (`COORDINATES_OUT_OF_RANGE`) |
| boundary ring not closed / members without geometry | rejected (`INCOMPLETE_BOUNDARY`) |
| polygon under 500 m² (sliver) / over 150,000 km² (state, country, broken data) | rejected (`AREA_TOO_SMALL`, `AREA_TOO_LARGE`) |
| invalid (bow-tie, self-intersection, ...) | repaired with JTS `GeometryFixer`, counted as an invalid geometry; rejected (`INVALID_GEOMETRY`) if it cannot be repaired |
| valid | polygon promoted to `MultiPolygon`, rings normalised (so re-imports are byte-identical), SRID 4326 |

The database is the last line of defence: a check constraint refuses invalid or empty geometry. One bad record never stops the import: a rejected record is logged with its id, reason and detail, and the import continues. A batch the database refuses is retried record by record to find the offender.

## Duplicates and idempotency

An area is identified by **`source` + `externalId`** (for OSM `relation/<id>` or `way/<id>`; OSM ids are only unique per element type), enforced by a unique index. Names are never used for identity: "Sector 88" exists in many cities. The import uses `INSERT ... ON CONFLICT (source, source_id) DO UPDATE ... WHERE <something changed>`:

- new area: inserted
- known area with different name, type, geometry or metadata: updated
- known identical area: left untouched (`unchanged`)
- the same id twice in one source stream: counted as a duplicate and processed once

Running the same import again and again therefore creates no duplicates and nothing is deleted. Areas that disappeared from OSM stay in the database (the importer never deletes).

## Hierarchy

OSM does not state parents on the child. The importer only uses what the source says explicitly: a relation that lists another relation as a member with role `subarea` is that relation's parent. A link is stored (`area.parent_area_id`) only if exactly one parent claims the child, both areas were imported in this run and the links form no cycle. Otherwise the parent stays `NULL`: parents are never guessed from geometry or names. The statistics report links set, ambiguous (several parents or a cycle) and parent-not-imported.

## Running an import

The import is an explicit command. Starting the backend (`bootRun`) never imports anything and there is no HTTP endpoint for it.

1. Start the database and set `POSTGRES_PASSWORD` as described in [database.md](database.md).
2. Configure the region in `backend/.env` (never in source code):

   ```bash
   # south,west,north,east in degrees (WGS 84)
   AREA_IMPORT_REGION=28.30,77.20,28.50,77.45
   ```

   Use the bounding box of the region you need (for example from the OSM map's "Export" box). The region must not be wider or taller than `AREA_IMPORT_MAX_SPAN_DEGREES` (default 1.0, roughly 110 km): a guard against importing a huge area by mistake.
3. Run, from `backend/`:

   ```bash
   ./gradlew importAreas        # Windows: gradlew.bat importAreas
   ```

   The command starts the application without a web server, imports, prints the statistics and exits. It needs network access to the Overpass server and can take a while for a large region.

To import from a saved file instead (reproducible, offline, no load on the public server), save the Overpass answer once and point the importer at it:

```bash
# query.txt: the query printed in the import log at DEBUG level, or build it with the bounding box:
# [out:xml][timeout:180];
# ( relation["boundary"="administrative"]["admin_level"~"^(10|6|7|8|9)$"]["name"](S,W,N,E);
#   relation["place"~"^(borough|city|hamlet|locality|neighbourhood|quarter|suburb|town|village)$"]["name"](S,W,N,E);
#   way["place"~"^(borough|city|hamlet|locality|neighbourhood|quarter|suburb|town|village)$"]["name"](S,W,N,E); );
# out geom;
curl --data-urlencode data@query.txt https://overpass-api.de/api/interpreter -o region.osm
```

then set `AREA_IMPORT_SOURCE_FILE=/path/to/region.osm` and run `importAreas` again (the region setting is then not needed). Do not commit region extracts to Git; keep them outside the repository or in an ignored folder.

| Variable | Meaning | Default |
| --- | --- | --- |
| `AREA_IMPORT_REGION` | `south,west,north,east` bounding box | none (required unless a file is used) |
| `AREA_IMPORT_SOURCE_FILE` | saved Overpass XML file to import instead of calling Overpass | none |
| `AREA_IMPORT_OVERPASS_URL` | Overpass endpoint (https) | `https://overpass-api.de/api/interpreter` |
| `AREA_IMPORT_BATCH_SIZE` | areas per database transaction (max 1000) | 200 |
| `AREA_IMPORT_MAX_SPAN_DEGREES` | largest allowed region width/height | 1.0 |

The response is read as a stream, one element at a time, and stored in batches, so memory does not grow with the size of the region.

## Quality rules added in Step 17

- **Names** are cleaned by `AreaNameNormalizer` only: Unicode NFC, invisible/control characters removed, whitespace collapsed and trimmed. Case, spelling, abbreviations, scripts and punctuation stay as the source states them; nothing is translated or merged. Same name does not mean same area: identity is `source + externalId`.
- **Excluded features** (never areas, even with a name or `place` tag): `amenity`, `shop`, `tourism`, `building`, `highway`, `railway`, `public_transport`, `healthcare`, `office`, `craft`, `leisure`, `aeroway`, `historic`, `man_made`, `bridge`, `emergency`, `barrier`, `waterway`, `military`, `power`. Unknown `place` values and admin levels are skipped explicitly (`UNMAPPED_PLACE`, `UNMAPPED_ADMIN_LEVEL`), never guessed.
- **Size sanity** is configurable: `AREA_IMPORT_MIN_AREA_SQUARE_METERS` (500) and `AREA_IMPORT_MAX_AREA_SQUARE_KILOMETERS` (150000). Only slivers and state/country-sized or broken polygons are rejected; small real villages, sectors and localities are kept. Large districts are kept too: whether they are useful journey stops is decided by the detection layer, not by the import.
- **Hierarchy** comes only from sub-area relations the source states; ambiguous, missing or circular claims leave `parent_area_id` null. A link that would close a cycle with parents stored by an earlier import is skipped by the SQL and the database trigger would reject it anyway.
- **Transactions**: areas are stored in batches (`AREA_IMPORT_BATCH_SIZE`, default 200, max 1000), one transaction per batch; a batch the database refuses is retried record by record, so a bad record is rejected alone and earlier batches stay committed. There is no single unbounded transaction.
- **Coverage**: a bounding box (`AREA_IMPORT_REGION`, limited by `AREA_IMPORT_MAX_SPAN_DEGREES`) or a saved Overpass file; nothing is hardcoded and no dataset is committed to Git. Import several regions one after another; re-importing is idempotent.
- The statistics now include the valid areas **by type** of the run.

## Statistics

At the end the import logs, for example:

```text
Area import finished
  Total records processed : 16
  Valid geographical areas: 9
    inserted              : 9
    updated               : 0
    unchanged             : 0
  Skipped (not an area)   : 4 {EXCLUDED_FEATURE=2, UNMAPPED_ADMIN_LEVEL=1, UNMAPPED_TAGS=1}
  Rejected                : 2 {NO_NAME=1, INCOMPLETE_BOUNDARY=1}
  Invalid geometries      : 1 (repaired: 1)
  Duplicates in source    : 1
  Parent links            : set 1, ambiguous 1, parent not imported 0
```

(That output is from the unit-test fixture, not real data.) Only names, ids and reasons are logged, never credentials.

## Verifying imported data

```sql
-- how many areas of which type
SELECT area_type, count(*) FROM area GROUP BY area_type ORDER BY 2 DESC;

-- all stored geometries are valid multipolygons in SRID 4326 (expect 0, 0)
SELECT count(*) FILTER (WHERE NOT ST_IsValid(geometry)) AS invalid,
       count(*) FILTER (WHERE ST_SRID(geometry) <> 4326 OR GeometryType(geometry) <> 'MULTIPOLYGON') AS wrong_type
FROM area;

-- look at some areas, with their parent
SELECT a.source_id, a.name, a.area_type, p.name AS parent, round(ST_Area(a.geometry)::numeric, 5) AS area_deg2
FROM area a LEFT JOIN area p ON p.id = a.parent_area_id
ORDER BY a.name LIMIT 20;

-- the spatial index exists
SELECT indexname FROM pg_indexes WHERE tablename = 'area' AND indexdef ILIKE '%gist%';

-- nothing is a duplicate (expect no rows)
SELECT source, source_id, count(*) FROM area GROUP BY 1, 2 HAVING count(*) > 1;
```

Run the import a second time: the statistics must show `inserted 0, updated 0` and the same row count. Also compare a few areas with openstreetmap.org (search by the OSM id in `source_id`). In QGIS or any PostGIS viewer, display `area.geometry` to see the boundaries.

## Limitations

- **Point-only places are not imported.** Many villages are mapped in OSM as a single point (`place=village` node) with no boundary. The `area` table needs a boundary, so these are not imported; only villages mapped as closed ways or boundary relations are. This matters for rural regions and is the main gap to close next (for example by storing a centre point for boundary-less areas).
- Admin-level meaning varies by country (see above); check the mapping for a new country. The "Sector N" rule is a name heuristic.
- Parents exist only where OSM declares `subarea` members and both areas are in the imported set; states and countries are not imported, so top-level areas have no parent.
- OSM boundaries can be incomplete or inconsistent; invalid ones are repaired or rejected and reported, never silently stored.
- Names are stored exactly as the OSM `name` tag (usually the local language); `name:en` is kept in `metadata` when present.
- Areas removed from OSM are not deleted by a re-import.
- Overpass limits apply (timeouts, fair use). A very large region should be imported in several smaller regions.
