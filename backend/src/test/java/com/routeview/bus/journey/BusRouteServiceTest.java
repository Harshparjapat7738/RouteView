package com.routeview.bus.journey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
import com.routeview.metro.journey.MetroJourneyService;
import com.routeview.route.model.DetectedRoute;
import com.routeview.route.service.RouteService;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

/** Bus mode through RouteService: own engine, never the provider; the journey travels with the route; stale results cannot leak across modes. */
class BusRouteServiceTest {

    private final BusTestNetwork net = BusTestNetwork.standard();

    /** The next Monday 08:00 in Delhi (the test timetable runs on Mondays), always in the future and within a week. */
    private static Instant nextMonday8am() {
        java.time.ZonedDateTime now = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Kolkata"));
        java.time.ZonedDateTime t = now.with(java.time.temporal.TemporalAdjusters.next(java.time.DayOfWeek.MONDAY)).withHour(8).withMinute(0).withSecond(0).withNano(0);
        return t.toInstant();
    }

    private static TransitOptions at(Instant t) {
        return new TransitOptions(null, t, null);
    }

    @Test
    void busModeIsPlannedByTheBusEngineAndNeverAsksTheProvider() {
        List<TravelMode> asked = new ArrayList<>();
        RouteService service = new RouteService(request -> {
            asked.add(request.travelMode());
            return List.of(new RouteCandidate(1000, 600, "provider", ""));
        }, route -> List.of(), (MetroJourneyService) null, net.service());

        Instant soon = nextMonday8am();
        List<DetectedRoute> routes = service.calculateRoutes(net.at("A"), net.at("D"), TravelMode.BUS, at(soon));

        assertTrue(asked.isEmpty());
        assertFalse(routes.isEmpty());
        assertNotNull(routes.get(0).route().bus());
        assertNull(routes.get(0).route().metro());
    }

    @Test
    void areaDetectionRunsOnTheJourneyPolylineAndOnlyThat() {
        List<String> detectedOn = new ArrayList<>();
        AreaDetector detector = route -> {
            detectedOn.add(route.encodedPolyline());
            return List.of();
        };
        RouteService service = new RouteService(request -> List.of(), detector, (MetroJourneyService) null, net.service());
        List<DetectedRoute> routes = service.calculateRoutes(net.at("A"), net.at("D"), TravelMode.BUS, at(nextMonday8am()));
        assertFalse(routes.isEmpty());
        assertEquals(routes.size(), detectedOn.size());
        assertEquals(routes.get(0).route().encodedPolyline(), detectedOn.get(0));
        assertFalse(detectedOn.get(0).isBlank());
    }

    @Test
    void anArrivalTimeIsRejectedForBus() {
        RouteService service = new RouteService(request -> List.of(), route -> List.of(), (MetroJourneyService) null, net.service());
        TransitOptions arrive = new TransitOptions(null, null, Instant.now().plusSeconds(7200));
        assertThrows(BadRequestException.class, () -> service.calculateRoutes(net.at("A"), net.at("D"), TravelMode.BUS, arrive));
    }

    @Test
    void otherModesNeverCarryABusJourney() {
        RouteService service = new RouteService(request -> List.of(new RouteCandidate(1000, 600, "abc", "")), route -> List.of(),
                (MetroJourneyService) null, net.service());
        for (TravelMode mode : List.of(TravelMode.WALKING, TravelMode.FOUR_WHEELER, TravelMode.CYCLING)) {
            List<DetectedRoute> routes = service.calculateRoutes(net.at("A"), net.at("D"), mode);
            assertNull(routes.get(0).route().bus(), mode.name());
        }
    }

    @Test
    void anEmptyBusAnswerSaysWhy() {
        RouteService service = new RouteService(request -> List.of(), route -> List.of(), (MetroJourneyService) null, net.service());
        RouteService.BusPlan far = service.planBus(new com.routeview.common.geo.Coordinates(10.0, 10.0), net.at("D"), at(nextMonday8am()));
        assertTrue(far.routes().isEmpty());
        assertEquals(BusJourneyService.Reason.NO_STOP_NEAR_START, far.reason());
        RouteService.BusPlan ok = service.planBus(net.at("A"), net.at("D"), at(nextMonday8am()));
        assertFalse(ok.routes().isEmpty());
        assertEquals(BusJourneyService.Reason.NONE, ok.reason());
        RouteService none = new RouteService(request -> List.of(), route -> List.of());
        assertEquals(BusJourneyService.Reason.NO_BUS_DATA, none.planBus(net.at("A"), net.at("D"), null).reason());
    }

    @Test
    void busIsNotATransitProviderModeButAcceptsTimeOptions() {
        assertFalse(TravelMode.BUS.isTransit());
        assertTrue(TravelMode.BUS.acceptsTimeOptions());
        assertFalse(TravelMode.WALKING.acceptsTimeOptions());
    }
}
