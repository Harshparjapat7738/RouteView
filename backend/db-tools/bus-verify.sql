-- Read-only verification of the imported bus network (run after `gradlew importBus`):
--   psql -h <host> -U <user> -d <db> -f backend/db-tools/bus-verify.sql
-- Every "problems" row should be 0. Nothing here changes data.

\echo '== dataset'
SELECT source, source_version, source_updated_at, imported_at, service_period_start, service_period_end, operating_days FROM bus_dataset;

\echo '== counts'
SELECT 'agencies' AS what, count(*) FROM bus_agency
UNION ALL SELECT 'stops', count(*) FROM bus_stop
UNION ALL SELECT 'stops (active)', count(*) FROM bus_stop WHERE active
UNION ALL SELECT 'routes', count(*) FROM bus_route
UNION ALL SELECT 'routes (active)', count(*) FROM bus_route WHERE active
UNION ALL SELECT 'services', count(*) FROM bus_service
UNION ALL SELECT 'service dates', count(*) FROM bus_service_date
UNION ALL SELECT 'shapes', count(*) FROM bus_shape
UNION ALL SELECT 'trips', count(*) FROM bus_trip
UNION ALL SELECT 'stop times', count(*) FROM bus_stop_time;

\echo '== problems (all must be 0)'
SELECT 'trips without a route' AS problem, count(*) FROM bus_trip t LEFT JOIN bus_route r ON r.id = t.route_id WHERE r.id IS NULL
UNION ALL SELECT 'trips naming a service that has no row', count(*) FROM bus_trip WHERE service_external_id IS NOT NULL AND service_id IS NULL
UNION ALL SELECT 'trips with a shape id but no shape', count(*) FROM bus_trip t WHERE t.shape_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bus_shape s WHERE s.id = t.shape_id)
UNION ALL SELECT 'stop times without a trip', count(*) FROM bus_stop_time st LEFT JOIN bus_trip t ON t.id = st.trip_id WHERE t.id IS NULL
UNION ALL SELECT 'stop times without a stop', count(*) FROM bus_stop_time st LEFT JOIN bus_stop s ON s.id = st.stop_id WHERE s.id IS NULL
UNION ALL SELECT 'routes of an agency that does not exist', count(*) FROM bus_route r WHERE r.agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bus_agency a WHERE a.id = r.agency_id)
UNION ALL SELECT 'trips with fewer than 2 stop times', count(*) FROM bus_trip t WHERE (SELECT count(*) FROM bus_stop_time st WHERE st.trip_id = t.id) < 2
UNION ALL SELECT 'trips whose times go backwards',
       count(DISTINCT trip_id) FROM (
           SELECT trip_id, departure_seconds, arrival_seconds,
                  lag(departure_seconds) OVER (PARTITION BY trip_id ORDER BY stop_sequence) AS prev_departure
           FROM bus_stop_time) x
       WHERE prev_departure IS NOT NULL AND arrival_seconds IS NOT NULL AND arrival_seconds < prev_departure
UNION ALL SELECT 'duplicate (source, external_id) in stops', count(*) FROM (SELECT 1 FROM bus_stop GROUP BY source, external_id HAVING count(*) > 1) d
UNION ALL SELECT 'duplicate (source, external_id) in routes', count(*) FROM (SELECT 1 FROM bus_route GROUP BY source, external_id HAVING count(*) > 1) d
UNION ALL SELECT 'duplicate (source, external_id) in trips', count(*) FROM (SELECT 1 FROM bus_trip GROUP BY source, external_id HAVING count(*) > 1) d
UNION ALL SELECT 'invalid or empty stop geometries', count(*) FROM bus_stop WHERE NOT ST_IsValid(location) OR ST_IsEmpty(location)
UNION ALL SELECT 'stop geometries not in SRID 4326', count(*) FROM bus_stop WHERE ST_SRID(location) <> 4326
UNION ALL SELECT 'invalid shape geometries', count(*) FROM bus_shape WHERE NOT ST_IsValid(geometry) OR ST_SRID(geometry) <> 4326
UNION ALL SELECT 'stops outside the India bounding box', count(*) FROM bus_stop WHERE NOT (ST_Y(location) BETWEEN 6 AND 38 AND ST_X(location) BETWEEN 68 AND 98)
UNION ALL SELECT 'rows of another source', (SELECT count(*) FROM bus_trip WHERE source NOT IN (SELECT source FROM bus_dataset));

\echo '== relationships'
SELECT count(*) AS routes_with_trips FROM bus_route r WHERE EXISTS (SELECT 1 FROM bus_trip t WHERE t.route_id = r.id);
SELECT count(*) AS stops_used_by_trips FROM bus_stop s WHERE EXISTS (SELECT 1 FROM bus_stop_time st WHERE st.stop_id = s.id);
SELECT count(*) AS routes_sharing_a_long_name FROM (SELECT long_name FROM bus_route WHERE long_name IS NOT NULL GROUP BY long_name HAVING count(*) > 1) d;
SELECT min(stop_sequence) AS first_sequence, max(stop_sequence) AS last_sequence, max(departure_seconds) AS latest_departure_seconds FROM bus_stop_time;

\echo '== indexes'
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename LIKE 'bus\_%' ORDER BY tablename, indexname;

\echo '== geometry columns (all EPSG:4326)'
SELECT f_table_name, f_geometry_column, type, srid FROM geometry_columns WHERE f_table_name LIKE 'bus\_%' ORDER BY 1;

\echo '== table sizes'
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(oid)) AS total_size, reltuples::bigint AS approx_rows
FROM pg_class WHERE relkind = 'r' AND relname LIKE 'bus\_%' ORDER BY pg_total_relation_size(oid) DESC;

\echo '== patterns (derived layer used by the journey engine)'
SELECT (SELECT count(*) FROM bus_pattern) AS patterns,
       (SELECT count(*) FROM bus_pattern_stop) AS pattern_stops,
       (SELECT count(*) FROM bus_trip WHERE pattern_id IS NULL) AS trips_without_pattern,
       (SELECT count(*) FROM bus_trip) AS trips;
SELECT 'patterns with fewer than 2 stops' AS check_name, count(*) AS problems FROM bus_pattern WHERE stop_count < 2
UNION ALL SELECT 'patterns whose stored stop count differs from their rows',
       count(*) FROM (SELECT p.id FROM bus_pattern p JOIN bus_pattern_stop ps ON ps.pattern_id = p.id GROUP BY p.id, p.stop_count HAVING count(*) <> p.stop_count) d
UNION ALL SELECT 'patterns whose stop indexes are not 0..n-1',
       count(*) FROM (SELECT pattern_id FROM bus_pattern_stop GROUP BY pattern_id HAVING min(idx) <> 0 OR max(idx) <> count(*) - 1) d
UNION ALL SELECT 'pattern stop offsets going backwards',
       count(*) FROM (SELECT offset_seconds < lag(offset_seconds) OVER (PARTITION BY pattern_id ORDER BY idx) AS back FROM bus_pattern_stop) x WHERE back
UNION ALL SELECT 'pattern stop_sequence not increasing',
       count(*) FROM (SELECT stop_sequence <= lag(stop_sequence) OVER (PARTITION BY pattern_id ORDER BY idx) AS bad FROM bus_pattern_stop) x WHERE bad
UNION ALL SELECT 'trips pointing at a pattern of another route',
       count(*) FROM bus_trip t JOIN bus_pattern p ON p.id = t.pattern_id WHERE p.route_id <> t.route_id
UNION ALL SELECT 'patterns of one route sharing a signature',
       count(*) FROM (SELECT 1 FROM bus_pattern GROUP BY route_id, signature HAVING count(*) > 1) d;

\echo '== pattern layer size (why the graph can live in memory)'
SELECT (SELECT count(*) FROM bus_stop_time) AS stop_time_rows, (SELECT count(*) FROM bus_pattern_stop) AS pattern_stop_rows;
