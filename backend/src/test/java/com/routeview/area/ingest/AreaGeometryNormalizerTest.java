package com.routeview.area.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;

import com.routeview.spatial.SpatialReference;

class AreaGeometryNormalizerTest {

    private final AreaGeometryNormalizer normalizer = new AreaGeometryNormalizer();

    private static Geometry wkt(String text) throws ParseException {
        return new WKTReader(SpatialReference.geometryFactory()).read(text);
    }

    @Test
    void aValidPolygonBecomesAMultiPolygonWithSrid4326() throws ParseException {
        AreaGeometryNormalizer.Result result = normalizer.normalize(wkt("POLYGON((10 10, 10.1 10, 10.1 10.1, 10 10.1, 10 10))"));
        assertEquals(AreaGeometryNormalizer.Outcome.VALID, result.outcome());
        assertEquals("MultiPolygon", result.geometry().getGeometryType());
        assertEquals(4326, result.geometry().getSRID());
        assertFalse(result.wasInvalid());
    }

    @Test
    void aBowTieIsRepairedAndCounted() throws ParseException {
        AreaGeometryNormalizer.Result result = normalizer.normalize(wkt("POLYGON((11 11, 11.1 11.1, 11.1 11, 11 11.1, 11 11))"));
        assertEquals(AreaGeometryNormalizer.Outcome.REPAIRED, result.outcome());
        assertTrue(result.wasInvalid());
        assertTrue(result.geometry().isValid());
        assertFalse(result.geometry().isEmpty());
    }

    @Test
    void nullEmptyAndUnsupportedGeometriesAreRejected() throws ParseException {
        assertEquals(RejectionReason.NULL_GEOMETRY, normalizer.normalize(null).reason());
        assertEquals(RejectionReason.EMPTY_GEOMETRY, normalizer.normalize(wkt("POLYGON EMPTY")).reason());
        assertEquals(RejectionReason.UNSUPPORTED_GEOMETRY, normalizer.normalize(wkt("POINT(10 10)")).reason());
        assertEquals(RejectionReason.UNSUPPORTED_GEOMETRY, normalizer.normalize(wkt("LINESTRING(10 10, 11 11)")).reason());
    }

    @Test
    void coordinatesOutsideLongitudeLatitudeAreRejected() throws ParseException {
        AreaGeometryNormalizer.Result result = normalizer.normalize(wkt("POLYGON((200 10, 201 10, 201 11, 200 11, 200 10))"));
        assertEquals(RejectionReason.COORDINATES_OUT_OF_RANGE, result.reason());
    }

    @Test
    void aPolygonWithZeroAreaThatCannotBeRepairedIsRejected() throws ParseException {
        AreaGeometryNormalizer.Result result = normalizer.normalize(wkt("POLYGON((10 10, 11 11, 12 12, 10 10))"));
        assertEquals(AreaGeometryNormalizer.Outcome.REJECTED, result.outcome());
        assertEquals(RejectionReason.INVALID_GEOMETRY, result.reason());
        assertTrue(result.wasInvalid());
        assertNotNull(result.detail());
    }

    @Test
    void identicalInputGivesIdenticalOutput() throws ParseException {
        Geometry a = normalizer.normalize(wkt("POLYGON((10 10, 10 10.1, 10.1 10.1, 10.1 10, 10 10))")).geometry();
        Geometry b = normalizer.normalize(wkt("POLYGON((10.1 10.1, 10.1 10, 10 10, 10 10.1, 10.1 10.1))")).geometry();
        assertTrue(a.equalsExact(b));
    }

    @Test
    void slivers_and_continent_sized_polygons_are_rejected() throws ParseException {
        // ~1 m x 1 m
        assertEquals(RejectionReason.AREA_TOO_SMALL,
                normalizer.normalize(wkt("POLYGON((10 10, 10.00001 10, 10.00001 10.00001, 10 10.00001, 10 10))")).reason());
        // ~50 degrees square
        assertEquals(RejectionReason.AREA_TOO_LARGE,
                normalizer.normalize(wkt("POLYGON((10 10, 60 10, 60 60, 10 60, 10 10))")).reason());
    }
}
