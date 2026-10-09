package com.routeview.route.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.area.detection.AreaDetector;
import com.routeview.common.error.BadRequestException;
import com.routeview.common.geo.Coordinates;
import com.routeview.metro.MetroTestData;
import com.routeview.metro.journey.MetroJourneyService;
import com.routeview.metro.model.MetroStation;
import com.routeview.route.model.DetectedRoute;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitStep;
import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

class RouteServiceMetroTest {

    private static final AreaDetector NO_AREAS = route -> List.of();
    private static final Coordinates START = new Coordinates(28.5, 77.1);
    private static final Coordinates DESTINATION = new Coordinates(28.65, 77.14);
    private static final MetroJourneyService JOURNEYS = new MetroJourneyService(MetroTestData::network);

    private static RouteCandidate metroCandidate(String polyline) {
        MetroStation a = MetroTestData.network().stations().stream().filter(s -> s.name().equals("Alpha")).findFirst().orElseThrow();
        MetroStation c = MetroTestData.network().stations().stream().filter(s -> s.name().equals("Central")).findFirst().orElseThrow();
        TransitStep ride = new TransitStep(TransitStep.Kind.RIDE, "Blue Line", "SUBWAY", "Alpha", "Central", "", "", "", 2, 5000, 600,
                a.latitude(), a.longitude(), c.latitude(), c.longitude(), "", "");
        TransitInfo transit = new TransitInfo(List.of(ride), 0, null, null, new TransitInfo.TransitFare("INR", "30"));
        return new RouteCandidate(5000, 900, polyline, "", transit, List.of());
    }

    private static RouteCandidate walkOnly() {
        TransitStep walk = new TransitStep(TransitStep.Kind.WALK, "", "", "", "", "", "", "", 0, 300, 240);
        return new RouteCandidate(300, 240, "walkLine", "", new TransitInfo(List.of(walk), 0, null, null), List.of());
    }

    @Test
    void metroRoutesCarryTheirMetroJourney() {
        RouteService service = new RouteService(request -> List.of(metroCandidate("m1")), NO_AREAS, JOURNEYS);
        DetectedRoute route = service.calculateRoutes(START, DESTINATION, TravelMode.METRO).get(0);
        assertNotNull(route.route().metro());
        assertEquals("30", route.route().metro().fare().amount());
        assertEquals(List.of("Alpha", "Bravo Metro Station", "Central"), route.route().metro().stations().stream().map(s -> s.name()).toList());
    }

    @Test
    void aRouteWithoutAMetroRideIsNeverPresentedAsMetro() {
        RouteService service = new RouteService(request -> List.of(walkOnly(), metroCandidate("m1")), NO_AREAS, JOURNEYS);
        List<DetectedRoute> routes = service.calculateRoutes(START, DESTINATION, TravelMode.METRO);
        assertEquals(1, routes.size());
        assertEquals("m1", routes.get(0).route().encodedPolyline());
        assertEquals(0, routes.get(0).route().index(), "indexes are renumbered after filtering");
        assertTrue(new RouteService(request -> List.of(walkOnly()), NO_AREAS, JOURNEYS).calculateRoutes(START, DESTINATION, TravelMode.METRO).isEmpty());
    }

    @Test
    void otherModesDoNotGetAMetroJourney() {
        RouteService service = new RouteService(request -> List.of(metroCandidate("t1")), NO_AREAS, JOURNEYS);
        assertNull(service.calculateRoutes(START, DESTINATION, TravelMode.TRAIN).get(0).route().metro());
        assertNull(service.calculateRoutes(START, DESTINATION, TravelMode.FOUR_WHEELER).get(0).route().metro());
    }

    @Test
    void areaDetectionStillRunsOnTheMetroRouteGeometryOnly() {
        List<String> detectedOn = new ArrayList<>();
        AreaDetector detector = route -> {
            detectedOn.add(route.encodedPolyline());
            return List.of();
        };
        new RouteService(request -> List.of(metroCandidate("m1")), detector, JOURNEYS).calculateRoutes(START, DESTINATION, TravelMode.METRO);
        assertEquals(List.of("m1"), detectedOn, "one detection per route; stations are not areas");
    }

    @Test
    void transitOptionsReachTheProviderForMetro() {
        List<TransitOptions> seen = new ArrayList<>();
        RouteService service = new RouteService(request -> {
            seen.add(request.transitOptions());
            return List.of(metroCandidate("m1"));
        }, NO_AREAS, JOURNEYS);
        Instant soon = Instant.now().plusSeconds(3600);
        service.calculateRoutes(START, DESTINATION, TravelMode.METRO, new TransitOptions(TransitOptions.Preference.LESS_WALKING, soon, null));
        assertEquals(TransitOptions.Preference.LESS_WALKING, seen.get(0).preference());
        assertEquals(soon, seen.get(0).departureTime());
    }

    @Test
    void transitOptionsAreRejectedForOtherModesAndBadTimes() {
        RouteService service = new RouteService(request -> List.of(metroCandidate("m1")), NO_AREAS, JOURNEYS);
        Instant soon = Instant.now().plusSeconds(3600);
        assertThrows(BadRequestException.class, () -> service.calculateRoutes(START, DESTINATION, TravelMode.WALKING, new TransitOptions(null, soon, null)));
        assertThrows(BadRequestException.class, () -> service.calculateRoutes(START, DESTINATION, TravelMode.METRO, new TransitOptions(null, Instant.now().minusSeconds(7200), null)));
        assertThrows(BadRequestException.class, () -> service.calculateRoutes(START, DESTINATION, TravelMode.METRO, new TransitOptions(null, null, Instant.now().plusSeconds(200L * 86400))));
    }
}
