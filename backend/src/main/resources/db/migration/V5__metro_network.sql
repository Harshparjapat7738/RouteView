-- Metro network (Delhi Metro first; more networks can be added as further `source` values).
--
-- Static data only: stations, lines and the ordered stations of each line. It is imported explicitly from a
-- GTFS dataset (see docs/metro.md); nothing here is real-time. Transportation infrastructure is kept apart
-- from `area` (geographical journey stops): a station is never an area.
--
-- Stations are matched by (source, external_id): re-importing a newer dataset updates rows in place; records
-- missing from the new dataset are marked inactive, never silently deleted.

CREATE TABLE metro_dataset (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Dataset family, e.g. DMRC_GTFS. One row per source: the dataset currently in use.
    source            varchar(64)  NOT NULL,
    -- Version label given at import time (publisher version or publication date).
    source_version    varchar(64)  NOT NULL,
    -- When the publisher says the data was published/updated (may be unknown).
    source_updated_at date,
    imported_at       timestamptz  NOT NULL DEFAULT now(),
    -- Import statistics (counts of stations, routes, trips, stop times, rejected records, ...).
    statistics        jsonb        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT metro_dataset_source_not_blank CHECK (btrim(source) <> ''),
    CONSTRAINT metro_dataset_version_not_blank CHECK (btrim(source_version) <> '')
);
CREATE UNIQUE INDEX metro_dataset_source_uq ON metro_dataset (source);

CREATE TABLE metro_line (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    name           varchar(255) NOT NULL,
    short_name     varchar(64),
    -- #RRGGBB when the source provides a valid colour; never invented.
    display_color  varchar(7),
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    active         boolean      NOT NULL DEFAULT true,
    metadata       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT metro_line_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT metro_line_color_format CHECK (display_color IS NULL OR display_color ~ '^#[0-9A-Fa-f]{6}$')
);
CREATE UNIQUE INDEX metro_line_source_external_uq ON metro_line (source, external_id);

CREATE TABLE metro_station (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    name           varchar(255) NOT NULL,
    -- WGS 84 (SRID 4326), like every other geometry of RouteView.
    location       geometry(Point, 4326) NOT NULL,
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    active         boolean      NOT NULL DEFAULT true,
    metadata       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT metro_station_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT metro_station_location_valid CHECK (NOT ST_IsEmpty(location) AND ST_IsValid(location))
);
CREATE UNIQUE INDEX metro_station_source_external_uq ON metro_station (source, external_id);
CREATE INDEX metro_station_location_gist ON metro_station USING gist (location);
-- Station names are NOT unique (different stations can share a name): lookups are never unique-by-name.
CREATE INDEX metro_station_name_lower_idx ON metro_station (lower(name));

-- A station on a line, in travel order. `pattern` separates branches / service patterns of the same line
-- (each pattern is one ordered list of stations); `toward` is the last station of the pattern in the stored
-- direction. Interchange stations simply appear on several lines.
CREATE TABLE metro_station_line (
    line_id    uuid         NOT NULL REFERENCES metro_line (id) ON DELETE CASCADE,
    pattern    varchar(32)  NOT NULL,
    sequence   integer      NOT NULL,
    station_id uuid         NOT NULL REFERENCES metro_station (id) ON DELETE CASCADE,
    toward     varchar(255),

    PRIMARY KEY (line_id, pattern, sequence),
    CONSTRAINT metro_station_line_sequence_positive CHECK (sequence >= 1)
);
CREATE INDEX metro_station_line_station_idx ON metro_station_line (station_id);
