package com.routeview.bus.journey;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.common.geo.PolylineEncoder;
import com.routeview.spatial.RouteGeometry;

class PolylineEncoderTest {

    @Test
    void roundTripsAndMatchesTheGoogleReferenceExample() {
        // The documented example of the polyline format.
        assertEquals("_p~iF~ps|U_ulLnnqC_mqNvxq`@", PolylineEncoder.encode(List.of(new double[]{38.5, -120.2}, new double[]{40.7, -120.95}, new double[]{43.252, -126.453})));
        List<double[]> points = List.of(new double[]{28.60001, 77.2}, new double[]{28.6102, 77.21234}, new double[]{28.59, 77.19});
        List<double[]> back = PolylineEncoder.decode(PolylineEncoder.encode(points));
        assertEquals(3, back.size());
        for (int i = 0; i < 3; i++) {
            assertEquals(points.get(i)[0], back.get(i)[0], 1e-5);
            assertEquals(points.get(i)[1], back.get(i)[1], 1e-5);
        }
    }

    @Test
    void theRouteGeometryDecoderOfTheAreaDetectionReadsWhatWeWrite() {
        String encoded = PolylineEncoder.encode(List.of(new double[]{28.6, 77.2}, new double[]{28.61, 77.21}));
        var line = RouteGeometry.fromEncodedPolyline(encoded, 100);
        assertEquals(2, line.getNumPoints());
        assertEquals(77.2, line.getCoordinateN(0).x, 1e-5);
        assertEquals(28.61, line.getCoordinateN(1).y, 1e-5);
    }
}
