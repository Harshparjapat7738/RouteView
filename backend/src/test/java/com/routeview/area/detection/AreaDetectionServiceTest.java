package com.routeview.area.detection;

import static com.routeview.area.detection.CandidateFactory.candidate;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.LineString;

import com.routeview.area.model.AreaType;
import com.routeview.common.geo.Coordinates;
import com.routeview.route.model.DetectedRoute;
import com.routeview.route.model.Route;
import com.routeview.route.service.RouteService;
import com.routeview.spatial.TestPolylines;
import com.routeview.routing.model.RouteCandidate;

class AreaDetectionServiceTest {

    private static final Coordinates START = new Coordinates(28.30, 77.40);
    private static final Coordinates DESTINATION = new Coordinates(28.40, 77.30);

    private static String encode(double... latLng) {
        return TestPolylines.encode(latLng);
    }

    private static Route route(int index, String polyline) {
        return new Route("route-" + index, index, 20_000, 1800, polyline, "");
    }

    private static final String ROUTE_A = encode(28.30, 77.40, 28.35, 77.35, 28.40, 77.30);
    private static final String ROUTE_B = encode(28.30, 77.40, 28.36, 77.33, 28.40, 77.30);

    /** Fake spatial query that answers by the route it is given, like the database would. */
    private static final class FakeSource implements RouteAreaCandidateSource {
        final List<LineString> routesQueried = new ArrayList<>();
        double toleranceSeen;
        Set<AreaType> typesSeen;

        @Override
        public List<RouteAreaCandidate> findCandidates(LineString route, double toleranceMeters, Set<AreaType> types,
                double boundaryBandMeters, double minVisitMeters) {
            routesQueried.add(route);
            toleranceSeen = toleranceMeters;
            typesSeen = types;
            double middleLatitude = route.getCoordinateN(1).y;
            String prefix = middleLatitude == 28.35 ? "A" : "B";
            return List.of(
                    candidate(prefix + "3", AreaType.CITY, 15000, 4000),
                    candidate(prefix + "1", AreaType.VILLAGE, 500, 900),
                    candidate(prefix + "2", AreaType.TOWN, 8000, 2500));
        }
    }

    @Test
    void routesKeepTheirOwnAreasAndEachRouteCostsOneQuery() {
        FakeSource source = new FakeSource();
        AreaDetectionService service = new AreaDetectionService(source, AreaDetectionProperties.defaults());
        RouteService routes = new RouteService(
                request -> List.of(
                        new RouteCandidate(20_000, 1800, ROUTE_A, "via A"),
                        new RouteCandidate(21_000, 1900, ROUTE_B, "via B")),
                service);

        List<DetectedRoute> result = routes.calculateRoutes(START, DESTINATION);

        assertEquals(2, result.size());
        assertEquals(List.of("A1", "A2", "A3"), result.get(0).detectedAreas().stream().map(DetectedArea::name).toList());
        assertEquals(List.of("B1", "B2", "B3"), result.get(1).detectedAreas().stream().map(DetectedArea::name).toList());
        assertEquals(2, source.routesQueried.size());
        assertEquals(4326, source.routesQueried.get(0).getSRID());
        assertEquals(AreaDetectionProperties.DEFAULT_TOLERANCE_METERS, source.toleranceSeen);
        assertTrue(source.typesSeen.contains(AreaType.VILLAGE));
        assertTrue(!source.typesSeen.contains(AreaType.OTHER));
    }

    @Test
    void aRouteWithNoAreasIsStillAValidResult() {
        AreaDetectionService service = new AreaDetectionService(
                (route, tolerance, types, boundaryBand, minVisit) -> List.of(), AreaDetectionProperties.defaults());

        assertTrue(service.detectAreas(route(0, ROUTE_A)).isEmpty());
    }

    @Test
    void invalidOrMissingGeometryNeverReachesTheDatabaseAndNeverThrows() {
        AreaDetectionService service = new AreaDetectionService((route, tolerance, types, boundaryBand, minVisit) -> {
            throw new AssertionError("the database must not be queried");
        }, AreaDetectionProperties.defaults());

        assertTrue(service.detectAreas(route(0, "")).isEmpty());
        assertTrue(service.detectAreas(route(0, "\u0001garbage")).isEmpty());
        assertTrue(service.detectAreas(route(0, encode(28.3, 77.4))).isEmpty()); // one point
        assertTrue(service.detectAreas(route(0, encode(28.3, 77.4, 28.3, 77.4))).isEmpty()); // no length
    }

    @Test
    void databaseOrSpatialQueryFailureDoesNotFailRouteCalculation() {
        AreaDetectionService failing = new AreaDetectionService((route, tolerance, types, boundaryBand, minVisit) -> {
            throw new IllegalStateException("connection refused: secret-host");
        }, AreaDetectionProperties.defaults());
        RouteService routes = new RouteService(
                request -> List.of(new RouteCandidate(20_000, 1800, ROUTE_A, "via A")), failing);

        List<DetectedRoute> result = routes.calculateRoutes(START, DESTINATION);

        assertEquals(1, result.size());
        assertTrue(result.get(0).detectedAreas().isEmpty());
        assertEquals(ROUTE_A, result.get(0).route().encodedPolyline());
    }

    @Test
    void invalidAreaDataReturnedByTheQueryIsDroppedNotThrown() {
        AreaDetectionService service = new AreaDetectionService((route, tolerance, types, boundaryBand, minVisit) -> List.of(
                candidate(java.util.UUID.randomUUID(), "Broken", AreaType.VILLAGE, Double.NaN, Double.NaN, Double.NaN, 1),
                candidate("Fine", AreaType.VILLAGE, 1000, 900)), AreaDetectionProperties.defaults());

        assertEquals(List.of("Fine"), service.detectAreas(route(0, ROUTE_A)).stream().map(DetectedArea::name).toList());
    }
}
