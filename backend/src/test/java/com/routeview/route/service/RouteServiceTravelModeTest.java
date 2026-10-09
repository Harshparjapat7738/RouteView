package com.routeview.route.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.area.detection.AreaDetector;
import com.routeview.common.geo.Coordinates;
import com.routeview.route.model.DetectedRoute;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.TravelMode;

class RouteServiceTravelModeTest {

    private static final AreaDetector NO_AREAS = route -> List.of();
    private static final Coordinates START = new Coordinates(28.4089, 77.3178);
    private static final Coordinates DESTINATION = new Coordinates(28.4595, 77.0266);

    @Test
    void passesTheSelectedTravelModeToTheProvider() {
        List<TravelMode> seen = new ArrayList<>();
        RouteService service = new RouteService(request -> {
            seen.add(request.travelMode());
            return List.of(new RouteCandidate(1000, 600, "abc", ""));
        }, NO_AREAS);

        List<TravelMode> providerModes = new ArrayList<>(List.of(TravelMode.values()));
        providerModes.remove(TravelMode.BUS); // BUS is planned by the GTFS bus engine, not the provider
        for (TravelMode mode : providerModes) {
            service.calculateRoutes(START, DESTINATION, mode);
        }
        service.calculateRoutes(START, DESTINATION);

        assertEquals(providerModes.size() + 1, seen.size());
        assertEquals(providerModes, seen.subList(0, providerModes.size()));
        assertEquals(TravelMode.FOUR_WHEELER, seen.get(seen.size() - 1));
    }

    @Test
    void areaDetectionRunsOnTheGeometryReturnedForTheSelectedMode() {
        List<String> detectedOn = new ArrayList<>();
        AreaDetector detector = route -> {
            detectedOn.add(route.encodedPolyline());
            return List.of();
        };
        RouteService service = new RouteService(request -> List.of(
                new RouteCandidate(1000, 600, request.travelMode() == TravelMode.WALKING ? "walkLine" : "carLine", "")), detector);

        List<DetectedRoute> routes = service.calculateRoutes(START, DESTINATION, TravelMode.WALKING);

        assertEquals(List.of("walkLine"), detectedOn);
        assertEquals("walkLine", routes.get(0).route().encodedPolyline());
    }
}
