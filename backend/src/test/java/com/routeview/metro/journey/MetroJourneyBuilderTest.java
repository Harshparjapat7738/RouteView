package com.routeview.metro.journey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.routeview.metro.MetroTestData;
import com.routeview.metro.journey.MetroJourney.Segment;
import com.routeview.metro.journey.MetroJourney.SegmentType;
import com.routeview.metro.journey.MetroJourney.StationRef;
import com.routeview.metro.journey.MetroJourney.StationRole;
import com.routeview.metro.journey.MetroJourney.WalkRole;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitFare;
import com.routeview.routing.model.TransitInfo.TransitStep;

class MetroJourneyBuilderTest {

    private final MetroNetwork network = MetroTestData.network();

    private MetroStation station(String name) {
        return network.stations().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    private static TransitStep walk(long meters, long seconds) {
        return new TransitStep(TransitStep.Kind.WALK, "", "", "", "", "", "", "", 0, meters, seconds);
    }

    /** A ride whose stop names / positions are as a routing provider would send them (not the dataset's own names). */
    private TransitStep ride(String line, String type, String from, String to, int stopCount, String headsign) {
        MetroStation a = station(from);
        MetroStation b = station(to);
        return new TransitStep(TransitStep.Kind.RIDE, line, type, from + " Metro Station", to + " Metro Station",
                "2026-10-08T05:10:00Z", "2026-10-08T05:30:00Z", headsign, stopCount, 9000, 1200,
                a.latitude(), a.longitude(), b.latitude(), b.longitude(), "", "");
    }

    private static TransitInfo transit(TransitFare fare, TransitStep... steps) {
        int rides = (int) java.util.Arrays.stream(steps).filter(s -> s.kind() == TransitStep.Kind.RIDE).count();
        return new TransitInfo(List.of(steps), Math.max(0, rides - 1), "2026-10-08T05:10:00Z", "2026-10-08T06:00:00Z", fare);
    }

    private MetroJourney journey(TransitInfo transit) {
        Optional<MetroJourney> result = MetroJourneyBuilder.build(transit, network);
        assertTrue(result.isPresent());
        return result.get();
    }

    private TransitInfo interchangeJourney() {
        return transit(new TransitFare("INR", "40"),
                walk(850, 420),
                ride("Blue Line", "SUBWAY", "Alpha", "Central", 2, "Echo"),
                walk(120, 90),
                ride("Yellow Line", "SUBWAY", "Central", "India", 1, "Juliet"),
                walk(550, 360));
    }

    @Test
    void buildsOrderedSegmentsWithFirstAndLastMileWalking() {
        MetroJourney journey = journey(interchangeJourney());
        List<SegmentType> types = journey.segments().stream().map(Segment::type).toList();
        assertEquals(List.of(SegmentType.WALK, SegmentType.METRO, SegmentType.TRANSFER, SegmentType.METRO, SegmentType.WALK), types);
        assertEquals(WalkRole.FIRST_MILE, journey.segments().get(0).walkRole());
        assertEquals(850, journey.segments().get(0).distanceMeters());
        assertEquals(420, journey.segments().get(0).durationSeconds());
        assertEquals(WalkRole.LAST_MILE, journey.segments().get(4).walkRole());
        assertEquals(550, journey.segments().get(4).distanceMeters());
        assertEquals(850 + 120 + 550, journey.walkingMeters());
        assertEquals(420 + 90 + 360, journey.walkingSeconds());
    }

    @Test
    void listsStationsInJourneyOrderWithRoles() {
        MetroJourney journey = journey(interchangeJourney());
        List<String> names = journey.stations().stream().map(StationRef::name).toList();
        assertEquals(List.of("Alpha", "Bravo Metro Station", "Central", "India"), names);
        List<StationRole> roles = journey.stations().stream().map(StationRef::role).toList();
        assertEquals(List.of(StationRole.BOARDING, StationRole.INTERMEDIATE, StationRole.INTERCHANGE, StationRole.EXIT), roles);
        assertTrue(journey.stations().stream().allMatch(s -> s.stationId() != null), "all stations matched to the dataset");
        assertTrue(journey.stationsVerified());
        assertTrue(journey.notices().isEmpty());
    }

    @Test
    void countsTransfersAndStations() {
        MetroJourney journey = journey(interchangeJourney());
        assertEquals(1, journey.transfers());
        assertEquals(3, (int) journey.travelledStops()); // 2 + 1 segments travelled, from the provider's stop counts
        assertEquals(4, (int) journey.stationCount()); // Alpha, Bravo, Central, India: stations listed = segments + 1 for a continuous chain
    }

    @Test
    void transferSegmentCarriesStationLinesAndWalking() {
        Segment transfer = journey(interchangeJourney()).segments().get(2);
        assertEquals("Central", transfer.transferStation().name());
        assertEquals(StationRole.INTERCHANGE, transfer.transferStation().role());
        assertNull(transfer.transferToStation(), "the next ride starts at the same station");
        assertEquals("Blue Line", transfer.fromLine().name());
        assertEquals("Yellow Line", transfer.toLine().name());
        assertEquals(120L, (long) transfer.transferWalkMeters());
        assertEquals(90L, (long) transfer.transferWalkSeconds());
        assertEquals(2, transfer.transferStation().lines().size(), "an interchange belongs to two lines");
    }

    @Test
    void transferWithoutWalkingStepHasNoInventedWalking() {
        TransitInfo info = transit(null,
                ride("Blue Line", "SUBWAY", "Alpha", "Central", 2, ""),
                ride("Yellow Line", "SUBWAY", "Central", "India", 1, ""));
        Segment transfer = journey(info).segments().get(1);
        assertEquals(SegmentType.TRANSFER, transfer.type());
        assertNull(transfer.transferWalkMeters());
        assertNull(transfer.transferWalkSeconds());
        assertEquals(SegmentType.METRO, journey(info).segments().get(0).type(), "no first-mile walk when the provider sent none");
    }

    @Test
    void metroSegmentDescribesLineStationsAndTimes() {
        Segment blue = journey(interchangeJourney()).segments().get(1);
        assertEquals("Blue Line", blue.line().name());
        assertNotNull(blue.line().lineId(), "matched to the dataset's line");
        assertEquals("Echo", blue.towards());
        assertEquals("Alpha", blue.boarding().name());
        assertEquals("Central", blue.exit().name());
        assertEquals(2, blue.stopCount());
        assertEquals(List.of("Bravo Metro Station"), blue.intermediateStations().stream().map(StationRef::name).toList());
        assertEquals("2026-10-08T05:10:00Z", blue.departureTime());
        assertEquals(1200, blue.durationSeconds());
        assertEquals("#0000FF", blue.line().color(), "line colour from the dataset when the provider sent none");
    }

    @Test
    void ridingAgainstTheStoredDirectionKeepsTheRidingOrder() {
        TransitInfo info = transit(null, ride("Blue Line", "SUBWAY", "Echo", "Alpha", 4, ""));
        MetroJourney journey = journey(info);
        assertEquals(List.of("Echo", "Delta", "Central", "Bravo Metro Station", "Alpha"), journey.stations().stream().map(StationRef::name).toList());
    }

    @Test
    void usesTheBranchThatContainsBothStations() {
        TransitInfo info = transit(null, ride("Blue Line", "SUBWAY", "Bravo Metro Station", "Golf", 3, ""));
        MetroJourney journey = journey(info);
        assertEquals(List.of("Bravo Metro Station", "Central", "Foxtrot", "Golf"), journey.stations().stream().map(StationRef::name).toList());
    }

    @Test
    void passesTheFareThroughAndNeverGuessesOne() {
        MetroJourney withFare = journey(interchangeJourney());
        assertEquals("INR", withFare.fare().currency());
        assertEquals("40", withFare.fare().amount());
        assertNull(journey(transit(null, ride("Blue Line", "SUBWAY", "Alpha", "Central", 2, ""))).fare());
    }

    @Test
    void doesNotListStationsThatDisagreeWithTheProvidersStopCount() {
        // The provider says 3 stops but the dataset has 2 between Alpha and Central: not verifiable, so not listed.
        TransitInfo info = transit(null, ride("Blue Line", "SUBWAY", "Alpha", "Central", 3, ""));
        MetroJourney journey = journey(info);
        Segment ride = journey.segments().get(0);
        assertNull(ride.intermediateStations());
        assertFalse(journey.stationsVerified());
        assertEquals(List.of("Alpha", "Central"), journey.stations().stream().map(StationRef::name).toList());
        assertNull(journey.stationCount(), "no station count is claimed when the stations are not verified");
        assertEquals(3, (int) journey.travelledStops(), "the provider's count of segments is still shown");
        assertFalse(journey.notices().isEmpty());
    }

    @Test
    void keepsProviderStationsWhenTheyAreNotInTheDataset() {
        TransitStep unknown = new TransitStep(TransitStep.Kind.RIDE, "Violet Line", "SUBWAY", "Somewhere Else", "Nowhere Else",
                "", "", "", 4, 5000, 600, 27.0, 76.0, 27.1, 76.1, "", "");
        MetroJourney journey = journey(transit(null, unknown));
        assertNull(journey.segments().get(0).boarding().stationId());
        assertEquals("Somewhere Else", journey.segments().get(0).boarding().name());
        assertNull(journey.segments().get(0).intermediateStations());
        assertNull(journey.dataset(), "nothing matched, so no dataset is cited");
    }

    @Test
    void worksWithoutAnyMetroDataAndSaysSo() {
        Optional<MetroJourney> result = MetroJourneyBuilder.build(interchangeJourney(), MetroNetwork.EMPTY);
        assertTrue(result.isPresent());
        assertEquals(1, result.get().transfers());
        assertTrue(result.get().stations().stream().noneMatch(s -> s.stationId() != null));
        assertTrue(result.get().notices().get(0).contains("not available"));
    }

    @Test
    void aRouteWithoutMetroRideIsNotAMetroJourney() {
        assertTrue(MetroJourneyBuilder.build(null, network).isEmpty());
        assertTrue(MetroJourneyBuilder.build(transit(null, walk(300, 200)), network).isEmpty());
        TransitStep bus = new TransitStep(TransitStep.Kind.RIDE, "500", "BUS", "A", "B", "", "", "", 5, 4000, 900);
        assertTrue(MetroJourneyBuilder.build(transit(null, bus), network).isEmpty());
        assertFalse(MetroJourneyBuilder.hasMetroRide(transit(null, bus)));
    }

    @Test
    void otherTransitIsShownHonestlyAsOtherTransit() {
        TransitStep bus = new TransitStep(TransitStep.Kind.RIDE, "500", "BUS", "Bus Stop", "Another Stop", "", "", "", 5, 4000, 900);
        MetroJourney journey = journey(transit(null, ride("Blue Line", "SUBWAY", "Alpha", "Central", 2, ""), bus));
        assertEquals(List.of(SegmentType.METRO, SegmentType.TRANSFER, SegmentType.TRANSIT), journey.segments().stream().map(Segment::type).toList());
        assertTrue(journey.notices().stream().anyMatch(n -> n.contains("other public transport")));
        assertEquals(3, (int) journey.stationCount(), "only metro rides are counted as stations");
        assertEquals(2, (int) journey.travelledStops(), "only metro rides are counted as travelled stops");
    }

    @Test
    void anAdjacentStopHasNoStationsBetween() {
        MetroJourney journey = journey(transit(null, ride("Yellow Line", "SUBWAY", "Central", "India", 1, "")));
        assertEquals(0, journey.segments().get(0).intermediateStations().size());
        assertTrue(journey.stationsVerified());
        assertEquals(List.of(StationRole.BOARDING, StationRole.EXIT), journey.stations().stream().map(StationRef::role).toList());
    }

    @Test
    void citesTheDatasetThatWasUsed() {
        MetroJourney.DatasetRef dataset = journey(interchangeJourney()).dataset();
        assertEquals(MetroTestData.SOURCE, dataset.source());
        assertEquals(MetroTestData.VERSION, dataset.sourceVersion());
        assertEquals(java.time.LocalDate.of(2023, 8, 10), dataset.sourceUpdatedAt());
    }

    @Test
    void matcherNeedsANameMatchNearbyOrASingleStationRightThere() {
        MetroStation central = station("Central");
        assertEquals(central.id(), MetroStationMatcher.find(network, "Central Metro Station", central.latitude(), central.longitude()).orElseThrow().id());
        // name match without coordinates is accepted
        assertTrue(MetroStationMatcher.find(network, "Delta", null, null).isPresent());
        // same name but 20 km away: rejected
        assertTrue(MetroStationMatcher.find(network, "Delta", 28.8, 77.4).isEmpty());
        // different name, nothing within 75 m: rejected
        assertTrue(MetroStationMatcher.find(network, "Unknown Place", 28.5, 77.0).isEmpty());
        // different name but exactly one station within 75 m: accepted
        assertTrue(MetroStationMatcher.find(network, "Alpha Gate", 28.6001, 77.1001).isPresent());
        // too-short fragments never match by containment
        assertFalse(MetroStationMatcher.namesMatch("al", "alpha"));
        List<String> unused = new ArrayList<>();
        assertTrue(unused.isEmpty());
    }
}
