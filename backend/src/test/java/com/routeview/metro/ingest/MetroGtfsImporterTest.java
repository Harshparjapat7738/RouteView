package com.routeview.metro.ingest;

import com.routeview.gtfs.GtfsSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.routeview.metro.MetroTestData;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;
import com.routeview.metro.model.MetroStationLine;

class MetroGtfsImporterTest {

    private final MetroDataset dataset = MetroTestData.dataset();
    private final MetroImportStatistics stats = dataset.statistics();

    private MetroStation station(String name) {
        return dataset.stations().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    private MetroLine line(String name) {
        return dataset.lines().stream().filter(l -> l.name().equals(name)).findFirst().orElseThrow();
    }

    private List<String> namesOf(MetroLine line, String pattern) {
        return dataset.stationLines().stream()
                .filter(l -> l.lineId().equals(line.id()) && l.pattern().equals(pattern))
                .sorted(java.util.Comparator.comparingInt(MetroStationLine::sequence))
                .map(l -> dataset.stations().stream().filter(s -> s.id().equals(l.stationId())).findFirst().orElseThrow().name())
                .toList();
    }

    @Test
    void importsStationsLinesAndInterchange() {
        assertEquals(10, dataset.stations().size());
        assertEquals(10, stats.stationsImported);
        assertEquals(2, dataset.lines().size());
        // The two stops named Central (different ids, 60 m apart) are ONE interchange station.
        assertEquals(1, stats.interchangeStations);
        MetroStation central = station("Central");
        Set<UUID> linesAtCentral = dataset.stationLines().stream().filter(l -> l.stationId().equals(central.id())).map(MetroStationLine::lineId).collect(Collectors.toSet());
        assertEquals(2, linesAtCentral.size());
        assertEquals("CB,CY", central.metadata().get("stopIds"));
    }

    @Test
    void keepsLineDetailsOnlyWhenValid() {
        assertEquals("#0000FF", line("Blue Line").displayColor());
        assertEquals("BLUE", line("Blue Line").shortName());
        assertNull(line("Yellow Line").displayColor(), "an invalid colour is dropped, never invented");
        assertNull(line("Yellow Line").shortName());
    }

    @Test
    void ordersStationsOfEachPatternAndKeepsBranches() {
        MetroLine blue = line("Blue Line");
        Set<String> patterns = dataset.stationLines().stream().filter(l -> l.lineId().equals(blue.id())).map(MetroStationLine::pattern).collect(Collectors.toSet());
        // The return trips and the short-turn trip (Bravo-Central-Delta) add no pattern; the branch does.
        assertEquals(Set.of("P1", "P2"), patterns);
        List<String> p1 = namesOf(blue, "P1");
        List<String> p2 = namesOf(blue, "P2");
        assertTrue(p1.equals(List.of("Alpha", "Bravo Metro Station", "Central", "Foxtrot", "Golf")) || p2.equals(List.of("Alpha", "Bravo Metro Station", "Central", "Foxtrot", "Golf")));
        assertTrue(p1.equals(List.of("Alpha", "Bravo Metro Station", "Central", "Delta", "Echo")) || p2.equals(List.of("Alpha", "Bravo Metro Station", "Central", "Delta", "Echo"))
                || p1.equals(List.of("Echo", "Delta", "Central", "Bravo Metro Station", "Alpha")) || p2.equals(List.of("Echo", "Delta", "Central", "Bravo Metro Station", "Alpha")));
        // sequences start at 1 and have no gaps
        for (String pattern : patterns) {
            List<Integer> sequences = dataset.stationLines().stream().filter(l -> l.lineId().equals(blue.id()) && l.pattern().equals(pattern)).map(MetroStationLine::sequence).sorted().toList();
            for (int i = 0; i < sequences.size(); i++) {
                assertEquals(i + 1, (int) sequences.get(i));
            }
        }
        assertEquals(1, dataset.stationLines().stream().filter(l -> l.lineId().equals(line("Yellow Line").id())).map(MetroStationLine::pattern).collect(Collectors.toSet()).size());
    }

    @Test
    void rejectsInvalidRecordsAndCountsThem() {
        // Z0 (0,0), Z1 (outside the region), Z2 (not a number), Z3 (no name), route R3 (no name), trip of unknown route RX,
        // stop time of unknown trip TX, unknown stop NOPE, invalid sequence x
        assertEquals(9, stats.invalidRecords, stats.rejectionReasons().toString());
        assertTrue(stats.rejectionReasons().containsKey("invalid coordinates"));
        assertTrue(stats.rejectionReasons().containsKey("coordinates outside the supported region"));
        assertTrue(stats.rejectionReasons().containsKey("station without a name"));
        assertTrue(stats.rejectionReasons().containsKey("route without a name"));
        assertTrue(stats.rejectionReasons().containsKey("trip of an unknown route"));
        assertTrue(stats.rejectionReasons().containsKey("stop time of an unknown trip"));
        assertTrue(stats.rejectionReasons().containsKey("stop time of an unknown stop"));
        assertTrue(stats.rejectionReasons().containsKey("invalid stop sequence"));
        assertTrue(dataset.stations().stream().noneMatch(s -> s.name().equals("Null Island") || s.name().equals("Faraway")));
    }

    @Test
    void skipsDuplicatesAndNonStationStops() {
        // duplicate stop B1, duplicate route R1, duplicate trip T1, duplicate stop time (T1,1)
        assertEquals(4, stats.duplicatesSkipped);
        assertEquals(1, stats.nonStationStopsSkipped); // the entrance
        assertEquals(1, stats.unusedStationsSkipped); // "Unused" is on no trip
        assertTrue(dataset.stations().stream().noneMatch(s -> s.name().equals("Unused") || s.name().equals("Alpha entrance")));
    }

    @Test
    void reportsStatisticsInFeedTerms() {
        assertEquals(2, stats.routesImported);
        assertEquals(4, stats.routesRead); // R1, R2, R1 dup, R3
        assertEquals(6, stats.tripsImported);
        assertTrue(stats.stopTimesImported > 20);
        assertTrue(stats.toString().contains("Stations imported: 10"));
        assertEquals(10, stats.asMap().get("stationsImported"));
    }

    @Test
    void importIsIdempotentAndIdsAreStable() {
        MetroDataset again = MetroTestData.dataset();
        assertEquals(dataset.stations(), again.stations());
        assertEquals(dataset.lines(), again.lines());
        assertEquals(dataset.stationLines(), again.stationLines());
        assertEquals(new HashSet<>(dataset.stations().stream().map(MetroStation::id).toList()).size(), dataset.stations().size());
    }

    @Test
    void aNewerDatasetKeepsIdsAndCarriesItsOwnVersion() {
        MetroGtfsImporter.Options newer = MetroGtfsImporter.Options.india(MetroTestData.SOURCE, "2026-01-01", null);
        try {
            Path dir = Files.createTempDirectory("metro-newer");
            MetroDataset updated = MetroGtfsImporter.read(new GtfsSource(MetroTestData.writeDirectory(dir)), newer);
            assertEquals(dataset.stations().stream().map(MetroStation::id).toList(), updated.stations().stream().map(MetroStation::id).toList());
            assertEquals("2026-01-01", updated.sourceVersion());
            assertEquals("2026-01-01", updated.stations().get(0).sourceVersion());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void readsAZipAsWellAsAFolder() throws IOException {
        Path zip = MetroTestData.writeZip(Files.createTempDirectory("metro-zip").resolve("gtfs.zip"));
        MetroDataset fromZip = MetroGtfsImporter.read(new GtfsSource(zip), MetroTestData.options());
        assertEquals(dataset.stations(), fromZip.stations());
        assertEquals(dataset.stationLines(), fromZip.stationLines());
    }

    @Test
    void requiresTheTablesColumnsAndAVersion() throws IOException {
        Path dir = MetroTestData.writeDirectory(Files.createTempDirectory("metro-bad"));
        Files.writeString(dir.resolve("stops.txt"), "stop_id,stop_name,stop_lat\nA,Alpha,28.6\n");
        assertThrows(GtfsSource.InvalidFeedException.class, () -> MetroGtfsImporter.read(new GtfsSource(dir), MetroTestData.options()));
        Path noTrips = MetroTestData.writeDirectory(Files.createTempDirectory("metro-bad2"));
        Files.delete(noTrips.resolve("trips.txt"));
        assertThrows(GtfsSource.InvalidFeedException.class, () -> MetroGtfsImporter.read(new GtfsSource(noTrips), MetroTestData.options()));
        assertThrows(IllegalArgumentException.class, () -> MetroGtfsImporter.read(new GtfsSource(dir), MetroGtfsImporter.Options.india("X", " ", null)));
    }

    @Test
    void stationsWithTheSameNameFarApartStaySeparate() throws IOException {
        Path dir = MetroTestData.writeDirectory(Files.createTempDirectory("metro-names"));
        Files.writeString(dir.resolve("stops.txt"), String.join("\n", "stop_id,stop_name,stop_lat,stop_lon",
                "A1,Same Name,28.60,77.10", "A2,Same Name,28.70,77.30", "A3,Other,28.65,77.20") + "\n");
        Files.writeString(dir.resolve("trips.txt"), "route_id,trip_id\nR1,T1\n");
        Files.writeString(dir.resolve("stop_times.txt"), "trip_id,stop_id,stop_sequence\nT1,A1,1\nT1,A3,2\nT1,A2,3\n");
        Files.writeString(dir.resolve("routes.txt"), "route_id,route_long_name\nR1,Test Line\n");
        MetroDataset result = MetroGtfsImporter.read(new GtfsSource(dir), MetroTestData.options());
        assertEquals(3, result.stations().size(), "names are not unique: two stations may share one");
        assertNotNull(result.stationLines());
    }

    @Test
    void normalisesNamesSafely() {
        assertEquals("Rajiv Chowk", MetroNameNormalizer.display("  Rajiv   Chowk\t"));
        assertEquals("rajiv chowk", MetroNameNormalizer.key("Rajiv Chowk Metro Station"));
        assertEquals("rajiv chowk", MetroNameNormalizer.key("RAJIV CHOWK (Blue Line)"));
        assertEquals("kashmere gate", MetroNameNormalizer.key("Kashmere  Gate station"));
        assertEquals("", MetroNameNormalizer.display(null));
        assertFalse(MetroNameNormalizer.display("x".repeat(400)).length() > 255);
    }
}
