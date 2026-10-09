-- Bus journey engine: patterns (derived data).
--
-- A pattern is one distinct ORDERED list of stops that trips of a route run (GTFS route_id + the stop sequence). Hundreds of
-- trips of the same route normally share one pattern, so the journey search works on patterns instead of on millions of stop
-- times. Patterns are rebuilt from bus_trip / bus_stop_time at the end of every bus import, in the same transaction; they hold
-- no data of their own that the GTFS files do not hold. The order of stops is always the dataset's stop_sequence; names and
-- coordinates are never used to order or to match anything.
--
-- offset_seconds is the average scheduled time from the trip's first departure to the arrival at this stop over the pattern's
-- trips (static schedule, not live data). first_departure / last_departure are the earliest and latest departure at the first
-- stop (seconds since the start of the service day); together with trip_count they give a typical headway.

CREATE TABLE bus_pattern (
    id               uuid         PRIMARY KEY,
    route_id         uuid         NOT NULL REFERENCES bus_route (id) ON DELETE CASCADE,
    source           varchar(64)  NOT NULL,
    -- md5 of the ordered stop ids: the identity of the stop sequence within its route
    signature        char(32)     NOT NULL,
    stop_count       integer      NOT NULL,
    trip_count       integer      NOT NULL,
    first_departure  integer,
    last_departure   integer,
    -- direction_id / headsign of the pattern's trips when the dataset gives one value for all of them, otherwise null
    direction_id     smallint,
    headsign         varchar(255),

    CONSTRAINT bus_pattern_stop_count_valid CHECK (stop_count >= 2),
    CONSTRAINT bus_pattern_trip_count_valid CHECK (trip_count >= 1)
);
CREATE UNIQUE INDEX bus_pattern_route_signature_uq ON bus_pattern (route_id, signature);
CREATE INDEX bus_pattern_source_idx ON bus_pattern (source);

CREATE TABLE bus_pattern_stop (
    pattern_id     uuid    NOT NULL REFERENCES bus_pattern (id) ON DELETE CASCADE,
    -- 0-based position in the pattern (the order of the dataset's stop_sequence)
    idx            integer NOT NULL,
    stop_id        uuid    NOT NULL REFERENCES bus_stop (id) ON DELETE CASCADE,
    stop_sequence  integer NOT NULL,
    offset_seconds integer NOT NULL,

    PRIMARY KEY (pattern_id, idx),
    CONSTRAINT bus_pattern_stop_idx_valid CHECK (idx >= 0 AND offset_seconds >= 0)
);
-- "which patterns serve this stop, and where": the entry point of every journey search
CREATE INDEX bus_pattern_stop_stop_idx ON bus_pattern_stop (stop_id, pattern_id, idx);

ALTER TABLE bus_trip ADD COLUMN pattern_id uuid REFERENCES bus_pattern (id) ON DELETE SET NULL;
CREATE INDEX bus_trip_pattern_idx ON bus_trip (pattern_id);
