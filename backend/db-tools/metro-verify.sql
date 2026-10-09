-- Read-only checks of the imported metro network. Run with psql after `gradlew importMetro`:
--   psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f backend/db-tools/metro-verify.sql
-- Nothing here modifies or deletes data. Every "problem" query should return 0 rows / 0.

\echo '== dataset'
SELECT source, source_version, source_updated_at, imported_at, service_period_start, service_period_end, operating_days,
       (service_period_end < current_date) AS service_period_expired
FROM metro_dataset;

\echo '== counts'
SELECT
  (SELECT count(*) FROM metro_station WHERE active)                              AS stations,
  (SELECT count(*) FROM metro_line WHERE active)                                 AS services,
  (SELECT count(DISTINCT group_id) FROM metro_line WHERE active)                 AS logical_lines,
  (SELECT count(*) FROM metro_station_line)                                      AS station_line_links,
  (SELECT count(*) FROM metro_connection)                                        AS connections,
  (SELECT count(*) FROM metro_shape)                                             AS shapes,
  (SELECT sum(ST_NPoints(geometry)) FROM metro_shape)                            AS shape_points,
  (SELECT (statistics->>'tripsImported')::int FROM metro_dataset LIMIT 1)        AS trips_imported,
  (SELECT (statistics->>'stopTimesImported')::int FROM metro_dataset LIMIT 1)    AS stop_times_imported;

\echo '== services and their logical line (Blue main + Vaishali must share group_id)'
SELECT external_id, name, group_name, branch_name, display_color, group_id FROM metro_line WHERE active ORDER BY group_name, external_id;

\echo '== interchanges (stations served by 2+ LOGICAL lines)'
SELECT count(*) AS interchange_stations FROM (
  SELECT sl.station_id FROM metro_station_line sl JOIN metro_line l ON l.id = sl.line_id
  GROUP BY sl.station_id HAVING count(DISTINCT l.group_id) >= 2) t;

\echo '== PROBLEM: stations served by 2+ services but only ONE logical line must NOT count as interchange (informational)'
SELECT s.name, count(DISTINCT l.id) AS services, count(DISTINCT l.group_id) AS logical_lines
FROM metro_station s JOIN metro_station_line sl ON sl.station_id = s.id JOIN metro_line l ON l.id = sl.line_id
GROUP BY s.id, s.name HAVING count(DISTINCT l.id) >= 2 AND count(DISTINCT l.group_id) = 1 ORDER BY s.name;

\echo '== PROBLEM: duplicate station external ids / duplicate names (names may repeat legitimately: review)'
SELECT source, external_id, count(*) FROM metro_station GROUP BY 1,2 HAVING count(*) > 1;
SELECT lower(name), count(*), array_agg(external_id) FROM metro_station WHERE active GROUP BY 1 HAVING count(*) > 1;

\echo '== PROBLEM: distinct stations at identical coordinates (source data)'
SELECT array_agg(name ORDER BY name) AS names, array_agg(external_id) AS ids FROM metro_station WHERE active
GROUP BY ST_AsEWKB(location) HAVING count(*) > 1;

\echo '== PROBLEM: orphans'
SELECT 'station without line'  AS problem, s.name FROM metro_station s WHERE s.active AND NOT EXISTS (SELECT 1 FROM metro_station_line sl WHERE sl.station_id = s.id);
SELECT 'line without stations' AS problem, l.name FROM metro_line l WHERE l.active AND NOT EXISTS (SELECT 1 FROM metro_station_line sl WHERE sl.line_id = l.id);
SELECT 'line without connections' AS problem, l.name FROM metro_line l WHERE l.active AND NOT EXISTS (SELECT 1 FROM metro_connection c WHERE c.line_id = l.id);
SELECT 'service without logical line' AS problem, l.name FROM metro_line l WHERE l.active AND l.group_id IS NULL;
SELECT 'line without colour' AS problem, l.name FROM metro_line l WHERE l.active AND l.display_color IS NULL;

\echo '== PROBLEM: invalid coordinates (outside India bounds, empty, invalid)'
SELECT name, ST_AsText(location) FROM metro_station
WHERE NOT ST_IsValid(location) OR ST_IsEmpty(location) OR ST_Y(location) NOT BETWEEN 6 AND 38 OR ST_X(location) NOT BETWEEN 68 AND 98;

\echo '== PROBLEM: invalid stop sequences (must start at 1, no gaps, per line pattern)'
SELECT line_id, pattern, min(sequence) AS first, max(sequence) AS last, count(*) AS n
FROM metro_station_line GROUP BY line_id, pattern HAVING min(sequence) <> 1 OR max(sequence) <> count(*);

\echo '== PROBLEM: connections whose stations are not on the same service pattern'
SELECT l.name, a.name AS from_station, b.name AS to_station
FROM metro_connection c JOIN metro_line l ON l.id = c.line_id
JOIN metro_station a ON a.id = c.from_station_id JOIN metro_station b ON b.id = c.to_station_id
WHERE NOT EXISTS (SELECT 1 FROM metro_station_line x WHERE x.line_id = c.line_id AND x.station_id = c.from_station_id)
   OR NOT EXISTS (SELECT 1 FROM metro_station_line y WHERE y.line_id = c.line_id AND y.station_id = c.to_station_id);

\echo '== PROBLEM: shapes that are invalid or far from the stations of their service (> 300 m from every shape vertex)'
SELECT l.name, s.external_id, ST_NPoints(s.geometry) AS points FROM metro_shape s JOIN metro_line l ON l.id = s.line_id
WHERE NOT ST_IsValid(s.geometry) OR ST_NPoints(s.geometry) < 2;
SELECT l.name AS service, st.name AS station,
       round(min(ST_Distance(st.location::geography, sh.geometry::geography))::numeric) AS metres_to_nearest_shape
FROM metro_line l JOIN metro_station_line sl ON sl.line_id = l.id JOIN metro_station st ON st.id = sl.station_id
JOIN metro_shape sh ON sh.line_id = l.id
GROUP BY l.name, st.name HAVING min(ST_Distance(st.location::geography, sh.geometry::geography)) > 300 ORDER BY 3 DESC;

\echo '== services without any shape'
SELECT l.name FROM metro_line l WHERE l.active AND NOT EXISTS (SELECT 1 FROM metro_shape s WHERE s.line_id = l.id);

\echo '== Sikanderpur-style stations: one station, several services'
SELECT s.name, array_agg(DISTINCT l.name ORDER BY l.name) AS services FROM metro_station s
JOIN metro_station_line sl ON sl.station_id = s.id JOIN metro_line l ON l.id = sl.line_id
WHERE s.name ILIKE 'sikander%' GROUP BY s.name;
