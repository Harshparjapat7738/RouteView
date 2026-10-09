package com.routeview.spatial;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.LineString;

class RouteGeometryTest {

    /** The reference example of the polyline algorithm: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453). */
    private static final String REFERENCE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

    @Test
    void decodesLongitudeLatitudeInSrid4326() {
        LineString line = RouteGeometry.fromEncodedPolyline(REFERENCE, 100);

        assertEquals(3, line.getNumPoints());
        assertEquals(4326, line.getSRID());
        assertEquals(-120.2, line.getCoordinateN(0).x, 1e-9);
        assertEquals(38.5, line.getCoordinateN(0).y, 1e-9);
        assertEquals(-126.453, line.getCoordinateN(2).x, 1e-9);
        assertEquals(43.252, line.getCoordinateN(2).y, 1e-9);
    }

    @Test
    void rejectsMissingMalformedAndOversizedGeometry() {
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline(null, 100));
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline("  ", 100));
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline("\u0001\u0002", 100));
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline("_p~iF", 100)); // truncated
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline(REFERENCE, 2)); // too many vertices
    }

    @Test
    void rejectsASinglePointAndAZeroLengthLine() {
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline("_p~iF~ps|U", 100));
        assertThrows(IllegalArgumentException.class, () -> RouteGeometry.fromEncodedPolyline("_p~iF~ps|U??", 100));
    }
}
