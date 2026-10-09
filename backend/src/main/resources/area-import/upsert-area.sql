-- Inserts an area or updates the existing one of the same (source, source_id).
-- Parameters: name, area_type, geometry as WKB (SRID 4326 is applied here), source, source_id, metadata (JSON text).
-- Returns one row {inserted} when a row was inserted (true) or changed (false); no row when it was already identical.
INSERT INTO area (name, area_type, geometry, source, source_id, metadata)
VALUES (?, ?, ST_GeomFromWKB(?, 4326), ?, ?, ?::jsonb)
ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name,
    area_type = EXCLUDED.area_type,
    geometry = EXCLUDED.geometry,
    metadata = EXCLUDED.metadata,
    updated_at = now()
WHERE area.name IS DISTINCT FROM EXCLUDED.name
   OR area.area_type IS DISTINCT FROM EXCLUDED.area_type
   OR area.metadata IS DISTINCT FROM EXCLUDED.metadata
   OR NOT ST_OrderingEquals(area.geometry, EXCLUDED.geometry)
RETURNING (xmax = 0) AS inserted
