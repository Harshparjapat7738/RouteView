package com.routeview.bus.journey;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.routeview.common.accessibility.Accessibility;
import com.routeview.common.accessibility.Accessibility.Status;

/** The accessibility of a stop travels with it into the journey (source and version included); nothing is inferred. */
class BusJourneyAccessibilityTest {

    @Test
    void journeyStopsCarryTheStatementOfTheirDataset() {
        BusTestNetwork net = BusTestNetwork.standard();
        net.stops.set(net.stopIndex.get("A"), new BusNetwork.Stop(net.stopId("A"), "S_A", "Stop A", 28.600, 77.200, Accessibility.of("ACCESSIBLE", "TEST_BUS", "2024-01-01")));
        net.stops.set(net.stopIndex.get("D"), new BusNetwork.Stop(net.stopId("D"), "S_D", "Stop D", 28.600, 77.230, Accessibility.of("INACCESSIBLE", "TEST_BUS", "2024-01-01")));
        BusJourney journey = net.service().plan(net.at("A"), net.at("D"), BusTestNetwork.EIGHT_AM, null).journeys().get(0).journey();

        BusJourney.Segment ride = journey.segments().stream().filter(s -> s.type() == BusJourney.SegmentType.BUS).findFirst().orElseThrow();
        assertEquals(Status.ACCESSIBLE, ride.boarding().accessibility().status());
        assertEquals("TEST_BUS", ride.boarding().accessibility().source());
        assertEquals("2024-01-01", ride.boarding().accessibility().sourceVersion());
        assertEquals(Status.INACCESSIBLE, ride.exit().accessibility().status());
        // a stop between them has no statement: unknown, not accessible
        List<BusJourney.StopRef> between = ride.stops().stream().filter(s -> !s.stopId().equals(ride.boarding().stopId()) && !s.stopId().equals(ride.exit().stopId())).toList();
        assertEquals(false, between.isEmpty());
        between.forEach(s -> assertEquals(Status.UNKNOWN, s.accessibility().status()));
    }

    @Test
    void aNetworkWithoutAccessibilityDataIsUnknownEverywhere() {
        BusTestNetwork net = BusTestNetwork.standard();
        BusJourney journey = net.service().plan(net.at("A"), net.at("D"), BusTestNetwork.EIGHT_AM, null).journeys().get(0).journey();
        journey.stops().forEach(s -> assertEquals(Status.UNKNOWN, s.accessibility().status(), s.name()));
    }
}
