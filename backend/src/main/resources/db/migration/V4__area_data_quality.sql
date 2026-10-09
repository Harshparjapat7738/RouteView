-- Data-quality guarantees for the area table. Nothing here changes existing rows or geometry.
--
-- 1. Constraints are added NOT VALID: existing rows are left exactly as they are (no data is rewritten or
--    deleted), every new or changed row must satisfy them. `backend/db-tools/area-quality-report.sql` and
--    `gradlew areaQuality` list existing rows that would violate them.
--      * an external id, when present, is not blank (the logical identity is source + source_id, unique since V2);
--      * a name has no leading/trailing whitespace (the importer normalises names before storing).
-- 2. A parent chain can never contain a cycle (A -> B -> A). The importer only links parents that the source states
--    explicitly and checks for cycles first; this trigger is the last line of defence at the database level.

ALTER TABLE area
    ADD CONSTRAINT area_source_id_not_blank CHECK (source_id IS NULL OR btrim(source_id) <> '') NOT VALID;
ALTER TABLE area
    ADD CONSTRAINT area_name_trimmed CHECK (name = btrim(name)) NOT VALID;

CREATE FUNCTION area_prevent_parent_cycle() RETURNS trigger AS $$
DECLARE
    current_id uuid := NEW.parent_area_id;
    steps      integer := 0;
BEGIN
    WHILE current_id IS NOT NULL AND steps < 100 LOOP
        IF current_id = NEW.id THEN
            RAISE EXCEPTION 'area parent relationship would create a cycle' USING ERRCODE = '23514';
        END IF;
        SELECT parent_area_id INTO current_id FROM area WHERE id = current_id;
        steps := steps + 1;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER area_parent_no_cycle
    BEFORE INSERT OR UPDATE OF parent_area_id ON area
    FOR EACH ROW
    WHEN (NEW.parent_area_id IS NOT NULL)
    EXECUTE FUNCTION area_prevent_parent_cycle();
