# Database: PostgreSQL + PostGIS

RouteView stores geographical areas in PostgreSQL with the PostGIS extension. This is the spatial foundation only: the table, the spatial index, the entity and the repository. Areas are loaded by the explicit import ([`area-import.md`](area-import.md)) and read by the Area Detection Engine ([`area-detection.md`](area-detection.md)), whose one spatial query uses the GiST index.

| Item | Choice |
| --- | --- |
| Database | PostgreSQL 16 (development image `postgis/postgis:16-3.4`) |
| Spatial extension | PostGIS 3.4 |
| Access | Spring Data JPA / Hibernate 7 with Hibernate Spatial (JTS geometry types), PostgreSQL JDBC driver |
| Migrations | Flyway (`backend/src/main/resources/db/migration`), the only thing that changes the schema |
| Coordinate system | SRID 4326 |

## Local development

```bash
cd backend
cp .env.example .env        # then set POSTGRES_PASSWORD (there is no default)
docker compose up -d        # start PostgreSQL + PostGIS (data lives in the routeview-pgdata volume)
docker compose ps           # wait until the database is "healthy"
./gradlew bootRun           # Flyway applies the migrations on startup (gradlew.bat on Windows)
docker compose stop         # stop, data is kept
docker compose down         # remove the container, data is kept
docker compose down -v      # remove the container AND delete all data
```

The database is published on `127.0.0.1` only. `.env` is git-ignored; only `.env.example` (placeholders) is committed. The application needs the database at startup: without `POSTGRES_PASSWORD` it refuses to start, and without a reachable database startup fails (the frontend and Google Maps do not depend on it).

| Variable | Used by | Meaning |
| --- | --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER` | compose, backend | Database and user (default `routeview`) |
| `POSTGRES_PASSWORD` | compose, backend | **Required**, no default |
| `POSTGRES_HOST`, `POSTGRES_PORT` | backend (port also by compose) | Where the backend connects (default `localhost:5432`); compose publishes `POSTGRES_PORT` on localhost |
| `POSTGIS_IMAGE` | compose | Optional image override |

Database credentials exist only in the backend; the frontend never receives them.

## Migrations

| Version | Purpose |
| --- | --- |
| `V1__enable_postgis.sql` | `CREATE EXTENSION IF NOT EXISTS postgis` and a check that `postgis_version()` works, so a database without PostGIS fails the migration instead of failing later |
| `V2__create_area.sql` | The `area` table, constraints and indexes |
| `V3__area_import_metadata.sql` | `metadata jsonb` column for descriptive source data, written by the area importer |
| `V4__area_data_quality.sql` | Constraints `area_source_id_not_blank` and `area_name_trimmed` (added `NOT VALID`: existing rows are untouched, every new/changed row must comply) and the trigger `area_parent_no_cycle` that rejects parent cycles (A → B → A). Changes no data and no geometry |

Creating the extension needs a privileged role. The development image runs Flyway as the owner/superuser. On a managed PostgreSQL the administrator creates the extension once (`CREATE EXTENSION postgis;`) and V1 then does nothing. Hibernate never creates or changes tables (`ddl-auto: none`). Never edit an applied migration: add a new `V3__...` instead.

## Schema: `area`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | generated |
| `name` | `varchar(255)` | not blank |
| `area_type` | `varchar(32)` | name of an `AreaType` constant; the database only enforces the format (`^[A-Z][A-Z_]*$`) |
| `geometry` | `geometry(MultiPolygon, 4326)` | boundary; must be valid and non-empty |
| `center_point` | `geometry(Point, 4326)` | optional representative point |
| `parent_area_id` | `uuid` FK to `area` | optional containing area, not its own parent, `ON DELETE SET NULL` |
| `source`, `source_id` | `varchar` | where the area came from and its identifier there; `(source, source_id)` is unique when `source_id` is set |
| `metadata` | `jsonb` | descriptive data of the source object (OSM: place, boundary, admin_level, name:en, wikidata); informational |
| `created_at`, `updated_at` | `timestamptz` | |

Indexes: GiST on `geometry` (what route/area intersection will use), plus `parent_area_id`, `area_type` and `lower(name)`. The detection query pattern is `area.geometry && ST_Expand(route, tolerance)` (index scan on `area_geometry_gist`) followed by `ST_DWithin(::geography)` as exact filter, so no additional spatial index is needed and none was added in Step 15 (no migration). `backend/db-tools/area-quality-report.sql` is a read-only data-quality report for the table. The table has no category for restaurants, hotels, hospitals, petrol pumps or any other POI, on purpose.

Polygon boundaries from any source are stored as `MultiPolygon` (`ST_Multi`) so one column type fits both. If a later data source provides only a point for some areas, relaxing this is a new migration.

## Why SRID 4326

SRID 4326 is WGS 84 longitude/latitude in degrees. Google Routes polylines, GPS positions and OpenStreetMap data are all in it, so a route geometry and an area boundary can be compared directly without reprojection. The column is declared with the SRID, so PostgreSQL rejects geometries with another SRID, and the Java side (`SpatialReference.WGS84_SRID`) checks it as well. Degrees are not metres: when a query needs real distances or areas, cast to `geography` in that query rather than storing a second coordinate system.

The table is filled by the explicit area import, see [area-import.md](area-import.md).

## Code layout

```text
area/model/Area, AreaType      entity and the single list of area types
area/repository/AreaRepository the only place for area queries (future PostGIS queries go here as native queries)
area/service/AreaService       boundary for other modules; performs no area detection
area/ingest/                   area import: AreaDataProvider, NormalizedArea, AreaGeometryNormalizer, AreaImportService (see area-import.md)
area/repository/JdbcAreaImportStore  PostGIS upsert used by the import
area/repository/JdbcRouteAreaCandidateSource  the route/area spatial query (area-detection.md)
area/detection/                Area Detection Engine: AreaDetectionService, AreaSelectionPolicy, DetectedArea
spatial/SpatialReference       SRID constant and the JTS GeometryFactory
```

The model does not depend on Google or on any area-data provider. Google route classes never reach this module.

## Tests

`AreaDatabaseFoundationTest` checks PostGIS, the migrations, the SRID and a save/read round trip. It is skipped unless `ROUTEVIEW_DB_TESTS=true`, so `gradlew build` works without a database. To run it: start the database, set `POSTGRES_PASSWORD` and `ROUTEVIEW_DB_TESTS=true`, then `gradlew test`. It rolls back everything it writes.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Could not resolve placeholder 'POSTGRES_PASSWORD'` | The variable is not set in `backend/.env` or the environment |
| `Connection refused` at startup | The container is not running/healthy, or `POSTGRES_HOST`/`POSTGRES_PORT` differ from compose |
| `password authentication failed` | The volume was created with a different password; `docker compose down -v` deletes it (and all data) |
| `permission denied to create extension "postgis"` | Managed database: ask the administrator to create the extension |
| `extension "postgis" is not available` | The database is plain PostgreSQL, not a PostGIS image/server |

## Data-quality rules (Step 17)

The schema already carried the conceptual fields (`id`, `name`, `area_type`, `geometry`, `parent_area_id`, `source`, `source_id` = external id, `metadata`, timestamps), so only guarantees were added, in `V4`:

| Rule | Enforced by |
| --- | --- |
| Identity is `source + source_id`, unique | `area_source_source_id_uq` (V2); names are never unique, so two "Model Town" areas with different ids coexist |
| External id, when present, is not blank | `area_source_id_not_blank` (V4) |
| Name not blank and without surrounding whitespace | `area_name_not_blank` (V2), `area_name_trimmed` (V4); the importer also collapses inner whitespace (`AreaNameNormalizer`) |
| Geometry present, valid, non-empty, `MultiPolygon`, SRID 4326 | column type `geometry(MultiPolygon, 4326)` and `area_geometry_valid` (V2) |
| A parent is never its own ancestor | `area_not_own_parent` (V2), trigger `area_parent_no_cycle` (V4); the link SQL also skips a link that would close a cycle |
| Spatial index | `area_geometry_gist` (V2) |

Constraints added by V4 are `NOT VALID` on purpose: they never rewrite or reject data that is already stored. To find old rows that would violate them run `gradlew areaQuality` (or `backend/db-tools/area-quality-report.sql`) and correct them through a reviewed re-import or migration, never an ad-hoc update. The import normalises names, so re-importing a source repairs its rows.

### Inspecting the data

`gradlew areaQuality` (read-only, developer command; no HTTP endpoint) prints the area count, coverage by type and by source, whether the GiST index exists, and the number of rows violating each rule: invalid/empty geometry, SRID, unexpected geometry type, missing or untrimmed names, missing external ids, duplicate `source + external id`, missing/self/cyclic parents and probable duplicate records. Example output shape:

```text
Area data quality
  Total areas        : 12
  By type            :
    CITY           1
    VILLAGE        6 ...
  Spatial index      : present (GiST on geometry)
  Checks (0 = clean) :
    invalid geometry                         0
    ...
  Result             : clean
```

### Production configuration

Database settings come only from `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` (no default password; the application refuses to start without it). `backend/.env` is git-ignored, only `.env.example` with placeholders is committed, and the credentials never reach the frontend. The Docker Compose development database uses a named volume, a health check and the `postgis/postgis` image; no other infrastructure is used.
