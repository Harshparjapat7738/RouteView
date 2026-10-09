package com.routeview.area.ingest.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.area.ingest.AreaImportProperties;
import com.routeview.area.ingest.AreaImportSink;
import com.routeview.area.ingest.NormalizedArea;
import com.routeview.area.ingest.RejectionReason;
import com.routeview.area.ingest.SkipReason;
import com.routeview.area.model.AreaType;

/** The OSM provider end to end on the synthetic structure fixture (a saved Overpass file). */
class OpenStreetMapProviderTest {

    @Test
    void producesNormalizedAreasSkipsNonAreasAndRejectsBrokenOnes() throws IOException {
        Path file = Files.createTempFile("overpass-fixture", ".osm");
        try (var in = OpenStreetMapProviderTest.class.getResourceAsStream("/osm/overpass-structure-fixture.osm")) {
            Files.write(file, in.readAllBytes());
        }

        Map<String, NormalizedArea> areas = new HashMap<>();
        Map<SkipReason, Integer> skipped = new HashMap<>();
        Map<String, RejectionReason> rejected = new HashMap<>();
        List<String[]> links = new ArrayList<>();

        new OpenStreetMapAreaDataProvider(new AreaImportProperties(true, "", file.toString(), "", 100, 1, 0, 0)).read(null, new AreaImportSink() {
            @Override
            public void accept(NormalizedArea area) {
                areas.put(area.externalId() + "#" + areas.size(), area);
            }

            @Override
            public void skipped(SkipReason reason) {
                skipped.merge(reason, 1, Integer::sum);
            }

            @Override
            public void rejected(String externalId, RejectionReason reason, String detail) {
                rejected.put(externalId, reason);
            }

            @Override
            public void parentLink(String child, String parent) {
                links.add(new String[] {child, parent});
            }
        });
        Files.delete(file);

        Map<String, NormalizedArea> byId = new HashMap<>();
        areas.values().forEach(a -> byId.putIfAbsent(a.externalId(), a));

        assertEquals(AreaType.DISTRICT, byId.get("relation/101").areaType());
        assertEquals(AreaType.TOWN, byId.get("relation/102").areaType());
        assertEquals(AreaType.VILLAGE, byId.get("way/201").areaType());
        assertEquals(AreaType.SECTOR, byId.get("way/202").areaType());
        assertEquals(AreaType.CITY, byId.get("relation/105").areaType());
        assertEquals(AreaType.MUNICIPALITY, byId.get("relation/106").areaType());
        assertEquals("Sector 88", byId.get("way/202").name());
        assertEquals("openstreetmap", byId.get("way/201").source());
        assertEquals("6", byId.get("relation/101").sourceMetadata().get("admin_level"));

        assertEquals(RejectionReason.INCOMPLETE_BOUNDARY, rejected.get("relation/103"));
        assertEquals(RejectionReason.NO_NAME, rejected.get("way/205"));
        assertTrue(!byId.containsKey("way/204") && !byId.containsKey("way/206"), "POIs and roads are never areas");
        assertEquals(2, skipped.get(SkipReason.EXCLUDED_FEATURE));
        assertEquals(1, skipped.get(SkipReason.UNMAPPED_ADMIN_LEVEL));
        assertEquals(1, skipped.get(SkipReason.UNMAPPED_TAGS)); // the place node has no boundary
        assertTrue(links.stream().anyMatch(l -> l[0].equals("relation/107") && l[1].equals("relation/106")));
    }
}
