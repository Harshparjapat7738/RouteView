package com.routeview.metro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.routeview.metro.ingest.MetroDataset;
import com.routeview.metro.journey.MetroJourney;
import com.routeview.metro.journey.MetroJourney.Segment;
import com.routeview.metro.journey.MetroJourney.SegmentType;
import com.routeview.metro.journey.MetroJourney.StationRef;
import com.routeview.metro.journey.MetroJourney.StationRole;
import com.routeview.metro.journey.MetroJourneyBuilder;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroShape;
import com.routeview.metro.model.MetroStation;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitStep;

/** Services vs logical lines, the shared-trunk graph, station line lists, counts, shapes, direction and the service period. */
class MetroServiceModelTest {

    private final MetroDataset dataset = MetroBranchTestData.dataset();
    private final MetroNetwork network = MetroBranchTestData.network();

    private MetroStation station(String name) {
        return network.stations().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    private MetroLine service(String externalId) {
        return network.lines().stream().filter(l -> l.externalId().equals(externalId)).findFirst().orElseThrow();
    }

    private TransitStep ride(String line, String from, String to, int stopCount) {
        MetroStation a = station(from);
        MetroStation b = station(to);
        return new TransitStep(TransitStep.Kind.RIDE, line, "SUBWAY", from + " Metro Station", to + " Metro Station", "2026-10-08T05:10:00Z", "2026-10-08T05:30:00Z", "",
                stopCount, 9000, 1200, a.latitude(), a.longitude(), b.latitude(), b.longitude(), "", "");
    }

    private MetroJourney journey(TransitStep... steps) {
        long rides = java.util.Arrays.stream(steps).filter(s -> s.kind() == TransitStep.Kind.RIDE).count();
        TransitInfo info = new TransitInfo(List.of(steps), (int) Math.max(0, rides - 1), "2026-10-08T05:10:00Z", "2026-10-08T06:00:00Z", null);
        return MetroJourneyBuilder.build(info, network).orElseThrow();
    }

    private static List<String> names(List<StationRef> refs) {
        return refs.stream().map(StationRef::name).toList();
    }

    // ---------------------------------------------------------------- identity: services and logical lines

    @Test
    void blueMainAndSpurAreDistinctServicesOfOneLogicalLine() {
        MetroLine main = service("M1");
        MetroLine spur = service("M2");
        assertNotEquals(main.id(), spur.id());
        assertEquals(main.groupId(), spur.groupId(), "same colour and a shared trunk: one logical line");
        assertEquals("Blue Line", main.groupName());
        assertEquals("Main Line", main.branchName());
        assertEquals("Spur Branch", spur.branchName());
        assertEquals("Blue Line (Main Line)", main.name(), "the source's own name is kept");
    }

    @Test
    void twoServicesWithTheSameNameAndColourButNoSharedTrunkStayDistinctLines() {
        MetroLine one = service("T1");
        MetroLine two = service("T2");
        assertEquals(one.name(), two.name());
        assertEquals(one.displayColor(), two.displayColor());
        assertTrue(!one.groupId().equals(two.groupId()), "identity is the service, not the name or colour");
        // They meet at Twin C: that is a genuine interchange and neither service is hidden.
        MetroStation c = station("Twin C");
        assertEquals(2, network.groupsOf(c.id()).size());
        assertEquals(2, network.linesOf(c.id()).size());
        assertTrue(network.isInterchange(c.id()));
    }

    @Test
    void sharedTrunkStationsListOneBlueLineAndAreNotInterchanges() {
        for (String name : List.of("Blue 1", "Blue 2", "Blue 4")) {
            MetroStation s = station(name);
            assertEquals(1, network.groupsOf(s.id()).size(), name);
            assertFalse(network.isInterchange(s.id()), name + " is served by two Blue services but is not an interchange");
        }
        assertEquals(2, network.linesOf(station("Blue 2").id()).size(), "both services still serve the trunk");
    }

    @Test
    void genuineInterchangeCountsDistinctLogicalLinesOnly() {
        MetroStation b3 = station("Blue 3");
        assertEquals(2, network.groupsOf(b3.id()).size(), "Blue (main + spur) and Yellow");
        assertTrue(network.isInterchange(b3.id()));
        assertEquals(List.of("Blue Line", "Yellow Line"), network.groupsOf(b3.id()).stream().map(MetroNetwork.LineGroup::name).toList());
        assertEquals(dataset.statistics().interchangeStations, network.stations().stream().filter(s -> network.isInterchange(s.id())).count());
    }

    // ---------------------------------------------------------------- the graph and shared-trunk paths

    @Test
    void connectionsAreConsecutiveStationsOfRealTripsOnly() {
        UUID b1 = station("Blue 1").id();
        UUID b3 = station("Blue 3").id();
        assertTrue(dataset.connections().stream().noneMatch(c -> c.fromStationId().equals(b1) && c.toStationId().equals(b3)), "non-adjacent stations are not connected");
        assertTrue(dataset.connections().stream().anyMatch(c -> c.fromStationId().equals(b1) && c.toStationId().equals(station("Blue 2").id()) && c.lineId().equals(service("M1").id())));
        assertTrue(dataset.connections().stream().anyMatch(c -> c.fromStationId().equals(b1) && c.toStationId().equals(station("Blue 2").id()) && c.lineId().equals(service("M2").id())),
                "the trunk edge exists once per service");
    }

    @Test
    void trunkRideListsEveryIntermediateStationAndDoesNotPickAPattern() {
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 4", 3));
        Segment ride = j.segments().get(0);
        assertEquals(List.of("Blue 2", "Blue 3"), names(ride.intermediateStations()));
        assertTrue(j.stationsVerified());
        assertNotNull(ride.line().groupId());
        assertNull(ride.line().lineId(), "both Blue services run on the trunk: no single service is claimed");
    }

    @Test
    void trunkRideGivesTheSameStationsInEitherDirection() {
        List<String> forward = names(journey(ride("Blue Line", "Blue 1", "Blue 4", 3)).segments().get(0).intermediateStations());
        List<String> back = names(journey(ride("Blue Line", "Blue 4", "Blue 1", 3)).segments().get(0).intermediateStations());
        assertEquals(List.of("Blue 3", "Blue 2"), back);
        assertEquals(forward, back.reversed());
    }

    @Test
    void mainOnlyRideIsAttributedToTheMainService() {
        MetroJourney j = journey(ride("Blue Line", "Blue 3", "Blue 8", 5));
        Segment ride = j.segments().get(0);
        assertEquals(List.of("Blue 4", "Blue 5", "Blue 6", "Blue 7"), names(ride.intermediateStations()));
        assertEquals(service("M1").id(), ride.line().lineId());
        assertEquals("Main Line", ride.line().branch());
    }

    @Test
    void trunkToBranchRideKeepsTheTrunkAndSwitchesToTheBranchService() {
        MetroJourney j = journey(ride("Blue Line", "Blue 2", "Spur 6", 4));
        Segment ride = j.segments().get(0);
        assertEquals(List.of("Blue 3", "Blue 4", "Spur 5"), names(ride.intermediateStations()), "trunk stations are not dropped");
        assertEquals(service("M2").id(), ride.line().lineId());
        assertEquals("Spur Branch", ride.line().branch());
        assertTrue(j.stationsVerified());
    }

    @Test
    void everySharedTrunkPairIsReconstructed() {
        // all ordered pairs of the Blue main line and of the spur, as a provider would report them
        for (String lineId : List.of("M1", "M2")) {
            List<UUID> ids = network.patterns().stream().filter(p -> p.line().externalId().equals(lineId)).findFirst().orElseThrow().stationIds();
            for (int i = 0; i < ids.size(); i++) {
                for (int k = i + 1; k < ids.size(); k++) {
                    MetroJourney j = journey(ride("Blue Line", network.station(ids.get(i)).name(), network.station(ids.get(k)).name(), k - i));
                    assertTrue(j.stationsVerified(), "pair " + i + "-" + k + " on " + lineId);
                    List<UUID> got = j.segments().get(0).intermediateStations().stream().map(StationRef::stationId).toList();
                    assertEquals(ids.subList(i + 1, k), got, "pair " + i + "-" + k + " on " + lineId);
                }
            }
        }
    }

    @Test
    void blueToBlueIsNeverATransfer() {
        // Main to the spur at the junction station: one logical line, so no TRANSFER segment and no change counted.
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 4", 3), ride("Blue Line", "Blue 4", "Spur 6", 2));
        assertEquals(0, j.transfers());
        assertTrue(j.segments().stream().noneMatch(s -> s.type() == SegmentType.TRANSFER));
        assertTrue(j.stations().stream().noneMatch(s -> s.role() == StationRole.INTERCHANGE));
        assertEquals(List.of("Blue 1", "Blue 2", "Blue 3", "Blue 4", "Spur 5", "Spur 6"), names(j.stations()));
        assertEquals(StationRole.INTERMEDIATE, j.stations().get(3).role());
        assertTrue(j.notices().stream().anyMatch(n -> n.contains("same metro line")));
    }

    @Test
    void aRealChangeBetweenDifferentLinesIsATransferAtTheRightStation() {
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 3", 2), ride("Yellow Line", "Blue 3", "Yellow 3", 1));
        assertEquals(1, j.transfers());
        Segment transfer = j.segments().get(1);
        assertEquals(SegmentType.TRANSFER, transfer.type());
        assertEquals("Blue 3", transfer.transferStation().name());
        assertEquals(List.of("Blue Line", "Yellow Line"), transfer.transferStation().lines().stream().map(MetroJourney.LineRef::name).toList());
        assertEquals(StationRole.INTERCHANGE, j.stations().get(2).role());
    }

    // ---------------------------------------------------------------- Sikanderpur-style station

    @Test
    void stationWrittenTwiceWithAServiceNoteIsOneStationServedByBothLines() {
        MetroStation sikan = station("Sikan");
        assertEquals(List.of("Rapid Metro", "Yellow Line"), network.groupsOf(sikan.id()).stream().map(MetroNetwork.LineGroup::name).sorted().toList());
        assertTrue(network.stations().stream().noneMatch(s -> s.name().contains("Rapid Metro")), "the plain name is the station's name");
        assertTrue(dataset.statistics().warnings().stream().anyMatch(w -> w.contains("treated as one station")), "the merge is reported");
    }

    @Test
    void aYellowOnlyRideDoesNotShowRapidMetro() {
        MetroJourney j = journey(ride("Yellow Line", "Yellow 3", "Yellow 5", 2));
        StationRef sikan = j.segments().get(0).intermediateStations().get(0);
        assertEquals("Sikan", sikan.name());
        assertEquals(List.of("Yellow Line"), sikan.lines().stream().map(MetroJourney.LineRef::name).toList());
        assertTrue(sikan.interchange(), "the station is an interchange; the journey just does not use the other line");
    }

    @Test
    void aRapidOnlyRideDoesNotShowYellow() {
        MetroJourney j = journey(ride("Rapid Metro", "Rapid 1", "Rapid 3", 2));
        StationRef sikan = j.segments().get(0).intermediateStations().get(0);
        assertEquals("Sikan", sikan.name());
        assertEquals(List.of("Rapid Metro"), sikan.lines().stream().map(MetroJourney.LineRef::name).toList());
    }

    @Test
    void aJourneyUsingBothShowsBothAtTheChange() {
        MetroJourney j = journey(ride("Yellow Line", "Yellow 3", "Sikan", 1), ride("Rapid Metro", "Sikan", "Rapid 3", 1));
        assertEquals(1, j.transfers());
        assertEquals(List.of("Yellow Line", "Rapid Metro"), j.segments().get(1).transferStation().lines().stream().map(MetroJourney.LineRef::name).toList());
    }

    // ---------------------------------------------------------------- counts

    @Test
    void tenStationsListedNineSegmentsTravelled() {
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 10", 9));
        assertEquals(10, (int) j.stationCount());
        assertEquals(9, (int) j.travelledStops());
        assertEquals(10, j.stations().size(), "the count is exactly what the list shows");
    }

    @Test
    void countsAreNotClaimedWhenStationsCannotBeVerified() {
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 10", 7)); // the dataset says 9
        assertFalse(j.stationsVerified());
        assertNull(j.stationCount());
        assertEquals(7, (int) j.travelledStops());
    }

    // ---------------------------------------------------------------- shapes

    @Test
    void shapesAreLookedUpPerServiceAndOrderedBySequence() {
        List<MetroShape> shapes = network.shapesOf(service("M1").id());
        assertEquals(1, shapes.size());
        assertEquals("shp_M1", shapes.get(0).externalId());
        List<double[]> pts = shapes.get(0).points();
        assertEquals(4, pts.size());
        assertEquals(77.1100, pts.get(0)[1], 1e-9);
        assertEquals(77.1150, pts.get(1)[1], 1e-9);
        assertEquals(77.1200, pts.get(2)[1], 1e-9);
        assertEquals(77.2000, pts.get(3)[1], 1e-9);
        assertEquals(1, network.shapesOf(service("M2").id()).size());
        assertNotEquals(network.shapesOf(service("M1").id()).get(0).id(), network.shapesOf(service("M2").id()).get(0).id());
    }

    @Test
    void missingAndInvalidShapesAreReportedNotInvented() {
        assertTrue(network.shapesOf(service("R1").id()).isEmpty(), "no shape_id: no shape and no straight line is made up");
        assertTrue(network.shapesOf(service("T1").id()).isEmpty(), "a one-point shape is invalid");
        assertEquals(3, dataset.statistics().shapesImported);
        assertEquals(1, dataset.statistics().invalidShapes);
        assertTrue(dataset.statistics().tripsWithoutShape > 0);
    }

    @Test
    void aDatasetWithoutShapesImportsAndSaysSo() {
        MetroDataset none = MetroBranchTestData.dataset(true, false);
        assertTrue(none.shapes().isEmpty());
        assertTrue(none.statistics().warnings().stream().anyMatch(w -> w.contains("no shapes.txt")));
    }

    // ---------------------------------------------------------------- direction and calendar

    @Test
    void noDirectionIsInventedFromTheDataset() {
        assertTrue(dataset.stationLines().stream().allMatch(l -> l.toward() == null), "a pattern's last station is not a heading");
        assertTrue(network.patterns().stream().allMatch(p -> p.toward() == null));
        assertEquals(0, dataset.statistics().tripsWithHeadsign);
        assertEquals(0, dataset.statistics().tripsWithDirection);
        MetroJourney j = journey(ride("Blue Line", "Blue 1", "Blue 4", 3));
        assertNull(j.segments().get(0).towards(), "without a provider heading there is no 'towards'");
    }

    @Test
    void servicePeriodComesFromTheDatasetCalendarOnly() {
        var period = dataset.servicePeriod();
        assertNotNull(period);
        assertEquals(java.time.LocalDate.of(2024, 1, 1), period.start());
        assertEquals(java.time.LocalDate.of(2024, 12, 31), period.end());
        assertEquals(List.of("monday", "tuesday", "wednesday", "thursday", "friday", "saturday"), period.operatingDays(), "no Sunday service is invented");
        assertNull(MetroBranchTestData.dataset(false, true).servicePeriod(), "no calendar: the period is unknown, not made up");
    }

    // ---------------------------------------------------------------- data quality

    @Test
    void distinctStationsAtIdenticalCoordinatesStayDistinctAndAreReported() {
        Set<String> names = new HashSet<>(names(network.stations().stream().map(s -> new StationRef(s.id(), s.name(), s.latitude(), s.longitude(), null, null)).toList()));
        assertTrue(names.contains("Same Spot One") && names.contains("Same Spot Two"));
        assertTrue(dataset.statistics().warnings().stream().anyMatch(w -> w.contains("identical coordinates")));
    }

    @Test
    void importIsDeterministic() {
        MetroDataset again = MetroBranchTestData.dataset();
        assertEquals(dataset.lines().stream().map(MetroLine::id).toList(), again.lines().stream().map(MetroLine::id).toList());
        assertEquals(dataset.connections(), again.connections());
        assertEquals(dataset.lines().stream().map(MetroLine::groupId).toList(), again.lines().stream().map(MetroLine::groupId).toList());
    }
}
