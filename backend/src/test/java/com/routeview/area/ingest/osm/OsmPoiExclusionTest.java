package com.routeview.area.ingest.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.area.ingest.SkipReason;

/** Points of interest and infrastructure are never areas, even when they carry a name or a place tag. */
class OsmPoiExclusionTest {

    @Test
    void poiAndInfrastructureTagsAreExcluded() {
        for (String key : new String[] {"amenity", "shop", "tourism", "building", "highway", "railway", "public_transport",
                "healthcare", "office", "leisure", "aeroway", "historic", "man_made", "bridge", "emergency", "waterway"}) {
            OsmAreaTypeMapper.Decision decision = OsmAreaTypeMapper.classify(Map.of(key, "yes", "name", "Something"));
            assertFalse(decision.isArea(), key);
            assertEquals(SkipReason.EXCLUDED_FEATURE, decision.skipReason(), key);
        }
    }

    @Test
    void aPoiTagWinsOverAPlaceTag() {
        assertFalse(OsmAreaTypeMapper.classify(Map.of("place", "village", "amenity", "school", "name", "X")).isArea());
    }

    @Test
    void unknownCategoriesAreSkippedExplicitlyNotGuessed() {
        OsmAreaTypeMapper.Decision island = OsmAreaTypeMapper.classify(Map.of("place", "island", "name", "X"));
        assertEquals(SkipReason.UNMAPPED_PLACE, island.skipReason());
        assertEquals(SkipReason.UNMAPPED_TAGS, OsmAreaTypeMapper.classify(Map.of("name", "X")).skipReason());
        assertEquals(SkipReason.UNMAPPED_ADMIN_LEVEL,
                OsmAreaTypeMapper.classify(Map.of("boundary", "administrative", "admin_level", "2", "name", "X")).skipReason());
    }
}
