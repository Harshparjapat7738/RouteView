package com.routeview.metro;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.routeview.gtfs.GtfsSource;
import com.routeview.metro.ingest.MetroDataset;
import com.routeview.metro.ingest.MetroGtfsImporter;
import com.routeview.metro.model.MetroDatasetInfo;
import com.routeview.metro.model.MetroNetwork;

/**
 * A small synthetic GTFS feed (made-up station names, nothing from a real dataset) with two lines, one
 * interchange whose stops have different ids, a branch, return trips, a short-turn trip and a set of bad records.
 *
 *   Blue:   Alpha - Bravo - Central - Delta - Echo        (branch: Central - Foxtrot - Golf)
 *   Yellow: Hotel - Central - India - Juliet
 */
public final class MetroTestData {

    public static final String SOURCE = "TEST_GTFS";
    public static final String VERSION = "2023-08-10";

    private MetroTestData() {
    }

    public static Map<String, String> files() {
        return Map.of(
                "stops.txt", String.join("\n",
                        "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station",
                        "B1,Alpha,28.6000,77.1000,0,",
                        "B2,Bravo Metro Station,28.6000,77.1200,0,",
                        "CB,Central,28.6000,77.1400,0,",
                        "B4,Delta,28.6000,77.1600,0,",
                        "B5,Echo,28.6000,77.1800,0,",
                        "F1,Foxtrot,28.6100,77.1500,0,",
                        "G1,Golf,28.6200,77.1600,0,",
                        "Y1,Hotel,28.5600,77.1400,0,",
                        "CY,Central,28.6004,77.1405,0,",
                        "Y3,India,28.6400,77.1400,0,",
                        "Y4,Juliet,28.6600,77.1400,0,",
                        // bad / skipped records
                        "B1,Alpha duplicate,28.6000,77.1000,0,",
                        "Z0,Null Island,0,0,0,",
                        "Z1,Faraway,48.8566,2.3522,0,",
                        "Z2,Not a number,abc,77.1,0,",
                        "Z3,,28.61,77.11,0,",
                        "E1,Alpha entrance,28.6001,77.1001,2,",
                        "U1,Unused,28.7000,77.3000,0,"),
                "routes.txt", String.join("\n",
                        "route_id,route_short_name,route_long_name,route_type,route_color",
                        "R1,BLUE,Blue Line,1,0000FF",
                        "R2,,Yellow Line,1,notacolor",
                        "R1,DUP,Blue duplicate,1,0000FF",
                        "R3,,,1,"),
                "trips.txt", String.join("\n",
                        "route_id,trip_id,direction_id",
                        "R1,T1,0", "R1,T2,1", "R1,T3,0", "R1,T4,0", "R2,T5,0", "R2,T6,1",
                        "RX,TX,0",
                        "R1,T1,0"),
                "stop_times.txt", String.join("\n",
                        "trip_id,stop_id,stop_sequence,arrival_time,departure_time",
                        "T1,B1,1,,", "T1,B2,2,,", "T1,CB,3,,", "T1,B4,4,,", "T1,B5,5,,",
                        "T2,B5,1,,", "T2,B4,2,,", "T2,CB,3,,", "T2,B2,4,,", "T2,B1,5,,",
                        "T3,B1,1,,", "T3,B2,2,,", "T3,CB,3,,", "T3,F1,4,,", "T3,G1,5,,",
                        "T4,B2,1,,", "T4,CB,2,,", "T4,B4,3,,",
                        "T5,Y1,1,,", "T5,CY,2,,", "T5,Y3,3,,", "T5,Y4,4,,",
                        "T6,Y4,1,,", "T6,Y3,2,,", "T6,CY,3,,", "T6,Y1,4,,",
                        "TX,B1,1,,",
                        "T1,NOPE,9,,",
                        "T1,B1,1,,",
                        "T1,B1,x,,"));
    }

    public static Path writeDirectory(Path dir) {
        try {
            for (Map.Entry<String, String> file : files().entrySet()) {
                Files.writeString(dir.resolve(file.getKey()), file.getValue() + "\n", StandardCharsets.UTF_8);
            }
            return dir;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static Path writeZip(Path zip) {
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(zip))) {
            for (Map.Entry<String, String> file : files().entrySet()) {
                out.putNextEntry(new ZipEntry(file.getKey()));
                out.write((file.getValue() + "\n").getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
            return zip;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static MetroGtfsImporter.Options options() {
        return MetroGtfsImporter.Options.india(SOURCE, VERSION, LocalDate.of(2023, 8, 10));
    }

    public static MetroDataset dataset() {
        try {
            Path dir = Files.createTempDirectory("metro-fixture");
            return MetroGtfsImporter.read(new GtfsSource(writeDirectory(dir)), options());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static MetroNetwork network() {
        MetroDataset dataset = dataset();
        return new MetroNetwork(new MetroDatasetInfo(SOURCE, VERSION, LocalDate.of(2023, 8, 10), Instant.parse("2026-10-08T00:00:00Z")),
                dataset.stations(), dataset.lines(), dataset.stationLines());
    }
}
