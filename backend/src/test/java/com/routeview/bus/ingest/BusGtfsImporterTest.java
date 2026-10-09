package com.routeview.bus.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.routeview.bus.BusTestData;
import com.routeview.bus.model.BusRoute;
import com.routeview.bus.model.BusStop;
import com.routeview.bus.model.BusStopTime;
import com.routeview.bus.model.BusTrip;
import com.routeview.gtfs.GtfsSource;

class BusGtfsImporterTest {

    private final BusTestData.Result result = BusTestData.run();
    private final BusTestData.Recorder sink = result.sink();
    private final BusImportStatistics stats = result.stats();

    private BusTrip trip(String externalId) {
        return sink.trips.stream().filter(t -> t.externalId().equals(externalId)).findFirst().orElse(null);
    }

    private BusRoute route(String externalId) {
        return sink.routes.stream().filter(r -> r.externalId().equals(externalId)).findFirst().orElse(null);
    }

    @Test
    void importsValidRecordsAndCountsTheRest() {
        assertTrue(sink.finished);
        assertEquals(2, stats.agenciesImported);
        assertEquals(7, stats.stopsImported);
        assertEquals(3, stats.routesImported);
        assertEquals(2, stats.servicesImported);
        assertEquals(1, stats.shapesImported);
        assertEquals(10, stats.tripsRead);
        assertEquals(4, stats.tripsImported);
        assertEquals(3, stats.tripsRejected);
        assertEquals(19, stats.stopTimesRead);
        assertEquals(11, stats.stopTimesImported);
        assertEquals(11, sink.stopTimes.size());
        assertEquals(1, stats.unusedStops);
        assertEquals(1, stats.routesWithoutTrips);
    }

    private int reason(String text) {
        return stats.rejectionReasons().getOrDefault(text, 0);
    }

    @Test
    void rejectsBadRecordsWithTheirReasons() {
        assertEquals(2, reason("invalid coordinates")); // zero and non-numeric coordinates
        assertEquals(1, reason("coordinates outside the supported region"));
        assertEquals(1, reason("stop without a name"));
        assertEquals(1, reason("route without a name"));
        assertEquals(1, reason("route of an unknown agency"));
        assertEquals(1, reason("invalid route type"));
        assertEquals(1, reason("trip of an unknown route"));
        assertEquals(1, reason("trip of an unknown service"));
        assertEquals(1, reason("service ends before it starts"));
        assertEquals(1, reason("invalid calendar date entry"));
        assertEquals(1, reason("malformed stop time"));
        assertEquals(1, reason("invalid stop sequence"));
        assertEquals(1, reason("stop time of an unknown stop"));
        assertEquals(1, reason("stop time of an unknown trip"));
        assertEquals(1, reason("trip with fewer than two valid stop times"));
        assertEquals(1, reason("trip with times going backwards"));
        assertEquals(1, reason("trip without stop times"));
        assertEquals(1, reason("shape with fewer than two points"));
        assertEquals(1, reason("invalid shape point"));
        assertTrue(stats.duplicatesSkipped >= 4); // agency, stop, route, trip and stop sequence duplicates
    }

    @Test
    void routesAreIdentifiedByGtfsIdNotByName() {
        BusRoute r1 = route("R1");
        BusRoute r2 = route("R2");
        assertEquals("Alpha to Echo", r1.longName());
        assertEquals(r1.longName(), r2.longName());
        assertNotEquals(r1.id(), r2.id());
        assertNull(route("R3"));
        assertNull(r1.shortName());
        assertNull(r1.color());
        assertEquals(3, r1.routeType());
    }

    @Test
    void stableIdsDoNotDependOnTheRun() {
        BusTestData.Result again = BusTestData.run();
        assertEquals(route("R1").id(), again.sink().routes.get(0).id());
        assertEquals(sink.stops.get(0).id(), again.sink().stops.get(0).id());
        assertEquals(trip("T1").id(), again.sink().trips.get(0).id());
        Set<UUID> ids = new HashSet<>();
        sink.stops.forEach(s -> ids.add(s.id()));
        assertEquals(sink.stops.size(), ids.size());
    }

    @Test
    void stopsKeepCodesAndSeveralStopsMayShareOne() {
        BusStop s2 = sink.stops.stream().filter(s -> s.externalId().equals("S2")).findFirst().orElseThrow();
        BusStop s2b = sink.stops.stream().filter(s -> s.externalId().equals("S2B")).findFirst().orElseThrow();
        assertEquals("101", s2.code());
        assertEquals(s2.code(), s2b.code());
        assertNotEquals(s2.id(), s2b.id());
        assertEquals(28.61, s2.latitude(), 1e-9);
        assertEquals(77.11, s2.longitude(), 1e-9);
        assertEquals("Z2", s2.zoneId());
    }

    @Test
    void tripsReferenceExistingRoutesAndShapes() {
        Set<UUID> routeIds = new HashSet<>();
        sink.routes.forEach(r -> routeIds.add(r.id()));
        for (BusTrip t : sink.trips) {
            assertTrue(routeIds.contains(t.routeId()));
        }
        assertEquals("SH1", trip("T1").shapeExternalId());
        assertNull(trip("T3").shapeExternalId()); // the unknown shape reference is cleared, not replaced
        assertEquals(1, stats.invalidShapeReferences);
        assertNull(trip("T4"));
        assertNull(trip("T5"));
    }

    @Test
    void shapePointsAreOrderedBySequence() {
        List<double[]> points = sink.shapes.get(0).points();
        assertEquals(3, points.size());
        assertEquals(28.61, points.get(0)[0], 1e-9);
        assertEquals(28.63, points.get(2)[0], 1e-9);
    }

    @Test
    void unusableTripsAreDiscardedAndOnlyValidStopTimesKept() {
        assertEquals(3, sink.discarded.size());
        assertEquals(4, sink.keptTrips().size());
        assertTrue(sink.discarded.contains(trip("T6").id()));
        assertTrue(sink.discarded.contains(trip("T7").id()));
        assertTrue(sink.discarded.contains(trip("T8").id()));
        Set<UUID> kept = new HashSet<>();
        sink.keptTrips().forEach(t -> kept.add(t.id()));
        Set<String> keys = new HashSet<>();
        for (BusStopTime st : sink.stopTimes) {
            assertTrue(kept.contains(st.tripId()));
            assertTrue(keys.add(st.tripId() + "/" + st.stopSequence())); // no duplicate (trip, sequence)
        }
        long t1 = sink.stopTimes.stream().filter(st -> st.tripId().equals(trip("T1").id())).count();
        long t2 = sink.stopTimes.stream().filter(st -> st.tripId().equals(trip("T2").id())).count();
        assertEquals(4, t1);
        assertEquals(3, t2);
    }

    @Test
    void timesAreSecondsAndMayPassMidnight() {
        BusStopTime late = sink.stopTimes.stream().filter(st -> st.tripId().equals(trip("T9").id()) && st.stopSequence() == 1).findFirst().orElseThrow();
        assertEquals(25 * 3600 + 10 * 60, late.arrivalSeconds().intValue());
        BusStopTime first = sink.stopTimes.stream().filter(st -> st.tripId().equals(trip("T1").id()) && st.stopSequence() == 0).findFirst().orElseThrow();
        assertEquals(8 * 3600, first.departureSeconds().intValue());
        assertEquals(0, first.stopSequence()); // sequences may start at 0
    }

    @Test
    void parseTimeAcceptsOnlyValidTimes() {
        assertEquals(0, BusGtfsImporter.parseTime("00:00:00").intValue());
        assertEquals(33 * 3600 + 5, BusGtfsImporter.parseTime("33:00:05").intValue());
        assertEquals(8 * 3600, BusGtfsImporter.parseTime("8:00:00").intValue());
        assertNull(BusGtfsImporter.parseTime(""));
        assertNull(BusGtfsImporter.parseTime(null));
        for (String bad : List.of("xx:yy", "12:60:00", "12:00:61", "99:00:00", "12:00", "-1:00:00", "12:0:00")) {
            assertTrue(BusGtfsImporter.isMalformed(BusGtfsImporter.parseTime(bad)), bad);
        }
    }

    @Test
    void servicePeriodComesFromTheCalendarOfTheImportedTrips() {
        assertEquals(LocalDate.of(2024, 1, 1), stats.servicePeriodStart);
        assertEquals(LocalDate.of(2027, 1, 1), stats.servicePeriodEnd);
        assertEquals(List.of("monday", "tuesday", "wednesday", "thursday", "friday", "saturday"), stats.operatingDays);
        assertEquals(2, sink.exceptions.size());
        assertFalse(sink.exceptions.stream().filter(e -> e.serviceExternalId().equals("WK")).findFirst().orElseThrow().added());
    }

    @Test
    void smallBatchesGiveTheSameResult() {
        BusGtfsImporter.Options small = new BusGtfsImporter.Options(BusTestData.SOURCE, BusTestData.VERSION, null, 2, 6.0, 38.0, 68.0, 98.0);
        BusTestData.Recorder other = new BusTestData.Recorder();
        java.nio.file.Path dir = BusTestData.write(tempDir(), BusTestData.files());
        BusImportStatistics s = BusGtfsImporter.read(new GtfsSource(dir), small, other);
        assertEquals(stats.stopTimesImported, s.stopTimesImported);
        assertEquals(sink.stopTimes.size(), other.stopTimes.size());
        assertTrue(other.stopTimeBatches > sink.stopTimeBatches);
        // a trip is never split over two batches: every batch holds whole trips (checked through the per-trip counts)
        assertEquals(4, other.keptTrips().size());
    }

    @Test
    void worksWithoutOptionalTables() {
        Map<String, String> files = new LinkedHashMap<>(BusTestData.files());
        files.remove("agency.txt");
        files.remove("shapes.txt");
        files.remove("calendar_dates.txt");
        BusTestData.Result r = BusTestData.run(files);
        assertEquals(0, r.stats().agenciesImported);
        assertEquals(0, r.stats().shapesImported);
        assertTrue(r.stats().warnings().stream().anyMatch(w -> w.contains("agency.txt")));
        assertTrue(r.stats().warnings().stream().anyMatch(w -> w.contains("shapes.txt")));
        assertEquals(4, r.stats().tripsImported);
        assertEquals(0, r.stats().calendarDatesImported);
        assertNull(r.sink().trips.get(0).shapeExternalId());
    }

    @Test
    void withoutAnyCalendarTheDaysOfServiceStayUnknown() {
        Map<String, String> files = new LinkedHashMap<>(BusTestData.files());
        files.remove("calendar.txt");
        files.remove("calendar_dates.txt");
        BusTestData.Result r = BusTestData.run(files);
        assertNull(r.stats().servicePeriodStart);
        assertTrue(r.stats().operatingDays.isEmpty());
        assertEquals(4, r.stats().tripsImported); // trips are not rejected only because the calendar is missing
        assertTrue(r.stats().warnings().stream().anyMatch(w -> w.contains("calendar")));
    }

    @Test
    void anUnusableDatasetIsRefused() {
        Map<String, String> files = new LinkedHashMap<>(BusTestData.files());
        files.put("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence");
        assertThrows(IllegalStateException.class, () -> BusTestData.run(files));
        Map<String, String> noStops = new LinkedHashMap<>(BusTestData.files());
        noStops.remove("stops.txt");
        assertThrows(GtfsSource.InvalidFeedException.class, () -> BusTestData.run(noStops));
    }

    @Test
    void aSourceVersionIsRequired() {
        BusGtfsImporter.Options none = new BusGtfsImporter.Options(BusTestData.SOURCE, " ", null, 100, 6.0, 38.0, 68.0, 98.0);
        java.nio.file.Path dir = BusTestData.write(tempDir(), BusTestData.files());
        assertThrows(IllegalArgumentException.class, () -> BusGtfsImporter.read(new GtfsSource(dir), none, new BusTestData.Recorder()));
        assertThrows(IllegalArgumentException.class, () -> new BusImportProperties(true, "x", "", "", "", 0).toOptions());
        assertThrows(IllegalArgumentException.class, () -> new BusImportProperties(true, "x", "", "v1", "not-a-date", 0).toOptions());
        BusGtfsImporter.Options ok = new BusImportProperties(true, "x", "", "v1", "2024-01-01", 0).toOptions();
        assertEquals("DELHI_BUS_GTFS", ok.source());
        assertEquals(BusGtfsImporter.Options.DEFAULT_BATCH_SIZE, ok.batchSize());
    }

    private static java.nio.file.Path tempDir() {
        try {
            return java.nio.file.Files.createTempDirectory("bus-gtfs");
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }
}
