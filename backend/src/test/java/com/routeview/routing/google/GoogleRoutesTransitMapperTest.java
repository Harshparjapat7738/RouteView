package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitStep.Kind;

class GoogleRoutesTransitMapperTest {

    private static Map<String, Object> walk(long meters, String duration) {
        return Map.of("travelMode", "WALK", "distanceMeters", meters, "staticDuration", duration);
    }

    private static Map<String, Object> ride(String line, String vehicle, String from, String to, String dep, String arr, int stops) {
        return Map.of(
                "travelMode", "TRANSIT",
                "distanceMeters", 9000,
                "staticDuration", "900s",
                "transitDetails", Map.of(
                        "stopDetails", Map.of(
                                "departureStop", Map.of("name", from),
                                "arrivalStop", Map.of("name", to),
                                "departureTime", dep,
                                "arrivalTime", arr),
                        "headsign", "Huda City Centre",
                        "transitLine", Map.of("name", line, "vehicle", Map.of("type", vehicle)),
                        "stopCount", stops));
    }

    private static Map<String, Object> transitRoute(List<Map<String, Object>> steps) {
        return Map.of(
                "distanceMeters", 31000,
                "duration", "3000s",
                "polyline", Map.of("encodedPolyline", "abc"),
                "legs", List.of(Map.of("steps", steps)));
    }

    @Test
    void keepsRidesWalksStopsTimesAndTransfers() {
        Map<String, Object> response = Map.of("routes", List.of(transitRoute(List.of(
                walk(300, "240s"),
                ride("Violet Line", "SUBWAY", "Badarpur", "Central Secretariat", "2026-10-08T05:00:00Z", "2026-10-08T05:20:00Z", 9),
                ride("Yellow Line", "SUBWAY", "Central Secretariat", "Huda City Centre", "2026-10-08T05:25:00Z", "2026-10-08T05:50:00Z", 12),
                walk(500, "420s")))));

        RouteCandidate route = GoogleRoutesResponseMapper.map(response).get(0);
        TransitInfo transit = route.transit();

        assertNotNull(transit);
        assertEquals(4, transit.steps().size());
        assertEquals(1, transit.transfers());
        assertEquals("2026-10-08T05:00:00Z", transit.departureTime());
        assertEquals("2026-10-08T05:50:00Z", transit.arrivalTime());
        assertEquals(Kind.WALK, transit.steps().get(0).kind());
        assertEquals(300, transit.steps().get(0).distanceMeters());
        assertEquals(240, transit.steps().get(0).durationSeconds());
        assertEquals("Violet Line", transit.steps().get(1).lineName());
        assertEquals("SUBWAY", transit.steps().get(1).vehicleType());
        assertEquals("Badarpur", transit.steps().get(1).departureStop());
        assertEquals("Central Secretariat", transit.steps().get(1).arrivalStop());
        assertEquals(9, transit.steps().get(1).stopCount());
    }

    @Test
    void reportsTheActualVehicleTypeEvenWhenAnotherModeWasPreferred() {
        Map<String, Object> response = Map.of("routes", List.of(transitRoute(List.of(
                ride("City Bus 12", "BUS", "A", "B", "2026-10-08T05:00:00Z", "2026-10-08T05:10:00Z", 4)))));

        assertEquals("BUS", GoogleRoutesResponseMapper.map(response).get(0).transit().steps().get(0).vehicleType());
    }

    @Test
    void roadRoutesHaveNoTransitDetails() {
        Map<String, Object> response = Map.of("routes", List.of(Map.of(
                "distanceMeters", 28400, "duration", "2520s", "polyline", Map.of("encodedPolyline", "abc"))));

        RouteCandidate route = GoogleRoutesResponseMapper.map(response).get(0);

        assertNull(route.transit());
        assertTrue(route.warnings().isEmpty());
    }

    @Test
    void malformedTransitDetailsNeverInvalidateTheRoute() {
        Map<String, Object> response = Map.of("routes", List.of(Map.of(
                "distanceMeters", 100, "duration", "60s", "polyline", Map.of("encodedPolyline", "abc"),
                "legs", "not a list")));

        assertNull(GoogleRoutesResponseMapper.map(response).get(0).transit());
    }

    @Test
    void providerWarningsAreKept() {
        Map<String, Object> response = Map.of("routes", List.of(Map.of(
                "distanceMeters", 100, "duration", "60s", "polyline", Map.of("encodedPolyline", "abc"),
                "warnings", List.of("This route may be missing sidewalks."))));

        assertEquals(List.of("This route may be missing sidewalks."), GoogleRoutesResponseMapper.map(response).get(0).warnings());
    }

    @Test
    void noRoutesStaysEmptyInsteadOfInventingAnyForTransit() {
        assertTrue(GoogleRoutesResponseMapper.map(Map.of()).isEmpty());
    }
}
