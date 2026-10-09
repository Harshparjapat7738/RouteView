package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.routing.RoutingException;
import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.model.RouteCandidate;

class GoogleRoutesResponseMapperTest {

    private static Map<String, Object> route(Object distance, Object duration, Object polyline, Object description) {
        Map<String, Object> route = new java.util.HashMap<>();
        route.put("distanceMeters", distance);
        route.put("duration", duration);
        route.put("polyline", polyline == null ? null : Map.of("encodedPolyline", polyline));
        route.put("description", description);
        return route;
    }

    private static Map<String, Object> response(Object... routes) {
        return Map.of("routes", List.of(routes));
    }

    @Test
    void mapsAllAlternativesInProviderOrder() {
        List<RouteCandidate> result = GoogleRoutesResponseMapper.map(response(
                route(28400, "2520s", "abc", "via NH19"),
                route(30100L, "2700s", "def", "via Sector 88")));

        assertEquals(2, result.size());
        assertEquals(new RouteCandidate(28400, 2520, "abc", "via NH19"), result.get(0));
        assertEquals(new RouteCandidate(30100, 2700, "def", "via Sector 88"), result.get(1));
    }

    @Test
    void handlesASingleRoute() {
        assertEquals(1, GoogleRoutesResponseMapper.map(response(route(100, "60s", "abc", null))).size());
    }

    @Test
    void missingOrEmptyRoutesMeansNoRoute() {
        assertTrue(GoogleRoutesResponseMapper.map(Map.of()).isEmpty());
        assertTrue(GoogleRoutesResponseMapper.map(Map.of("routes", List.of())).isEmpty());
    }

    @Test
    void parsesFractionalDurationAndOmittedDistanceAndDescription() {
        RouteCandidate candidate =
                GoogleRoutesResponseMapper.map(response(route(null, "165.6s", "abc", null))).get(0);

        assertEquals(166, candidate.durationSeconds());
        assertEquals(0, candidate.distanceMeters());
        assertEquals("", candidate.summary());
    }

    @Test
    void capsTheNumberOfRoutes() {
        Object[] many = new Object[GoogleRoutesResponseMapper.MAX_ROUTES + 3];
        java.util.Arrays.fill(many, route(1, "1s", "abc", null));

        assertEquals(GoogleRoutesResponseMapper.MAX_ROUTES, GoogleRoutesResponseMapper.map(response(many)).size());
    }

    @Test
    void rejectsUnexpectedShapes() {
        assertInvalid(Map.of("routes", "nope"));
        assertInvalid(response("not an object"));
        assertInvalid(response(route(1, "1s", null, null)));
        assertInvalid(response(route(1, "1s", "  ", null)));
        assertInvalid(response(route(1, null, "abc", null)));
        assertInvalid(response(route(1, "soon", "abc", null)));
        assertInvalid(response(route(1, 60, "abc", null)));
        assertInvalid(response(route("far", "60s", "abc", null)));
        assertInvalid(response(route(-5, "60s", "abc", null)));
    }

    private static void assertInvalid(Map<String, Object> body) {
        RoutingException ex = assertThrows(RoutingException.class, () -> GoogleRoutesResponseMapper.map(body));
        assertEquals(Reason.INVALID_RESPONSE, ex.getReason());
    }
}
