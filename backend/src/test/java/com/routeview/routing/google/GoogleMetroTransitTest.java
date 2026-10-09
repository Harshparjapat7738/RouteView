package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.common.geo.Coordinates;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.RoutingRequest;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

class GoogleMetroTransitTest {

    private static final Coordinates A = new Coordinates(28.4089, 77.3178);
    private static final Coordinates B = new Coordinates(28.4595, 77.0266);

    private static Map<String, Object> body(TravelMode mode, TransitOptions options) {
        return GoogleRoutesRequestFactory.build(new RoutingRequest(A, B, mode, options));
    }

    private static Map<String, Object> route(Map<String, Object> travelAdvisory) {
        Map<String, Object> ride = Map.of(
                "travelMode", "TRANSIT", "distanceMeters", 9000, "staticDuration", "900s",
                "transitDetails", Map.of(
                        "stopDetails", Map.of(
                                "departureStop", Map.of("name", "Rajiv Chowk", "location", Map.of("latLng", Map.of("latitude", 28.6328, "longitude", 77.2197))),
                                "arrivalStop", Map.of("name", "Mandi House", "location", Map.of("latLng", Map.of("latitude", 28.6259, "longitude", 77.2342)))),
                        "headsign", "Noida Electronic City",
                        "transitLine", Map.of("name", "Blue Line", "nameShort", "B", "color", "#0000ff", "vehicle", Map.of("type", "SUBWAY")),
                        "stopCount", 2));
        Map<String, Object> route = new java.util.HashMap<>(Map.of(
                "distanceMeters", 9000, "duration", "900s", "polyline", Map.of("encodedPolyline", "abc"),
                "legs", List.of(Map.of("steps", List.of(ride)))));
        if (travelAdvisory != null) {
            route.put("travelAdvisory", travelAdvisory);
        }
        return route;
    }

    private static TransitInfo transitOf(Map<String, Object> route) {
        RouteCandidate candidate = GoogleRoutesResponseMapper.map(Map.of("routes", List.of(route))).get(0);
        return candidate.transit();
    }

    @Test
    void metroIsATransitRequestPreferringSubwayAndNeverAFakeGoogleMode() {
        Map<String, Object> body = body(TravelMode.METRO, TransitOptions.NONE);
        assertEquals("TRANSIT", body.get("travelMode"));
        assertEquals(List.of("SUBWAY"), ((Map<?, ?>) body.get("transitPreferences")).get("allowedTravelModes"));
        assertEquals(true, body.get("computeAlternativeRoutes"));
        assertFalse(body.containsKey("routingPreference"), "Google rejects routingPreference for transit");
        assertFalse(body.containsKey("departureTime") || body.containsKey("arrivalTime"), "leave now: the provider's default");
    }

    @Test
    void requestsTheFareAndStopLocations() {
        String mask = GoogleRoutesRequestFactory.fieldMask(TravelMode.METRO);
        assertTrue(mask.contains("routes.travelAdvisory.transitFare"));
        assertTrue(mask.contains("routes.legs.steps.transitDetails"));
        assertFalse(GoogleRoutesRequestFactory.fieldMask(TravelMode.WALKING).contains("transitFare"));
        assertFalse(GoogleRoutesRequestFactory.fieldMask(TravelMode.FOUR_WHEELER).contains("transitFare"));
    }

    @Test
    void sendsTransitPreferenceAndTimesOnlyWhenAsked() {
        Instant leave = Instant.parse("2026-10-09T05:00:00Z");
        Map<String, Object> body = body(TravelMode.METRO, new TransitOptions(TransitOptions.Preference.FEWER_TRANSFERS, leave, null));
        assertEquals("FEWER_TRANSFERS", ((Map<?, ?>) body.get("transitPreferences")).get("routingPreference"));
        assertEquals("2026-10-09T05:00:00Z", body.get("departureTime"));
        assertFalse(body.containsKey("arrivalTime"));

        Map<String, Object> arriveBy = body(TravelMode.METRO, new TransitOptions(null, null, leave));
        assertEquals("2026-10-09T05:00:00Z", arriveBy.get("arrivalTime"));
        assertFalse(((Map<?, ?>) arriveBy.get("transitPreferences")).containsKey("routingPreference"));
    }

    @Test
    void departureAndArrivalTimeCannotBeCombined() {
        Instant t = Instant.parse("2026-10-09T05:00:00Z");
        assertThrows(IllegalArgumentException.class, () -> new TransitOptions(null, t, t));
    }

    @Test
    void readsTheFareExactlyAsReported() {
        TransitInfo transit = transitOf(route(Map.of("transitFare", Map.of("currencyCode", "INR", "units", "40"))));
        assertEquals("INR", transit.fare().currency());
        assertEquals("40", transit.fare().amount());
        TransitInfo withNanos = transitOf(route(Map.of("transitFare", Map.of("currencyCode", "INR", "units", "22", "nanos", 500_000_000))));
        assertEquals("22.5", withNanos.fare().amount());
    }

    @Test
    void aMissingOrUnusableFareIsUnknownNotZero() {
        assertNull(transitOf(route(null)).fare());
        assertNull(transitOf(route(Map.of())).fare());
        assertNull(transitOf(route(Map.of("transitFare", Map.of("currencyCode", "INR")))).fare(), "zero is not a fare");
        assertNull(transitOf(route(Map.of("transitFare", Map.of("currencyCode", "rupees", "units", "10")))).fare());
        assertNull(transitOf(route(Map.of("transitFare", Map.of("currencyCode", "INR", "units", "abc")))).fare());
    }

    @Test
    void keepsStopLocationsLineColourAndShortName() {
        TransitInfo.TransitStep ride = transitOf(route(null)).steps().get(0);
        assertEquals("Rajiv Chowk", ride.departureStop());
        assertEquals(28.6328, ride.departureLatitude(), 1e-9);
        assertEquals(77.2342, ride.arrivalLongitude(), 1e-9);
        assertEquals("#0000FF", ride.lineColor());
        assertEquals("B", ride.lineShortName());
        assertEquals(2, ride.stopCount());
        assertNotNull(ride.headsign());
    }

    @Test
    void ignoresInvalidStopLocationsAndColours() {
        Map<String, Object> bad = route(null);
        @SuppressWarnings("unchecked")
        Map<String, Object> step = (Map<String, Object>) ((List<?>) ((Map<?, ?>) ((List<?>) bad.get("legs")).get(0)).get("steps")).get(0);
        Map<String, Object> details = new java.util.HashMap<>((Map<String, Object>) step.get("transitDetails"));
        details.put("stopDetails", Map.of("departureStop", Map.of("name", "X", "location", Map.of("latLng", Map.of("latitude", 999.0, "longitude", 77.0)))));
        details.put("transitLine", Map.of("name", "Line", "color", "blue", "vehicle", Map.of("type", "SUBWAY")));
        Map<String, Object> mutated = new java.util.HashMap<>(step);
        mutated.put("transitDetails", details);
        bad.put("legs", List.of(Map.of("steps", List.of(mutated))));
        TransitInfo.TransitStep ride = transitOf(bad).steps().get(0);
        assertNull(ride.departureLatitude());
        assertEquals("", ride.lineColor());
    }
}
