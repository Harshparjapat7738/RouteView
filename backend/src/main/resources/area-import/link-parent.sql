-- Sets the parent of one area. Parameters: child source, child source_id, parent source, parent source_id.
-- Does nothing unless both areas exist and the parent is not already set to that area.
-- A link that would close a cycle with parents stored by an earlier import is skipped (never invented, never fails).
UPDATE area child
SET parent_area_id = parent.id,
    updated_at = now()
FROM area parent
WHERE child.source = ? AND child.source_id = ?
  AND parent.source = ? AND parent.source_id = ?
  AND child.id <> parent.id
  AND child.parent_area_id IS DISTINCT FROM parent.id
  AND NOT EXISTS (
      WITH RECURSIVE up(id, parent_id, depth) AS (
          SELECT p.id, p.parent_area_id, 0 FROM area p WHERE p.id = parent.id
          UNION ALL
          SELECT a.id, a.parent_area_id, up.depth + 1 FROM area a JOIN up ON a.id = up.parent_id WHERE up.depth < 64
      )
      SELECT 1 FROM up WHERE up.id = child.id
  )
