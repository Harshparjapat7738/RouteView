-- Read-only data-quality report for the `area` table. Changes nothing.
-- Run it after an import:   psql -h localhost -U routeview -d routeview -f backend/db-tools/area-quality-report.sql
-- Every query returns rows only when something deserves a look. Fixes belong in the importer (validation) or in
-- a reviewed migration, never in ad-hoc UPDATE statements on production data.

\echo '== 1. Overview by type'
SELECT area_type, count(*) AS areas,
       round(avg(sqrt(ST_Area(geometry::geography)))::numeric) AS avg_size_m,
       round(min(sqrt(ST_Area(geometry::geography)))::numeric) AS min_size_m,
       round(max(sqrt(ST_Area(geometry::geography)))::numeric) AS max_size_m
FROM area GROUP BY area_type ORDER BY area_type;

\echo '== 2. Rows without a usable name, geometry or SRID 4326 (the table constraints should keep this empty)'
SELECT id, name, area_type, source, source_id
FROM area
WHERE btrim(name) = '' OR ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry) OR ST_SRID(geometry) <> 4326;

\echo '== 3. Extreme sizes: slivers under 500 m2 and polygons over 150,000 km2'
SELECT id, name, area_type, round(ST_Area(geometry::geography)::numeric) AS square_meters
FROM area
WHERE ST_Area(geometry::geography) < 500 OR ST_Area(geometry::geography) > 150000e6
ORDER BY square_meters;

\echo '== 4. Same name, same type, overlapping boundaries (probable duplicate records of one place)'
SELECT a.name, a.area_type, a.id AS id_a, b.id AS id_b, a.source_id AS source_id_a, b.source_id AS source_id_b
FROM area a
JOIN area b ON a.id < b.id
           AND lower(btrim(a.name)) = lower(btrim(b.name))
           AND a.area_type = b.area_type
           AND a.geometry && b.geometry
           AND ST_Area(ST_Intersection(a.geometry, b.geometry)) > 0.5 * LEAST(ST_Area(a.geometry), ST_Area(b.geometry))
ORDER BY a.name;

\echo '== 5. Same name and type in several records (those not listed in 4 are separate places; detection keeps them as separate stops)'
SELECT lower(btrim(name)) AS name, area_type, count(*) AS records
FROM area GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY records DESC, name LIMIT 50;

\echo '== 6. Parent links that point to a smaller area or a different dataset'
SELECT c.id AS child, c.name AS child_name, p.id AS parent, p.name AS parent_name
FROM area c JOIN area p ON p.id = c.parent_area_id
WHERE ST_Area(p.geometry) < ST_Area(c.geometry) OR p.source <> c.source;

\echo '== 7. Spatial index present? (expect area_geometry_gist, method gist)'
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'area' AND indexdef ILIKE '%gist%';
