package com.routeview.area.ingest.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.area.ingest.SkipReason;
import com.routeview.area.model.AreaType;

class OsmAreaTypeMapperTest {

    private static OsmAreaTypeMapper.Decision classify(String... keyValues) {
        java.util.HashMap<String, String> tags = new java.util.HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            tags.put(keyValues[i], keyValues[i + 1]);
        }
        return OsmAreaTypeMapper.classify(Map.copyOf(tags));
    }

    @Test
    void placeValuesMapToAreaTypes() {
        assertEquals(AreaType.CITY, classify("place", "city", "name", "X").type());
        assertEquals(AreaType.TOWN, classify("place", "town", "name", "X").type());
        assertEquals(AreaType.VILLAGE, classify("place", "village", "name", "X").type());
        assertEquals(AreaType.LOCALITY, classify("place", "hamlet", "name", "X").type());
        assertEquals(AreaType.SUBURB, classify("place", "suburb", "name", "X").type());
        assertEquals(AreaType.LOCALITY, classify("place", "neighbourhood", "name", "X").type());
        assertEquals(AreaType.LOCALITY, classify("place", "locality", "name", "X").type());
    }

    @Test
    void sectorNamesBecomeSectorsOnlyForSmallPlaces() {
        assertEquals(AreaType.SECTOR, classify("place", "suburb", "name", "Sector 88").type());
        assertEquals(AreaType.SECTOR, classify("place", "neighbourhood", "name", "sector-15A").type());
        assertEquals(AreaType.TOWN, classify("place", "town", "name", "Sector 88").type());
        assertEquals(AreaType.SUBURB, classify("place", "suburb", "name", "Sector Road Colony").type());
    }

    @Test
    void administrativeLevelsMapWhenThereIsNoPlaceTag() {
        assertEquals(AreaType.DISTRICT, classify("boundary", "administrative", "admin_level", "6").type());
        assertEquals(AreaType.MUNICIPALITY, classify("boundary", "administrative", "admin_level", "8").type());
        assertEquals(AreaType.LOCALITY, classify("boundary", "administrative", "admin_level", "10").type());
        assertEquals(SkipReason.UNMAPPED_ADMIN_LEVEL, classify("boundary", "administrative", "admin_level", "4").skipReason());
        assertEquals(SkipReason.UNMAPPED_ADMIN_LEVEL, classify("boundary", "administrative", "admin_level", "11").skipReason());
        assertEquals(SkipReason.UNMAPPED_ADMIN_LEVEL, classify("boundary", "administrative", "admin_level", "x").skipReason());
    }

    @Test
    void placeTagWinsOverAdministrativeLevel() {
        assertEquals(AreaType.CITY, classify("place", "city", "boundary", "administrative", "admin_level", "8").type());
    }

    @Test
    void pointsOfInterestAndOtherFeaturesAreNeverAreas() {
        for (String key : new String[] {"amenity", "shop", "tourism", "building", "highway", "railway", "public_transport", "healthcare", "office", "leisure"}) {
            OsmAreaTypeMapper.Decision decision = classify(key, "anything", "place", "village", "name", "X");
            assertFalse(decision.isArea(), key);
            assertEquals(SkipReason.EXCLUDED_FEATURE, decision.skipReason(), key);
        }
    }

    @Test
    void unknownPlacesAndPlainNamedObjectsAreSkipped() {
        assertEquals(SkipReason.UNMAPPED_PLACE, classify("place", "island", "name", "X").skipReason());
        assertEquals(SkipReason.UNMAPPED_PLACE, classify("place", "state", "name", "X").skipReason());
        assertEquals(SkipReason.UNMAPPED_TAGS, classify("name", "Something").skipReason());
        assertTrue(classify("place", "village").isArea());
    }
}
