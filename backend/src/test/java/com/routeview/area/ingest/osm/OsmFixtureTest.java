package com.routeview.area.ingest.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.MultiPolygon;

import com.routeview.area.ingest.ImportRegion;

/** Reads the synthetic structure fixture (not area data) through the XML reader and geometry assembler. */
class OsmFixtureTest {

    static List<OsmFeature> readFixture() throws IOException {
        List<OsmFeature> features = new ArrayList<>();
        try (InputStream in = OsmFixtureTest.class.getResourceAsStream("/osm/overpass-structure-fixture.osm")) {
            assertNotNull(in);
            OsmXmlReader.read(in, features::add);
        }
        return features;
    }

    private static OsmFeature feature(List<OsmFeature> all, String externalId) {
        return all.stream().filter(f -> f.externalId().equals(externalId)).findFirst().orElseThrow();
    }

    @Test
    void readsAllTopLevelElementsWithTagsAndInlineGeometry() throws IOException {
        List<OsmFeature> all = readFixture();
        assertEquals(16, all.size());
        OsmFeature district = feature(all, "relation/101");
        assertEquals("Fixture District", district.tags().get("name"));
        assertEquals(2, district.outerLines().size());
        assertEquals(List.of(102L), district.subareaRelationIds());
        assertEquals(5, feature(all, "way/201").outerLines().get(0).size());
        assertEquals(1, feature(all, "relation/102").innerLines().size());
        assertEquals(OsmFeature.Kind.NODE, feature(all, "node/301").kind());
    }

    @Test
    void wayFragmentsAreJoinedIntoOneRingAndHolesAreKept() throws IOException {
        List<OsmFeature> all = readFixture();
        OsmGeometryAssembler assembler = new OsmGeometryAssembler();

        MultiPolygon district = (MultiPolygon) assembler.assemble(feature(all, "relation/101")).geometry();
        assertEquals(1, district.getNumGeometries());
        assertTrue(district.isValid());

        MultiPolygon town = (MultiPolygon) assembler.assemble(feature(all, "relation/102")).geometry();
        assertEquals(1, ((org.locationtech.jts.geom.Polygon) town.getGeometryN(0)).getNumInteriorRing());
        assertTrue(town.isValid());
    }

    @Test
    void anOpenRingIsReportedAsIncomplete() throws IOException {
        OsmGeometryAssembler.Assembly assembly = new OsmGeometryAssembler().assemble(feature(readFixture(), "relation/103"));
        assertEquals(null, assembly.geometry());
        assertNotNull(assembly.problem());
    }

    @Test
    void externalEntitiesAreNotResolved() {
        String xml = "<?xml version=\"1.0\"?><!DOCTYPE osm [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><osm><node id=\"1\" lat=\"1\" lon=\"1\"><tag k=\"name\" v=\"&x;\"/></node></osm>";
        List<OsmFeature> read = new ArrayList<>();
        try {
            OsmXmlReader.read(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)), read::add);
        } catch (IOException expected) {
            // refusing the DOCTYPE is fine too
        }
        read.forEach(f -> assertTrue(f.tags().getOrDefault("name", "").isEmpty() || !f.tags().get("name").contains("root:")));
    }

    @Test
    void aRemarkFromOverpassIsAnError() {
        String xml = "<osm><remark> runtime error: Query timed out </remark></osm>";
        assertThrows(IOException.class, () -> OsmXmlReader.read(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)), f -> { }));
    }

    @Test
    void nonOsmXmlIsRefused() {
        assertThrows(IOException.class, () -> OsmXmlReader.read(new ByteArrayInputStream("<html/>".getBytes(StandardCharsets.UTF_8)), f -> { }));
        assertThrows(IOException.class, () -> OsmXmlReader.read(new ByteArrayInputStream("not xml".getBytes(StandardCharsets.UTF_8)), f -> { }));
    }

    @Test
    void queryOnlyAsksForMappedPlacesAndLevels() {
        String query = OverpassQueryBuilder.build(new ImportRegion(28.3, 77.2, 28.5, 77.4));
        assertTrue(query.contains("(28.300000,77.200000,28.500000,77.400000)"));
        assertTrue(query.contains("^(10|6|7|8|9)$") || query.contains("^(10|6|7|8|9)"));
        assertTrue(query.contains("borough|city|hamlet|locality|neighbourhood|quarter|suburb|town|village"));
        assertTrue(!query.contains("amenity") && !query.contains("shop") && !query.contains("highway"));
        assertTrue(query.endsWith("out geom;\n"));
    }
}
