package com.routeview.area.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ImportRegionTest {

    @Test
    void parsesSouthWestNorthEast() {
        ImportRegion region = ImportRegion.parse(" 28.30, 77.20 ,28.50,77.45");
        assertEquals(28.30, region.south());
        assertEquals(77.45, region.east());
        assertEquals(0.25, region.maxSpanDegrees(), 1e-9);
    }

    @Test
    void rejectsBadRegions() {
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse(""));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse(null));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("1,2,3"));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("a,b,c,d"));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("28.5,77,28.3,78"));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("-91,0,0,1"));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("0,0,1,181"));
        assertThrows(IllegalArgumentException.class, () -> ImportRegion.parse("NaN,0,1,1"));
    }

    @Test
    void propertiesApplyDefaultsAndLimits() {
        AreaImportProperties defaults = new AreaImportProperties(false, null, null, null, 0, 0, 0, 0);
        assertEquals(AreaImportProperties.DEFAULT_BATCH_SIZE, defaults.batchSize());
        assertEquals(AreaImportProperties.DEFAULT_OVERPASS_URL, defaults.overpassUrl());
        assertEquals(false, defaults.usesSourceFile());
        assertEquals(AreaImportProperties.MAX_BATCH_SIZE, new AreaImportProperties(false, "", "f.osm", "", 99999, 1, 0, 0).batchSize());
    }
}
