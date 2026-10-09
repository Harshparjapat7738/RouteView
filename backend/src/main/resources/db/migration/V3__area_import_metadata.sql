-- Descriptive data of the source object (for OpenStreetMap: place, boundary, admin_level, name:en, wikidata).
-- Informational only; nothing queries it yet. Written by the area importer.
ALTER TABLE area ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
