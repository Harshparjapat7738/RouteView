package com.routeview.metro;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.routeview.gtfs.GtfsSource;
import com.routeview.metro.ingest.MetroDataset;
import com.routeview.metro.ingest.MetroGtfsImporter;
import com.routeview.metro.model.MetroDatasetInfo;
import com.routeview.metro.model.MetroNetwork;

/**
 * A synthetic feed (made-up names) shaped like the problem cases of a real metro network:
 *
 *   Main (Blue):  B01 B02 B03 B04 B05 B06 B07 B08 B09 B10        service M1 "Blue Line (Main Line)"
 *   Spur (Blue):  B01 B02 B03 B04 S05 S06                        service M2 "Blue Line (Spur Branch)"  - same name base, colour and trunk
 *   Yellow:       Y01 B03 Y03 YS Y05                             B03 is a real interchange (Blue x Yellow)
 *   Rapid:        R01 RS R03                                     RS "Sikan (Rapid Metro)" is the same place as YS "Sikan"
 *   Twin 1 / 2:   TA TC TB   and   TD TC TE                      two services with the SAME name and colour that share only a station
 *
 * Shapes: M1 (points listed out of order), M2, Y; Rapid and Twin 2 have no shape, Twin 1 has a one-point (invalid) shape.
 */
public final class MetroBranchTestData {

    public static final String SOURCE = "BRANCH_GTFS";
    public static final String VERSION = "2024-01-01";

    private MetroBranchTestData() {
    }

    private static String stop(String id, String name, double lat, double lon) {
        return id + "," + name + "," + lat + "," + lon + ",0,";
    }

    public static Map<String, String> files(boolean withCalendar, boolean withShapes) {
        Map<String, String> files = new LinkedHashMap<>();
        StringBuilder stops = new StringBuilder("stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n");
        for (int i = 1; i <= 10; i++) {
            stops.append(stop(String.format("B%02d", i), "Blue " + i, 28.60, 77.10 + 0.01 * i)).append('\n');
        }
        stops.append(stop("S05", "Spur 5", 28.61, 77.14)).append('\n')
                .append(stop("S06", "Spur 6", 28.62, 77.14)).append('\n')
                .append(stop("Y01", "Yellow 1", 28.55, 77.13)).append('\n')
                .append(stop("Y03", "Yellow 3", 28.65, 77.13)).append('\n')
                .append(stop("YS", "Sikan", 28.70, 77.13)).append('\n')
                .append(stop("Y05", "Yellow 5", 28.72, 77.13)).append('\n')
                .append(stop("R01", "Rapid 1", 28.69, 77.15)).append('\n')
                .append(stop("RS", "Sikan (Rapid Metro)", 28.7010, 77.1310)).append('\n')
                .append(stop("R03", "Rapid 3", 28.71, 77.15)).append('\n')
                .append(stop("TA", "Twin A", 28.40, 77.30)).append('\n')
                .append(stop("TB", "Twin B", 28.42, 77.32)).append('\n')
                .append(stop("TC", "Twin C", 28.41, 77.31)).append('\n')
                .append(stop("TD", "Twin D", 28.40, 77.32)).append('\n')
                .append(stop("TE", "Twin E", 28.42, 77.30)).append('\n')
                .append(stop("CO1", "Same Spot One", 28.30, 77.40)).append('\n')
                .append(stop("CO2", "Same Spot Two", 28.30, 77.40)).append('\n');
        files.put("stops.txt", stops.toString());
        files.put("routes.txt", String.join("\n",
                "route_id,route_short_name,route_long_name,route_type,route_color",
                "M1,3,Blue Line (Main Line),1,0000FF",
                "M2,4,Blue Line (Spur Branch),1,0000FF",
                "Y1,2,Yellow Line,1,FFFF00",
                "R1,Rapid,Rapid Metro,1,00FFFF",
                "T1,T1,Twin Line,1,AAAAAA",
                "T2,T2,Twin Line,1,AAAAAA",
                "K1,K,Colocated,1,123456") + "\n");
        List<String[]> patterns = List.of(
                new String[]{"M1", "shp_M1", "B01,B02,B03,B04,B05,B06,B07,B08,B09,B10"},
                new String[]{"M2", "shp_M2", "B01,B02,B03,B04,S05,S06"},
                new String[]{"Y1", "shp_Y", "Y01,B03,Y03,YS,Y05"},
                new String[]{"R1", "", "R01,RS,R03"},
                new String[]{"T1", "shp_bad", "TA,TC,TB"},
                new String[]{"T2", "", "TD,TC,TE"},
                new String[]{"K1", "", "CO1,CO2"});
        StringBuilder trips = new StringBuilder("route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n");
        StringBuilder times = new StringBuilder("trip_id,stop_id,stop_sequence,arrival_time,departure_time\n");
        int n = 0;
        for (String[] p : patterns) {
            String[] ids = p[2].split(",");
            for (int dir = 0; dir < 2; dir++) {
                String trip = p[0] + "_" + dir;
                trips.append(p[0]).append(n % 2 == 0 ? ",weekday," : ",saturday,").append(trip).append(",,,").append(p[1]).append('\n');
                n++;
                for (int i = 0; i < ids.length; i++) {
                    String id = dir == 0 ? ids[i] : ids[ids.length - 1 - i];
                    times.append(trip).append(',').append(id).append(',').append(i + 1).append(",,\n");
                }
            }
        }
        files.put("trips.txt", trips.toString());
        files.put("stop_times.txt", times.toString());
        if (withShapes) {
            files.put("shapes.txt", String.join("\n",
                    "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
                    "shp_M1,28.6010,77.1200,3", "shp_M1,28.6000,77.1100,1", "shp_M1,28.6005,77.1150,2", "shp_M1,28.6000,77.2000,4",
                    "shp_M2,28.6000,77.1100,1", "shp_M2,28.6200,77.1400,2",
                    "shp_Y,28.5500,77.1300,1", "shp_Y,28.7200,77.1300,2",
                    "shp_bad,28.4000,77.3000,1") + "\n");
        }
        if (withCalendar) {
            files.put("calendar.txt", String.join("\n",
                    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
                    "weekday,1,1,1,1,1,0,0,20240101,20241231",
                    "saturday,0,0,0,0,0,1,0,20240201,20240630") + "\n");
        }
        return files;
    }

    public static MetroDataset dataset() {
        return dataset(true, true);
    }

    public static MetroDataset dataset(boolean withCalendar, boolean withShapes) {
        try {
            Path dir = Files.createTempDirectory("metro-branch");
            for (Map.Entry<String, String> file : files(withCalendar, withShapes).entrySet()) {
                Files.writeString(dir.resolve(file.getKey()), file.getValue(), StandardCharsets.UTF_8);
            }
            return MetroGtfsImporter.read(new GtfsSource(dir), MetroGtfsImporter.Options.india(SOURCE, VERSION, LocalDate.of(2024, 1, 1)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static MetroNetwork network() {
        MetroDataset d = dataset();
        return new MetroNetwork(new MetroDatasetInfo(SOURCE, VERSION, LocalDate.of(2024, 1, 1), Instant.parse("2026-10-08T00:00:00Z"), d.servicePeriod()),
                d.stations(), d.lines(), d.stationLines(), d.connections(), d.shapes());
    }
}
