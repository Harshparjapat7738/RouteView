package com.routeview.spatial;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;

import com.routeview.spatial.InvalidRouteGeometryException.Reason;

class RouteGeometryNormalizerTest {

    private static final GeometryFactory F = SpatialReference.geometryFactory();

    private static LineString line(double... lonLat) {
        Coordinate[] cs = new Coordinate[lonLat.length / 2];
        for (int i = 0; i < cs.length; i++) {
            cs[i] = new Coordinate(lonLat[2 * i], lonLat[2 * i + 1]);
        }
        return F.createLineString(cs);
    }

    @Test
    void aValidLineKeepsLongitudeAsXAndLatitudeAsYInSrid4326() {
        LineString result = RouteGeometryNormalizer.normalize(line(77.4, 28.3, 77.3, 28.4), 100);
        assertEquals(77.4, result.getCoordinateN(0).x, 0);
        assertEquals(28.3, result.getCoordinateN(0).y, 0);
        assertEquals(4326, result.getSRID());
    }

    @Test
    void repeatedPointsAreRemovedAndAMultiLineIsJoinedInTravelOrder() {
        LineString first = line(77.4, 28.3, 77.4, 28.3, 77.35, 28.35);
        LineString second = line(77.35, 28.35, 77.3, 28.4);
        LineString joined = RouteGeometryNormalizer.normalize(F.createMultiLineString(new LineString[] {first, second}), 100);
        assertEquals(3, joined.getNumPoints());
        assertEquals(28.4, joined.getCoordinateN(2).y, 0);
    }

    @Test
    void swappedCoordinatesWithLatitudeBeyondNinetyAreRejected() {
        // latitude 120 can only happen when longitude and latitude were swapped
        InvalidRouteGeometryException e = assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(line(28.3, 120.0, 28.4, 121.0), 100));
        assertEquals(Reason.COORDINATE_OUT_OF_RANGE, e.reason());
    }

    @Test
    void emptyZeroLengthWrongSridAndWrongTypeAreRejectedWithAReason() {
        assertEquals(Reason.MISSING, assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(null, 10)).reason());
        assertEquals(Reason.NO_LENGTH, assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(line(77.4, 28.3, 77.4, 28.3), 10)).reason());
        assertEquals(Reason.TOO_MANY_VERTICES, assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(line(77.4, 28.3, 77.3, 28.4, 77.2, 28.5), 2)).reason());
        LineString otherSrid = line(77.4, 28.3, 77.3, 28.4);
        otherSrid.setSRID(3857);
        assertEquals(Reason.WRONG_SRID, assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(otherSrid, 10)).reason());
        assertEquals(Reason.UNSUPPORTED_TYPE, assertThrows(InvalidRouteGeometryException.class,
                () -> RouteGeometryNormalizer.normalize(F.createPoint(new Coordinate(77.4, 28.3)), 10)).reason());
    }
}
