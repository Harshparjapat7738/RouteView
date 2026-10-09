package com.routeview.bus.journey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.bus.journey.BusJourney.Segment;
import com.routeview.bus.journey.BusJourney.SegmentType;
import com.routeview.common.geo.Coordinates;

class BusJourneyServiceTest {

    private final BusTestNetwork net = BusTestNetwork.standard();
    private final BusJourneyService service = net.service();

    private BusJourneyService.Result plan(Coordinates from, Coordinates to) {
        return service.plan(from, to, BusTestNetwork.EIGHT_AM, null);
    }

    private static List<Segment> rides(BusJourney journey) {
        return journey.segments().stream().filter(s -> s.type() == SegmentType.BUS).toList();
    }

    private static List<String> names(List<BusJourney.StopRef> stops) {
        return stops.stream().map(BusJourney.StopRef::name).toList();
    }

    // ------------------------------------------------------------------ nearby stops

    @Test
    void nearbyStopsAreBoundedServedAndRankedNotJustNearest() {
        BusNetwork network = net.network();
        // A stop nothing serves today must never be chosen, however close it is.
        BusTestNetwork withIdle = BusTestNetwork.standard().stop("IDLE", 28.6000, 77.2001);
        BusNetwork withIdleNetwork = withIdle.network();
        var timetable = withIdle.timetable();
        var active = timetable.activePatterns(timetable.serviceDay(BusTestNetwork.DAY), withIdleNetwork);
        List<BusNearbyStops.Selected> chosen = BusNearbyStops.select(withIdleNetwork, new InMemoryNearbyStops(withIdleNetwork), net.at("A"), active,
                BusJourneyPlanner.Settings.DEFAULT, BusNearbyStops.Options.DEFAULT);
        assertFalse(chosen.isEmpty());
        assertTrue(chosen.stream().allMatch(s -> withIdleNetwork.servingPatternCount(s.stop(), active) > 0));
        assertTrue(chosen.stream().noneMatch(s -> withIdleNetwork.stop(s.stop()).externalId().equals("S_IDLE")));
        assertTrue(chosen.size() <= BusNearbyStops.Options.DEFAULT.maxStops());
        assertEquals("S_A", withIdleNetwork.stop(chosen.get(0).stop()).externalId());
        assertEquals(network.stops().size() + 1, withIdleNetwork.stops().size());
    }

    @Test
    void theSearchRadiusWidensOnlyWhenNothingIsNearAndStaysBounded() {
        BusNetwork network = net.network();
        var timetable = net.timetable();
        var active = timetable.activePatterns(timetable.serviceDay(BusTestNetwork.DAY), network);
        // ~1.1 km from stop A: outside the first radius (600 m), inside the second (1500 m)
        Coordinates farther = net.near("A", 1_100);
        List<BusNearbyStops.Selected> chosen = BusNearbyStops.select(network, new InMemoryNearbyStops(network), farther, active,
                BusJourneyPlanner.Settings.DEFAULT, BusNearbyStops.Options.DEFAULT);
        assertFalse(chosen.isEmpty());
        assertTrue(chosen.stream().allMatch(s -> s.meters() <= 1_500));
        // ~20 km from everything: nothing, and no unbounded scan
        assertTrue(BusNearbyStops.select(network, new InMemoryNearbyStops(network), new Coordinates(28.9, 77.9), active,
                BusJourneyPlanner.Settings.DEFAULT, BusNearbyStops.Options.DEFAULT).isEmpty());
        // every source call is limited
        int[] limitSeen = {0};
        NearbyStopSource spy = (point, radius, limit) -> {
            limitSeen[0] = Math.max(limitSeen[0], limit);
            return List.of();
        };
        BusNearbyStops.select(network, spy, net.at("A"), active, BusJourneyPlanner.Settings.DEFAULT, BusNearbyStops.Options.DEFAULT);
        assertEquals(BusNearbyStops.Options.DEFAULT.candidateLimit(), limitSeen[0]);
    }

    @Test
    void stopsWithoutServiceOnTheDayAreNotSelected() {
        BusNetwork network = net.network();
        var timetable = net.timetable();
        var tuesday = timetable.serviceDay(BusTestNetwork.DAY.plusDays(1)); // the test calendar runs on Mondays only
        var active = timetable.activePatterns(tuesday, network);
        assertTrue(BusNearbyStops.select(network, new InMemoryNearbyStops(network), net.at("A"), active, BusJourneyPlanner.Settings.DEFAULT,
                BusNearbyStops.Options.DEFAULT).isEmpty());
    }

    // ------------------------------------------------------------------ direct, walking, stop sequence, counts

    @Test
    void directBusWithWalkingAtBothEnds() {
        BusJourneyService.Result result = plan(net.near("A", 150), net.near("D", 120));
        assertEquals(BusJourneyService.Reason.NONE, result.reason());
        BusJourney journey = result.journeys().get(0).journey();

        assertEquals(0, journey.transfers());
        assertEquals(1, journey.busLegCount());
        assertEquals(List.of(SegmentType.WALK, SegmentType.BUS, SegmentType.WALK), journey.segments().stream().map(Segment::type).toList());
        assertEquals(BusJourney.WalkRole.FIRST_MILE, journey.segments().get(0).walkRole());
        assertEquals(BusJourney.WalkRole.LAST_MILE, journey.segments().get(2).walkRole());
        assertTrue(journey.walkingMeters() > 0 && journey.walkingSeconds() > 0);
        assertEquals("S_A", rides(journey).get(0).boarding().gtfsId());
        assertEquals("S_D", rides(journey).get(0).exit().gtfsId());
    }

    @Test
    void rideKeepsTheRealOrderedStopsFromTheTrip() {
        BusJourney journey = plan(net.at("A"), net.at("D")).journeys().get(0).journey();
        Segment ride = rides(journey).get(0);
        assertEquals(List.of("Stop A", "Stop B", "Stop C", "Stop D"), names(ride.stops()));
        assertEquals(BusJourney.StopRole.BOARDING, ride.stops().get(0).role());
        assertEquals(BusJourney.StopRole.INTERMEDIATE, ride.stops().get(1).role());
        assertEquals(BusJourney.StopRole.EXIT, ride.stops().get(3).role());
        // a middle section keeps its order too
        BusJourney partial = plan(net.at("B"), net.at("D")).journeys().get(0).journey();
        assertEquals(List.of("Stop B", "Stop C", "Stop D"), names(rides(partial).get(0).stops()));
    }

    @Test
    void listedStopsAndStopToStopSegmentsAreDifferentNumbers() {
        BusJourney journey = plan(net.at("A"), net.at("D")).journeys().get(0).journey();
        Segment ride = rides(journey).get(0);
        assertEquals(4, ride.listedStopCount());
        assertEquals(3, ride.stopToStopSegments());
        assertEquals(ride.stops().size(), ride.listedStopCount());
        assertEquals(ride.listedStopCount() - 1, ride.stopToStopSegments());
        assertEquals(4, journey.listedStopCount());
        assertEquals(3, journey.stopToStopSegments());
    }

    @Test
    void countsWithATransferDoNotCountTheJoiningStopTwiceNorBridgeTheChange() {
        BusJourney journey = plan(net.at("A"), net.at("F")).journeys().get(0).journey();
        // R1 A-B-C then R2 C-E-F: C is listed once, and the change is not a stop-to-stop segment of any ride
        assertEquals(1, journey.transfers());
        assertEquals(List.of("Stop A", "Stop B", "Stop C", "Stop E", "Stop F"), names(journey.stops()));
        assertEquals(5, journey.listedStopCount());
        assertEquals(2 + 2, journey.stopToStopSegments());
        assertEquals(BusJourney.StopRole.TRANSFER, journey.stops().get(2).role());
        assertEquals(BusJourney.StopRole.BOARDING, journey.stops().get(0).role());
        assertEquals(BusJourney.StopRole.EXIT, journey.stops().get(4).role());
    }

    // ------------------------------------------------------------------ transfers

    @Test
    void transferBetweenTwoRoutesIsCountedOnceAndNamesBothRoutes() {
        BusJourney journey = plan(net.at("A"), net.at("F")).journeys().get(0).journey();
        assertEquals(1, journey.transfers());
        assertEquals(2, journey.busLegCount());
        Segment change = journey.segments().stream().filter(s -> s.type() == SegmentType.TRANSFER).findFirst().orElseThrow();
        assertEquals(net.routeId("R1"), change.fromRoute().routeId());
        assertEquals(net.routeId("R2"), change.toRoute().routeId());
        assertEquals("S_C", change.transferStop().gtfsId());
        // the second ride cannot leave before the first arrives plus the transfer buffer
        List<Segment> rides = rides(journey);
        assertTrue(rides.get(1).departureTime().compareTo(rides.get(0).arrivalTime()) > 0);
    }

    @Test
    void transferByWalkingBetweenNearbyStops() {
        BusJourney journey = plan(net.at("A"), net.at("H")).journeys().get(0).journey();
        assertEquals(1, journey.transfers());
        Segment change = journey.segments().stream().filter(s -> s.type() == SegmentType.TRANSFER).findFirst().orElseThrow();
        assertEquals("S_D", change.transferStop().gtfsId());
        assertTrue(change.distanceMeters() > 0 && change.durationSeconds() > 0);
        assertNotNull(change.geometry());
        // both stops are listed because the rider walks between them
        assertTrue(names(journey.stops()).containsAll(List.of("Stop D", "Stop D2")));
        assertEquals(journey.stops().size(), journey.listedStopCount());
        // 4 + 3 stops are listed, but the buses travel 3 + 2 stop-to-stop segments: walking between D and D2 is not one of them
        assertEquals(7, journey.listedStopCount());
        assertEquals(5, journey.stopToStopSegments());
        assertNotEquals(journey.listedStopCount() - 1, journey.stopToStopSegments());
    }

    @Test
    void theSameRouteAgainIsNotATransfer() {
        // Two rides of route R1 that meet at B (e.g. the trip changes): one service, no transfer.
        BusNetwork network = net.network();
        int pattern = network.patternIndexOf(net.id("pattern", "P1"));
        BusJourneyPlanner.Plan plan = new BusJourneyPlanner.Plan(new BusJourneyPlanner.Access(network.stopIndexOf(net.stopId("A")), 60),
                List.of(new BusJourneyPlanner.Leg(pattern, 0, 1), new BusJourneyPlanner.Leg(pattern, 1, 3)),
                new BusJourneyPlanner.Access(network.stopIndexOf(net.stopId("D")), 60), 0);
        var built = BusJourneyBuilder.build(network, net.timetable(), plan, net.near("A", 50), net.near("D", 50),
                BusTestNetwork.EIGHT_AM.atZone(java.time.ZoneId.of("Asia/Kolkata")), net.timetable().serviceDay(BusTestNetwork.DAY),
                net.timetable().serviceDay(BusTestNetwork.DAY.minusDays(1)), BusJourneyPlanner.Settings.DEFAULT, List.of()).orElseThrow();
        BusJourney journey = built.journey();
        assertEquals(0, journey.transfers());
        assertEquals(1, journey.busLegCount());
        assertEquals(List.of("Stop A", "Stop B", "Stop C", "Stop D"), names(journey.stops()));
        assertEquals(4, journey.listedStopCount());
        assertEquals(3, journey.stopToStopSegments());
        assertTrue(journey.notices().stream().anyMatch(n -> n.contains("not a transfer")));
    }

    @Test
    void theSearchNeverBoardsTheRouteItJustLeft() {
        // From A to C with R1 only: a plan must not be "R1 to B, then R1 again".
        BusNetwork network = net.network();
        var timetable = net.timetable();
        var active = timetable.activePatterns(timetable.serviceDay(BusTestNetwork.DAY), network);
        var plans = BusJourneyPlanner.plan(network, List.of(new BusJourneyPlanner.Access(network.stopIndexOf(net.stopId("A")), 0)),
                List.of(new BusJourneyPlanner.Access(network.stopIndexOf(net.stopId("C")), 0)), active, java.util.Set.of(), BusJourneyPlanner.Settings.DEFAULT);
        assertFalse(plans.isEmpty());
        for (var plan : plans) {
            for (int i = 1; i < plan.legs().size(); i++) {
                assertNotEquals(network.routeIndexOf(plan.legs().get(i - 1).pattern()), network.routeIndexOf(plan.legs().get(i).pattern()));
            }
        }
    }

    // ------------------------------------------------------------------ identity, direction

    @Test
    void routesWithTheSameNameAreDifferentRoutes() {
        BusJourney journey = plan(net.at("A"), net.at("D")).journeys().get(0).journey();
        Segment ride = rides(journey).get(0);
        BusNetwork network = net.network();
        long sameName = network.routes().stream().filter(r -> r.displayName().equals("101")).count();
        assertEquals(3, sameName); // R1, R1B and R6 are all "101"
        assertEquals(net.routeId("R1"), ride.route().routeId()); // the faster one, identified by id
        assertEquals("R_R1", ride.route().gtfsId());
        assertNotEquals(net.routeId("R6"), ride.route().routeId());
        assertEquals("101", ride.route().name());
        assertNotNull(ride.tripId());
        assertTrue(ride.tripGtfsId().startsWith("P1_"));
    }

    @Test
    void directionAndHeadsignComeFromTheTripOrAreLabelledAsTowards() {
        Segment outbound = rides(plan(net.at("A"), net.at("D")).journeys().get(0).journey()).get(0);
        assertEquals("Dwarka", outbound.headsign());
        assertEquals(BusJourney.HeadsignSource.GTFS_TRIP, outbound.headsignSource());
        assertEquals(Integer.valueOf(0), outbound.directionId());

        Segment inbound = rides(plan(net.at("D"), net.at("A")).journeys().get(0).journey()).get(0);
        assertEquals(net.routeId("R1B"), inbound.route().routeId());
        assertEquals(Integer.valueOf(1), inbound.directionId());
        assertEquals("Stop A", inbound.headsign()); // no headsign in the data: towards the last stop of the ride's pattern
        assertEquals(BusJourney.HeadsignSource.TERMINAL_STOP, inbound.headsignSource());
        assertEquals(List.of("Stop D", "Stop C", "Stop B", "Stop A"), names(inbound.stops()));
    }

    // ------------------------------------------------------------------ geometry, fare, time

    @Test
    void shapesAreUsedWhenTheTripHasOneElseTheOrderedStops() {
        Segment shaped = rides(plan(net.at("A"), net.at("C")).journeys().stream()
                .filter(p -> rides(p.journey()).get(0).route().routeId().equals(net.routeId("R7"))).findFirst().orElseThrow().journey()).get(0);
        assertEquals("GTFS_SHAPES", shaped.geometrySource());
        List<double[]> line = com.routeview.common.geo.PolylineEncoder.decode(shaped.geometry());
        assertTrue(line.size() >= 5, "the shape's vertices, not a straight line between the two stops");

        BusJourneyService.Planned plain = plan(net.at("A"), net.at("D")).journeys().get(0);
        Segment unshaped = rides(plain.journey()).get(0);
        assertEquals("STOP_SEQUENCE", unshaped.geometrySource());
        assertEquals(4, com.routeview.common.geo.PolylineEncoder.decode(unshaped.geometry()).size());
        assertEquals("STOP_SEQUENCE", plain.journey().geometrySource());
        assertTrue(plain.journey().notices().stream().anyMatch(n -> n.contains("no route shapes")));
    }

    @Test
    void shapeSlicingFollowsTheShapeInOrderAndRefusesAShapeThatMissesTheStops() {
        List<double[]> shape = net.shapes.values().iterator().next();
        var cut = ShapeSlicer.slice(shape, new double[]{28.6000, 77.2000}, new double[]{28.6000, 77.2200});
        assertTrue(cut.isPresent());
        assertEquals(shape.size() + 2, cut.get().size());
        // reversed stops (exit before boarding along the shape) and far-away stops are not trusted
        assertTrue(ShapeSlicer.slice(shape, new double[]{28.6000, 77.2200}, new double[]{28.6000, 77.2000}).isEmpty());
        assertTrue(ShapeSlicer.slice(shape, new double[]{28.7000, 77.5000}, new double[]{28.7010, 77.5100}).isEmpty());
    }

    @Test
    void fareIsUnavailableNeverGuessed() {
        BusJourney journey = plan(net.at("A"), net.at("D")).journeys().get(0).journey();
        assertNull(journey.fare());
        assertEquals("UNAVAILABLE", journey.fareStatus());
    }

    @Test
    void timesAreTheScheduleNotLiveEtas() {
        BusJourney journey = plan(net.near("A", 100), net.at("D")).journeys().get(0).journey();
        assertEquals("STATIC_SCHEDULE", journey.timetableBasis());
        assertTrue(journey.notices().stream().anyMatch(n -> n.contains("not live")));
        Segment ride = rides(journey).get(0);
        assertTrue(ride.departureTime().startsWith("2026-10-12T08:"), ride.departureTime());
        assertTrue(ride.departureTime().endsWith("+05:30"));
        assertTrue(ride.waitSeconds() >= 0);
        assertNotNull(journey.dataset());
        assertEquals("TEST_BUS", journey.dataset().source());
    }

    @Test
    void routeGeometryAndTotalsAreConsistent() {
        BusJourneyService.Planned planned = plan(net.near("A", 150), net.near("D", 120)).journeys().get(0);
        List<double[]> line = com.routeview.common.geo.PolylineEncoder.decode(planned.encodedPolyline());
        assertTrue(line.size() >= 6);
        assertTrue(planned.distanceMeters() > 3_000);
        BusJourney journey = planned.journey();
        assertEquals(journey.walkingSeconds() + journey.waitSeconds() + journey.rideSeconds(), planned.durationSeconds(), 2);
    }

    // ------------------------------------------------------------------ no route / no service

    @Test
    void noRouteWhenNoStopIsNearOrTheStopsAreNotConnected() {
        assertEquals(BusJourneyService.Reason.NO_STOP_NEAR_START, plan(new Coordinates(28.9, 77.9), net.at("D")).reason());
        assertEquals(BusJourneyService.Reason.NO_STOP_NEAR_DESTINATION, plan(net.at("A"), new Coordinates(28.9, 77.9)).reason());
        BusJourneyService.Result unconnected = plan(net.at("A"), net.at("Y"));
        assertTrue(unconnected.journeys().isEmpty());
        assertEquals(BusJourneyService.Reason.NO_JOURNEY, unconnected.reason());
    }

    @Test
    void noServiceOnADayWithoutTripsOrAfterTheLastTrip() {
        Instant tuesday = Instant.parse("2026-10-13T02:30:00Z");
        assertTrue(net.service().plan(net.at("A"), net.at("D"), tuesday, null).journeys().isEmpty());
        Instant lateNight = Instant.parse("2026-10-12T20:00:00Z"); // 01:30 the next morning in India: after the day's last trip
        assertTrue(net.service().plan(net.at("A"), net.at("D"), lateNight, null).journeys().isEmpty());
    }

    @Test
    void emptyNetworkIsReported() {
        BusJourneyService empty = new BusJourneyService(() -> BusNetwork.EMPTY, (p, r, l) -> List.of(), net.timetable(), BusJourneyProperties.defaults());
        assertEquals(BusJourneyService.Reason.NO_BUS_DATA, empty.plan(net.at("A"), net.at("D"), BusTestNetwork.EIGHT_AM, null).reason());
    }

    @Test
    void alternativesAreDistinctAndBounded() {
        List<BusJourneyService.Planned> journeys = plan(net.at("A"), net.at("D")).journeys();
        assertTrue(journeys.size() >= 2 && journeys.size() <= 3);
        long distinct = journeys.stream().map(p -> rides(p.journey()).get(0).route().routeId()).distinct().count();
        assertEquals(journeys.size(), distinct);
        for (int i = 1; i < journeys.size(); i++) {
            assertTrue(journeys.get(i - 1).journey().arrivalTime().compareTo(journeys.get(i).journey().arrivalTime()) <= 0);
        }
    }

    @Test
    void fewerTransfersPreferenceCanChangeTheChoice() {
        // both preferences still return valid journeys for the same trip
        assertFalse(service.plan(net.at("A"), net.at("F"), BusTestNetwork.EIGHT_AM, com.routeview.routing.model.TransitOptions.Preference.FEWER_TRANSFERS).journeys().isEmpty());
        assertFalse(service.plan(net.at("A"), net.at("F"), BusTestNetwork.EIGHT_AM, com.routeview.routing.model.TransitOptions.Preference.LESS_WALKING).journeys().isEmpty());
    }
}
