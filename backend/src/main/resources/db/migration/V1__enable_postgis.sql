-- PostGIS must exist before any spatial table or column is created.
-- Creating an extension needs a privileged role. The development image (postgis/postgis) runs
-- Flyway as the database owner/superuser; on managed PostgreSQL, ask the database administrator
-- to run `CREATE EXTENSION postgis;` once and this statement then does nothing.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Fail the migration (and therefore application start) if PostGIS is not actually usable.
DO $$
BEGIN
    PERFORM postgis_version();
END
$$;
