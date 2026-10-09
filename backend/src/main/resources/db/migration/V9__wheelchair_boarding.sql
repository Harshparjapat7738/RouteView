-- Wheelchair access as the dataset states it (GTFS stops.txt wheelchair_boarding).
-- NULL = the dataset says nothing (unknown). Only an explicit statement is stored: 1 = accessible, 2 = not accessible.
-- Metro keeps the equivalent in metro_station.metadata ->> 'wheelchairBoarding' (no schema change needed there).
ALTER TABLE bus_stop ADD COLUMN wheelchair_boarding smallint;
ALTER TABLE bus_stop ADD CONSTRAINT bus_stop_wheelchair_boarding_valid CHECK (wheelchair_boarding IS NULL OR wheelchair_boarding IN (1, 2));
