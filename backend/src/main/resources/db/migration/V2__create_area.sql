-- Geographical areas only (village, locality, sector, town, city, district, ...).
-- Never POIs or businesses: the model deliberately has no categories for them.
--
-- All geometries use SRID 4326 (WGS 84 longitude/latitude), the coordinate system of
-- Google Routes polylines, GPS and OpenStreetMap, so route geometry and area boundaries
-- can be compared without any reprojection.

CREATE TABLE area (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name           varchar(255) NOT NULL,
    -- Name of a com.routeview.area.model.AreaType constant. The Java enum is the single list of
    -- types; the database only enforces the format so new types need no migration.
    area_type      varchar(32)  NOT NULL,
    -- Boundary. Polygon sources are stored as MultiPolygon (ST_Multi) so one column type fits all.
    geometry       geometry(MultiPolygon, 4326) NOT NULL,
    -- Optional representative point of the area.
    center_point   geometry(Point, 4326),
    parent_area_id uuid         REFERENCES area (id) ON DELETE SET NULL,
    -- Where the area data came from (e.g. a dataset name) and the identifier inside that dataset.
    source         varchar(64)  NOT NULL,
    source_id      varchar(128),
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT area_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT area_type_format CHECK (area_type ~ '^[A-Z][A-Z_]*$'),
    CONSTRAINT area_source_not_blank CHECK (btrim(source) <> ''),
    CONSTRAINT area_not_own_parent CHECK (parent_area_id IS NULL OR parent_area_id <> id),
    CONSTRAINT area_geometry_valid CHECK (NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry))
);

-- The spatial index later queries (intersection with a route) rely on.
CREATE INDEX area_geometry_gist ON area USING gist (geometry);
CREATE INDEX area_parent_area_id_idx ON area (parent_area_id);
CREATE INDEX area_area_type_idx ON area (area_type);
-- Case-insensitive name lookups; also what passing-area search will match against later.
CREATE INDEX area_name_lower_idx ON area (lower(name));
-- A dataset identifier can only be imported once per source.
CREATE UNIQUE INDEX area_source_source_id_uq ON area (source, source_id) WHERE source_id IS NOT NULL;
