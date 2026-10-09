package com.routeview.metro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.routeview.common.accessibility.Accessibility.Status;
import com.routeview.gtfs.GtfsSource;
import com.routeview.metro.ingest.MetroDataset;
import com.routeview.metro.ingest.MetroGtfsImporter;
import com.routeview.metro.journey.MetroJourney;
import com.routeview.metro.journey.MetroJourneyBuilder;
import com.routeview.metro.model.MetroDatasetInfo;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitStep;

/** Station accessibility comes only from explicit wheelchair_boarding statements, combined conservatively. */
class MetroAccessibilityTest {

    // Blue: Alpha - Bravo - Central - Delta - Echo; Yellow joins at Central (stops CB and CY).
    private static MetroDataset read(String... stopRows) {
        Map<String, String> files = new LinkedHashMap<>(MetroTestData.files());
        files.put("stops.txt", String.join("\n", stopRows));
        try {
            var dir = Files.createTempDirectory("metro-wc");
            for (Map.Entry<String, String> f : files.entrySet()) {
                Files.writeString(dir.resolve(f.getKey()), f.getValue() + "\n");
            }
            return MetroGtfsImporter.read(new GtfsSource(dir), MetroTestData.options());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String[] stops(String alpha, String bravo, String cb, String cy, String delta, String echo) {
        return new String[] {
                "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,wheelchair_boarding",
                "B1,Alpha,28.6000,77.1000,0,," + alpha,
                "B2,Bravo Metro Station,28.6000,77.1200,0,," + bravo,
                "CB,Central,28.6000,77.1400,0,," + cb,
                "B4,Delta,28.6000,77.1600,0,," + delta,
                "B5,Echo,28.6000,77.1800,0,," + echo,
                "F1,Foxtrot,28.6100,77.1500,0,,",
                "G1,Golf,28.6200,77.1600,0,,",
                "Y1,Hotel,28.5600,77.1400,0,,",
                "CY,Central,28.6004,77.1405,0,," + cy,
                "Y3,India,28.6400,77.1400,0,,",
                "Y4,Juliet,28.6600,77.1400,0,,"};
    }

    private static MetroStation station(MetroDataset d, String name) {
        return d.stations().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    void explicitStatementsBecomeStatusAndAnythingElseIsUnknown() {
        MetroDataset d = read(stops("1", "2", "1", "1", "0", ""));
        assertEquals(Status.ACCESSIBLE, station(d, "Alpha").accessibility().status());
        assertEquals(Status.INACCESSIBLE, station(d, "Bravo Metro Station").accessibility().status());
        assertEquals(Status.ACCESSIBLE, station(d, "Central").accessibility().status()); // both of its stops say accessible
        assertEquals(Status.UNKNOWN, station(d, "Delta").accessibility().status()); // 0 = no information
        assertEquals(Status.UNKNOWN, station(d, "Echo").accessibility().status()); // empty
        assertEquals(Status.UNKNOWN, station(d, "Foxtrot").accessibility().status()); // column present, no value
        MetroStation alpha = station(d, "Alpha");
        assertEquals(MetroTestData.SOURCE, alpha.accessibility().source());
        assertEquals(MetroTestData.VERSION, alpha.accessibility().sourceVersion());
        assertFalse(station(d, "Delta").metadata().containsKey(MetroStation.WHEELCHAIR_KEY));
    }

    @Test
    void aStationMadeOfStopsThatDisagreeOrAreIncompleteIsUnknown() {
        assertEquals(Status.UNKNOWN, station(read(stops("", "", "1", "2", "", "")), "Central").accessibility().status());
        assertEquals(Status.UNKNOWN, station(read(stops("", "", "1", "", "", "")), "Central").accessibility().status());
        assertEquals(Status.INACCESSIBLE, station(read(stops("", "", "2", "2", "", "")), "Central").accessibility().status());
    }

    @Test
    void aStopWithoutItsOwnStatementTakesItsParentStationsAndItsOwnWins() {
        MetroDataset d = read(
                "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,wheelchair_boarding",
                "B1,Alpha,28.6000,77.1000,0,,",
                "B2,Bravo Metro Station,28.6000,77.1200,0,,",
                "CB,Central,28.6000,77.1400,0,,",
                "PD,Delta,28.6000,77.1600,1,,1",
                "B4,Delta,28.6000,77.1600,0,PD,",
                "PE,Echo,28.6000,77.1800,1,,2",
                "B5,Echo,28.6000,77.1800,0,PE,1",
                "F1,Foxtrot,28.6100,77.1500,0,,",
                "G1,Golf,28.6200,77.1600,0,,",
                "Y1,Hotel,28.5600,77.1400,0,,",
                "CY,Central,28.6004,77.1405,0,,",
                "Y3,India,28.6400,77.1400,0,,",
                "Y4,Juliet,28.6600,77.1400,0,,");
        assertEquals(Status.ACCESSIBLE, station(d, "Delta").accessibility().status());
        assertEquals(Status.ACCESSIBLE, station(d, "Echo").accessibility().status());
    }

    @Test
    void aDatasetWithoutTheColumnIsAllUnknown() {
        MetroDataset d = MetroTestData.dataset();
        assertTrue(d.stations().size() > 0);
        d.stations().forEach(s -> assertEquals(Status.UNKNOWN, s.accessibility().status(), s.name()));
    }

    @Test
    void journeyStationsCarryTheirStatusAndUnmatchedProviderStationsAreUnknown() {
        MetroDataset d = read(stops("1", "2", "1", "1", "0", ""));
        MetroNetwork network = new MetroNetwork(new MetroDatasetInfo(MetroTestData.SOURCE, MetroTestData.VERSION, LocalDate.of(2023, 8, 10), Instant.parse("2026-10-08T00:00:00Z")),
                d.stations(), d.lines(), d.stationLines());
        MetroStation alpha = station(d, "Alpha");
        MetroStation central = station(d, "Central");
        TransitStep ride = new TransitStep(TransitStep.Kind.RIDE, "Blue Line", "SUBWAY", "Alpha Metro Station", "Central Metro Station",
                "2026-10-08T05:10:00Z", "2026-10-08T05:30:00Z", "Echo", 2, 9000, 1200,
                alpha.latitude(), alpha.longitude(), central.latitude(), central.longitude(), "", "");
        TransitInfo transit = new TransitInfo(List.of(ride), 0, "2026-10-08T05:10:00Z", "2026-10-08T05:30:00Z", null);
        Optional<MetroJourney> journey = MetroJourneyBuilder.build(transit, network);
        MetroJourney.Segment segment = journey.orElseThrow().segments().get(0);
        assertEquals(Status.ACCESSIBLE, segment.boarding().accessibility().status());
        assertEquals(MetroTestData.SOURCE, segment.boarding().accessibility().source());
        assertEquals(Status.ACCESSIBLE, segment.exit().accessibility().status());

        // a station the provider names but that matches nothing in the dataset has no statement
        TransitStep far = new TransitStep(TransitStep.Kind.RIDE, "Blue Line", "SUBWAY", "Nowhere Metro Station", "Elsewhere Metro Station",
                "2026-10-08T05:10:00Z", "2026-10-08T05:30:00Z", "", 2, 9000, 1200, 12.0, 70.0, 12.5, 70.5, "", "");
        Optional<MetroJourney> unmatched = MetroJourneyBuilder.build(new TransitInfo(List.of(far), 0, "", "", null), network);
        unmatched.ifPresent(j -> j.segments().forEach(s -> {
            if (s.boarding() != null) assertEquals(Status.UNKNOWN, s.boarding().accessibility().status());
            if (s.exit() != null) assertEquals(Status.UNKNOWN, s.exit().accessibility().status());
        }));
    }
}
