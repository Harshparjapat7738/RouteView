-- Metro services, graph and shapes.
--
-- * A metro_line row is a SERVICE (one GTFS route). Services that make up one logical line (Blue Line = Noida main line
--   + Vaishali branch) share group_id / group_name; branch_name keeps the service-specific part. Identity is always
--   metro_line.id / external_id, never the name or colour.
-- * metro_connection is the network graph: consecutive stations of real trips, per service (directed, with the number of
--   trips that use it). Routing follows it; nothing is guessed from names or distances.
-- * metro_shape holds the dataset's shapes.txt geometry for the static network layer. Google's polyline stays the
--   geometry of a journey.
-- * metro_dataset gains the service period the dataset states, so an expired timetable is never presented as current.
--
-- Additive only: no existing column or row is changed or removed. A re-import fills the new columns.

ALTER TABLE metro_line
    ADD COLUMN group_id    uuid,
    ADD COLUMN group_name  varchar(255),
    ADD COLUMN branch_name varchar(255);
CREATE INDEX metro_line_group_idx ON metro_line (group_id);

CREATE TABLE metro_connection (
    line_id         uuid    NOT NULL REFERENCES metro_line (id) ON DELETE CASCADE,
    from_station_id uuid    NOT NULL REFERENCES metro_station (id) ON DELETE CASCADE,
    to_station_id   uuid    NOT NULL REFERENCES metro_station (id) ON DELETE CASCADE,
    trip_count      integer NOT NULL DEFAULT 1,

    PRIMARY KEY (line_id, from_station_id, to_station_id),
    CONSTRAINT metro_connection_distinct_stations CHECK (from_station_id <> to_station_id),
    CONSTRAINT metro_connection_trip_count_positive CHECK (trip_count >= 1)
);
CREATE INDEX metro_connection_from_idx ON metro_connection (from_station_id);
CREATE INDEX metro_connection_to_idx ON metro_connection (to_station_id);

CREATE TABLE metro_shape (
    id          uuid         PRIMARY KEY,
    line_id     uuid         NOT NULL REFERENCES metro_line (id) ON DELETE CASCADE,
    external_id varchar(128) NOT NULL,
    geometry    geometry(LineString, 4326) NOT NULL,
    trip_count  integer      NOT NULL DEFAULT 0,

    CONSTRAINT metro_shape_geometry_valid CHECK (NOT ST_IsEmpty(geometry) AND ST_NPoints(geometry) >= 2)
);
CREATE INDEX metro_shape_line_idx ON metro_shape (line_id);
CREATE INDEX metro_shape_geometry_gist ON metro_shape USING gist (geometry);

ALTER TABLE metro_dataset
    ADD COLUMN service_period_start date,
    ADD COLUMN service_period_end   date,
    -- comma-separated lower-case weekday names the dataset runs on; null when the dataset has no calendar
    ADD COLUMN operating_days       varchar(64);
