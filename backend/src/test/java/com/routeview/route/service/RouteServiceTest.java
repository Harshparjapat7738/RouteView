package com.routeview.route.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.common.error.BadRequestException;
import com.routeview.common.geo.Coordinates;
import com.routeview.route.model.DetectedRoute;
import com.routeview.route.model.Route;
import com.routeview.area.detection.AreaDetector;
import com.routeview.routing.RoutingException;
import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.RoutingProvider;
import com.routeview.routing.model.RouteCandidate;

class RouteServiceTest {

    private static final AreaDetector NO_AREAS = route -> List.of();
    private static final Coordinates START = new Coordinates(28.3354, 77.4231);
    private static final Coordinates DESTINATION = new Coordinates(28.4089, 77.3178);

    @Test
    void numbersAlternativesInProviderOrderWithUniqueIds() {
        RouteService service = new RouteService(request -> List.of(
                new RouteCandidate(28400, 2520, "abc", "via NH19"),
                new RouteCandidate(30100, 2700, "def", "via Sector 88")), NO_AREAS);

        List<Route> routes = service.calculateRoutes(START, DESTINATION).stream().map(DetectedRoute::route).toList();

        assertEquals(2, routes.size());
        assertEquals(0, routes.get(0).index());
        assertEquals(1, routes.get(1).index());
        assertEquals("def", routes.get(1).encodedPolyline());
        assertEquals(30100, routes.get(1).distanceMeters());
        assertNotEquals(routes.get(0).id(), routes.get(1).id());
    }

    @Test
    void returnsNoRoutesWhenProviderFindsNone() {
        assertTrue(new RouteService(request -> List.of(), NO_AREAS).calculateRoutes(START, DESTINATION).isEmpty());
    }

    @Test
    void passesBothPointsToTheProvider() {
        RoutingProvider provider = request -> {
            assertSame(START, request.origin());
            assertSame(DESTINATION, request.destination());
            return List.of();
        };

        new RouteService(provider, NO_AREAS).calculateRoutes(START, DESTINATION);
    }

    @Test
    void rejectsIdenticalStartAndDestinationWithoutCallingTheProvider() {
        RouteService service = new RouteService(request -> {
            throw new AssertionError("provider must not be called");
        }, NO_AREAS);

        assertThrows(BadRequestException.class, () -> service.calculateRoutes(START, new Coordinates(28.3354, 77.4231)));
    }

    @Test
    void providerFailuresPropagate() {
        RouteService service = new RouteService(request -> {
            throw new RoutingException(Reason.UNAVAILABLE, "down");
        }, NO_AREAS);

        RoutingException ex = assertThrows(RoutingException.class, () -> service.calculateRoutes(START, DESTINATION));
        assertEquals(Reason.UNAVAILABLE, ex.getReason());
    }
}
