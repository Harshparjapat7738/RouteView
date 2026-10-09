-- Bus network (GTFS) foundation: agencies, stops, routes, services (calendar), shapes, trips and stop times.
--
-- * Identity is the GTFS id: (source, external_id) is unique everywhere and the uuid primary keys are derived from it, so a
--   re-import of the same dataset updates the same rows. Names (route long names, stop names, stop_code) are display text only
--   and are NOT unique in the Delhi dataset, so nothing is keyed on them.
-- * Geographic data is stored as PostGIS geometry in EPSG:4326 (longitude, latitude) with GiST indexes.
-- * Times are integer seconds since the start of the service day; they may exceed 86400 (trips running past midnight).
-- * Nothing here touches the metro_* tables: the bus network is a separate set of tables.
-- * No data is invented: optional values the dataset does not give stay NULL.

CREATE TABLE bus_dataset (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Dataset family, e.g. DELHI_BUS_GTFS. One row per source: the dataset currently in use.
    source               varchar(64)  NOT NULL,
    -- Version label given at import time (publisher version or publication date).
    source_version       varchar(64)  NOT NULL,
    -- When the publisher says the data was published/updated (may be unknown).
    source_updated_at    date,
    imported_at          timestamptz  NOT NULL DEFAULT now(),
    -- Service period the imported trips run in (from calendar.txt); null when the dataset has no calendar.
    service_period_start date,
    service_period_end   date,
    -- comma-separated lower-case weekday names the dataset runs on; null when the dataset has no calendar
    operating_days       varchar(64),
    -- Import statistics (counts of stops, routes, trips, stop times, rejected records, ...).
    statistics           jsonb        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT bus_dataset_source_not_blank CHECK (btrim(source) <> ''),
    CONSTRAINT bus_dataset_version_not_blank CHECK (btrim(source_version) <> '')
);
CREATE UNIQUE INDEX bus_dataset_source_uq ON bus_dataset (source);

CREATE TABLE bus_agency (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    name           varchar(255) NOT NULL,
    url            varchar(512),
    timezone       varchar(64),
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    active         boolean      NOT NULL DEFAULT true,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_agency_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX bus_agency_source_external_uq ON bus_agency (source, external_id);

CREATE TABLE bus_stop (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    -- GTFS stop_code: NOT unique (several stop ids can share one code at the same place).
    code           varchar(64),
    name           varchar(255) NOT NULL,
    location       geometry(Point, 4326) NOT NULL,
    zone_id        varchar(64),
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    active         boolean      NOT NULL DEFAULT true,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_stop_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT bus_stop_location_valid CHECK (NOT ST_IsEmpty(location)
        AND ST_X(location) BETWEEN -180 AND 180 AND ST_Y(location) BETWEEN -90 AND 90)
);
CREATE UNIQUE INDEX bus_stop_source_external_uq ON bus_stop (source, external_id);
CREATE INDEX bus_stop_location_gist ON bus_stop USING gist (location);
CREATE INDEX bus_stop_code_idx ON bus_stop (code) WHERE code IS NOT NULL;

CREATE TABLE bus_route (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    agency_id      uuid         REFERENCES bus_agency (id) ON DELETE SET NULL,
    -- Display text only. NOT unique: the Delhi dataset has routes that share a long name.
    long_name      varchar(255),
    short_name     varchar(64),
    route_type     integer      NOT NULL DEFAULT 3,
    -- #RRGGBB when the source provides a valid colour; never invented.
    display_color  varchar(7),
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    active         boolean      NOT NULL DEFAULT true,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_route_has_a_name CHECK (coalesce(btrim(long_name), '') <> '' OR coalesce(btrim(short_name), '') <> ''),
    CONSTRAINT bus_route_color_format CHECK (display_color IS NULL OR display_color ~ '^#[0-9A-Fa-f]{6}$')
);
CREATE UNIQUE INDEX bus_route_source_external_uq ON bus_route (source, external_id);
CREATE INDEX bus_route_agency_idx ON bus_route (agency_id);

CREATE TABLE bus_service (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    -- comma-separated lower-case weekday names
    operating_days varchar(64)  NOT NULL,
    start_date     date         NOT NULL,
    end_date       date         NOT NULL,
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_service_period_ordered CHECK (start_date <= end_date)
);
CREATE UNIQUE INDEX bus_service_source_external_uq ON bus_service (source, external_id);

-- calendar_dates.txt: a date on which a service is added (added = true) or removed (added = false)
CREATE TABLE bus_service_date (
    service_id   uuid    NOT NULL REFERENCES bus_service (id) ON DELETE CASCADE,
    service_date date    NOT NULL,
    added        boolean NOT NULL,

    PRIMARY KEY (service_id, service_date)
);

CREATE TABLE bus_shape (
    id             uuid         PRIMARY KEY,
    external_id    varchar(128) NOT NULL,
    geometry       geometry(LineString, 4326) NOT NULL,
    source         varchar(64)  NOT NULL,
    source_version varchar(64)  NOT NULL,
    updated_at     timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_shape_geometry_valid CHECK (NOT ST_IsEmpty(geometry) AND ST_NPoints(geometry) >= 2)
);
CREATE UNIQUE INDEX bus_shape_source_external_uq ON bus_shape (source, external_id);
CREATE INDEX bus_shape_geometry_gist ON bus_shape USING gist (geometry);

CREATE TABLE bus_trip (
    id                  uuid         PRIMARY KEY,
    external_id         varchar(128) NOT NULL,
    route_id            uuid         NOT NULL REFERENCES bus_route (id) ON DELETE CASCADE,
    -- The calendar id the trip names (kept even when the dataset has no matching calendar row), and the resolved row.
    service_external_id varchar(128),
    service_id          uuid         REFERENCES bus_service (id) ON DELETE SET NULL,
    shape_id            uuid         REFERENCES bus_shape (id) ON DELETE SET NULL,
    headsign            varchar(255),
    direction_id        smallint,
    source              varchar(64)  NOT NULL,
    source_version      varchar(64)  NOT NULL,
    updated_at          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT bus_trip_direction_valid CHECK (direction_id IS NULL OR direction_id IN (0, 1))
);
CREATE UNIQUE INDEX bus_trip_source_external_uq ON bus_trip (source, external_id);
CREATE INDEX bus_trip_route_idx ON bus_trip (route_id);
CREATE INDEX bus_trip_service_idx ON bus_trip (service_id);
CREATE INDEX bus_trip_shape_idx ON bus_trip (shape_id) WHERE shape_id IS NOT NULL;

CREATE TABLE bus_stop_time (
    trip_id           uuid    NOT NULL REFERENCES bus_trip (id) ON DELETE CASCADE,
    -- The dataset's own sequence number (it may start at 0); increasing within a trip.
    stop_sequence     integer NOT NULL,
    stop_id           uuid    NOT NULL REFERENCES bus_stop (id) ON DELETE CASCADE,
    -- seconds since the start of the service day; may exceed 86400; null when the dataset gives no time
    arrival_seconds   integer,
    departure_seconds integer,

    PRIMARY KEY (trip_id, stop_sequence),
    CONSTRAINT bus_stop_time_sequence_valid CHECK (stop_sequence >= 0),
    CONSTRAINT bus_stop_time_times_valid CHECK (
        (arrival_seconds IS NULL OR arrival_seconds >= 0)
        AND (departure_seconds IS NULL OR departure_seconds >= 0)
        AND (arrival_seconds IS NULL OR departure_seconds IS NULL OR departure_seconds >= arrival_seconds))
);
-- "which trips call at this stop, and when": the base of departures and later journey search
CREATE INDEX bus_stop_time_stop_departure_idx ON bus_stop_time (stop_id, departure_seconds);
