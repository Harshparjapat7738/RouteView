-- Candidate geographical areas for ONE route, in a single query.
-- Parameters (in order): 1 route as WKB (SRID 4326, lon/lat), 2 tolerance in metres,
--                        3 bounding-box expansion in degrees, 4 comma separated list of selectable area types,
--                        5 boundary band in metres, 6 minimum visit length in metres.
--
-- Step 1  index pre-filter: area.geometry && ST_Expand(piece, tolerance) for each ~64-vertex piece of the route
--         (ST_Subdivide), using the GiST index area_geometry_gist. One box around the WHOLE route is useless for a long
--         diagonal route: it covers most of the region.
-- Step 2  exact filter:     ST_DWithin(geography, geography, tolerance)     (metres, so the tolerance is real distance)
-- Step 3  where the route is inside an area: ST_Intersection(route, area) -> line pieces, measured in metres
-- Step 4  where along the route: ST_LineLocatePoint -> fraction, converted to metres with ST_LineSubstring
-- Step 5  "grazing" protection, per piece of route inside an area: the part of the piece that lies further than the
--         boundary band from the area's border is its interior length. A piece counts as a visit only if its interior
--         length reaches the minimum visit length, so a road that runs along a shared border, or clips a corner, is not a
--         crossing, and the position of an area is the first *meaningful* visit, not the first graze.
-- Rows come back in arbitrary order; ordering and relevance decisions are made in Java (AreaSelectionPolicy).
--
-- Performance notes (measured with EXPLAIN ANALYZE on 26k synthetic areas, see docs/performance.md):
--  * `pieces` and `crossed` are MATERIALIZED. Without it PostgreSQL inlined `crossed` into the LEFT JOIN and re-ran the
--    whole aggregation (including ST_Buffer / ST_Difference) once per candidate area: 8.1 s for an 8 km route with 17
--    candidates, 0.25 s once evaluated a single time.
--  * the boundary buffer is computed once per candidate area (`band_geom`), not once per crossing piece.
--  * the route is cut into pieces of at most 64 vertices and each piece's expanded box is matched against the GiST
--    index. For a ~500 km diagonal route the single bounding box matched 20,554 of 26,350 areas, the piece boxes 898,
--    and only 288 were really within tolerance. The expansion is a superset of the tolerance, so nothing is missed.
WITH params AS (
    SELECT ST_SetSRID(ST_GeomFromWKB(?), 4326) AS line,
           CAST(? AS double precision)         AS tolerance_m,
           CAST(? AS double precision)         AS expand_deg,
           string_to_array(?, ',')             AS types,
           CAST(? AS double precision)         AS band_m,
           CAST(? AS double precision)         AS min_visit_m
), route AS (
    SELECT line, tolerance_m, types, band_m, min_visit_m,
           ST_Length(line::geography)          AS length_m,
           ST_StartPoint(line)::geography      AS start_pt,
           ST_EndPoint(line)::geography        AS end_pt,
           expand_deg
    FROM params
), route_box AS (
    SELECT ST_Expand(g, r.expand_deg) AS box, r.types
    FROM route r
    CROSS JOIN LATERAL ST_Subdivide(r.line, 64) AS g
), near AS (
    SELECT DISTINCT a.id
    FROM route_box b
    JOIN area a ON a.geometry && b.box
    WHERE a.area_type = ANY (b.types)
), candidate AS (
    SELECT a.id, a.name, a.area_type, a.geometry,
           CASE WHEN r.band_m > 0 THEN ST_Buffer(ST_Boundary(a.geometry)::geography, r.band_m)::geometry END AS band_geom,
           r.line, r.length_m, r.tolerance_m, r.start_pt, r.end_pt, r.band_m, r.min_visit_m
    FROM route r
    JOIN near n ON true
    JOIN area a ON a.id = n.id
    WHERE ST_DWithin(a.geometry::geography, r.line::geography, r.tolerance_m)
), pieces AS MATERIALIZED (
    SELECT c.id, c.min_visit_m,
           ST_Length(d.geom::geography) AS piece_m,
           CASE WHEN c.band_m > 0
                THEN ST_Length(ST_Difference(d.geom, c.band_geom)::geography)
                ELSE ST_Length(d.geom::geography) END                AS interior_m,
           LEAST(ST_LineLocatePoint(c.line, ST_StartPoint(d.geom)),
                 ST_LineLocatePoint(c.line, ST_EndPoint(d.geom)))    AS f_from,
           GREATEST(ST_LineLocatePoint(c.line, ST_StartPoint(d.geom)),
                    ST_LineLocatePoint(c.line, ST_EndPoint(d.geom))) AS f_to
    FROM candidate c
    CROSS JOIN LATERAL ST_Dump(ST_CollectionExtract(ST_Intersection(c.line, c.geometry), 2)) AS d
), crossed AS MATERIALIZED (
    SELECT id,
           SUM(piece_m)                                                          AS inside_m,
           COALESCE(SUM(interior_m) FILTER (WHERE interior_m >= min_visit_m), 0) AS interior_m,
           COALESCE(MIN(f_from) FILTER (WHERE interior_m >= min_visit_m), MIN(f_from)) AS f_in,
           COALESCE(MAX(f_to)   FILTER (WHERE interior_m >= min_visit_m), MAX(f_to))   AS f_out
    FROM pieces
    GROUP BY id
), located AS (
    SELECT c.id, c.name, c.area_type, c.geometry, c.line, c.length_m, c.tolerance_m, c.start_pt, c.end_pt,
           COALESCE(x.inside_m, 0)   AS inside_m,
           COALESCE(x.interior_m, 0) AS interior_m,
           -- An area that is only close by has no crossing: use the route point closest to it.
           COALESCE(x.f_in, ST_LineLocatePoint(c.line, ST_ClosestPoint(c.line, c.geometry))) AS f_in,
           COALESCE(x.f_out, x.f_in, ST_LineLocatePoint(c.line, ST_ClosestPoint(c.line, c.geometry))) AS f_out
    FROM candidate c
    LEFT JOIN crossed x ON x.id = c.id
)
SELECT l.id,
       l.name,
       l.area_type,
       CASE WHEN l.f_in  <= 0 THEN 0 ELSE ST_Length(ST_LineSubstring(l.line, 0, LEAST(l.f_in, 1))::geography) END  AS entry_m,
       CASE WHEN l.f_out <= 0 THEN 0 ELSE ST_Length(ST_LineSubstring(l.line, 0, LEAST(l.f_out, 1))::geography) END AS exit_m,
       l.inside_m,
       l.interior_m,
       sqrt(ST_Area(l.geometry::geography))                              AS size_m,
       ST_DWithin(l.geometry::geography, l.start_pt, l.tolerance_m)       AS near_start,
       ST_DWithin(l.geometry::geography, l.end_pt, l.tolerance_m)         AS near_end,
       ST_Covers(l.geometry, ST_StartPoint(l.line))                       AS contains_start,
       ST_Covers(l.geometry, ST_EndPoint(l.line))                         AS contains_end,
       l.length_m                                                         AS route_length_m,
       ST_Y(ST_LineInterpolatePoint(l.line, LEAST(GREATEST(l.f_in, 0), 1))) AS entry_lat,
       ST_X(ST_LineInterpolatePoint(l.line, LEAST(GREATEST(l.f_in, 0), 1))) AS entry_lon
FROM located l;
