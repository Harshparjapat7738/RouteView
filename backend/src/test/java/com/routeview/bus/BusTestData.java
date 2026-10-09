package com.routeview.bus;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.routeview.bus.ingest.BusGtfsImporter;
import com.routeview.bus.ingest.BusImportSink;
import com.routeview.bus.ingest.BusImportStatistics;
import com.routeview.bus.model.BusAgency;
import com.routeview.bus.model.BusRoute;
import com.routeview.bus.model.BusService;
import com.routeview.bus.model.BusServiceException;
import com.routeview.bus.model.BusShape;
import com.routeview.bus.model.BusStop;
import com.routeview.bus.model.BusStopTime;
import com.routeview.bus.model.BusTrip;
import com.routeview.gtfs.GtfsSource;

/**
 * A small synthetic bus GTFS feed (made-up names, nothing from the real dataset) with valid records and a set of bad ones:
 * duplicate ids, orphan references, invalid coordinates / sequences / times, invalid shape references, a missing required value.
 */
public final class BusTestData {

    public static final String SOURCE = "TEST_BUS";
    public static final String VERSION = "2024-01-01";

    private BusTestData() {
    }

    public static Map<String, String> files() {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("agency.txt", String.join("\n",
                "agency_id,agency_name,agency_url,agency_timezone",
                "DTC,Test Transport Corporation,https://example.org/dtc,Asia/Kolkata",
                "CL,Test Cluster Buses,,Asia/Kolkata",
                "DTC,Duplicate agency,,",
                "NO,,,"));
        f.put("stops.txt", String.join("\n",
                "stop_code,stop_id,stop_lat,stop_lon,stop_name,zone_id",
                "100,S1,28.6000,77.1000,Alpha Stop,Z1",
                "101,S2,28.6100,77.1100,Bravo Stop,Z2",
                "101,S2B,28.6100,77.1100,Bravo Stop,Z3",
                "102,S3,28.6200,77.1200,Charlie Stop,Z4",
                "103,S4,28.6300,77.1300,Delta Stop,Z5",
                "104,S5,28.6400,77.1400,Echo Stop,Z6",
                "105,U1,28.7000,77.3000,Unused Stop,Z7",
                // bad records
                "100,S1,28.6000,77.1000,Alpha duplicate,Z1",
                "1,ZERO,0,0,Null Island,Z",
                "2,FAR,48.8566,2.3522,Paris,Z",
                "3,NAN,abc,77.1,Not a number,Z",
                "4,NONAME,28.61,77.11,,Z"));
        f.put("routes.txt", String.join("\n",
                "agency_id,route_id,route_long_name,route_short_name,route_type",
                "DTC,R1,Alpha to Echo,,3",
                "CL,R2,Alpha to Echo,,3",       // same long name as R1: a different route
                "DTC,R3,,,3",                    // no name at all
                "DTC,R1,Duplicate of R1,,3",
                "XX,R4,Unknown agency route,,3",
                "DTC,R5,Bad type route,,abc",
                "DTC,R6,Route without trips,,3"));
        f.put("calendar.txt", String.join("\n",
                "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
                "WK,1,1,1,1,1,0,0,20240101,20270101",
                "SAT,0,0,0,0,0,1,0,20240101,20270101",
                "BAD,1,1,1,1,1,1,1,20270101,20240101"));
        f.put("calendar_dates.txt", String.join("\n",
                "service_id,date,exception_type",
                "WK,20240126,2",
                "SAT,20240127,1",
                "WK,20240130,9"));
        f.put("shapes.txt", String.join("\n",
                "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
                "SH1,28.6000,77.1000,2",
                "SH1,28.6300,77.1300,3",
                "SH1,28.6100,77.1100,1",
                "SH2,28.6000,77.1000,1",
                "SH3,95.0,77.1,1"));
        f.put("trips.txt", String.join("\n",
                "route_id,service_id,trip_id,shape_id",
                "R1,WK,T1,SH1",
                "R1,WK,T2,",
                "R2,WK,T3,SHX",                  // shape that does not exist
                "R1,NOSVC,T4,",                  // unknown service
                "RX,WK,T5,",                     // unknown route
                "R1,WK,T1,",                     // duplicate trip id
                "R1,WK,T6,",                     // only one stop time
                "R1,WK,T7,",                     // times going backwards
                "R1,WK,T8,",                     // no stop times
                "R2,SAT,T9,"));                  // runs past midnight
        f.put("stop_times.txt", String.join("\n",
                "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
                "T1,08:00:00,08:00:00,S1,0",
                "T1,08:10:00,08:10:30,S2,1",
                "T1,08:10:00,08:10:30,S2,1",     // duplicate sequence
                "T1,08:20:00,08:20:00,S3,2",
                "T1,08:30:00,08:30:00,S4,3",
                "T2,09:00:00,09:00:00,S1,1",
                "T2,09:10:00,09:10:00,S2B,2",
                "T2,09:30:00,09:30:00,S5,3",
                "T2,xx:yy,09:40:00,S4,4",        // malformed time
                "T2,09:50:00,09:50:00,NOSTOP,5", // unknown stop
                "T2,09:55:00,09:55:00,S3,-1",    // negative sequence
                "T3,10:00:00,10:00:00,S1,0",
                "T3,10:15:00,10:15:00,S5,1",
                "T6,11:00:00,11:00:00,S1,0",
                "T7,12:00:00,12:00:00,S1,0",
                "T7,11:00:00,11:00:00,S2,1",
                "T9,23:50:00,23:50:00,S1,0",
                "T9,25:10:00,25:10:00,S2,1",
                "TX,13:00:00,13:00:00,S1,0"));   // trip that does not exist
        return f;
    }

    public static Path write(Path directory, Map<String, String> files) {
        try {
            Files.createDirectories(directory);
            for (Map.Entry<String, String> file : files.entrySet()) {
                Files.writeString(directory.resolve(file.getKey()), file.getValue() + "\n");
            }
            return directory;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static BusGtfsImporter.Options options() {
        return BusGtfsImporter.Options.india(SOURCE, VERSION, LocalDate.parse(VERSION));
    }

    /** Runs the importer over {@code files} into a recording sink. */
    public static Result run(Map<String, String> files) {
        try {
            Path dir = write(Files.createTempDirectory("bus-gtfs"), files);
            Recorder sink = new Recorder();
            BusImportStatistics stats = BusGtfsImporter.read(new GtfsSource(dir), options(), sink);
            return new Result(sink, stats);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static Result run() {
        return run(files());
    }

    public record Result(Recorder sink, BusImportStatistics stats) {
    }

    /** An in-memory sink that keeps everything it is given (and how many batches it took). */
    public static final class Recorder implements BusImportSink {
        public final List<BusAgency> agencies = new ArrayList<>();
        public final List<BusStop> stops = new ArrayList<>();
        public final List<BusRoute> routes = new ArrayList<>();
        public final List<BusService> services = new ArrayList<>();
        public final List<BusServiceException> exceptions = new ArrayList<>();
        public final List<BusShape> shapes = new ArrayList<>();
        public final List<BusTrip> trips = new ArrayList<>();
        public final List<BusStopTime> stopTimes = new ArrayList<>();
        public final List<UUID> discarded = new ArrayList<>();
        public int stopTimeBatches;
        public boolean finished;

        @Override
        public void agencies(List<BusAgency> list) {
            agencies.addAll(list);
        }

        @Override
        public void stops(List<BusStop> list) {
            stops.addAll(list);
        }

        @Override
        public void routes(List<BusRoute> list) {
            routes.addAll(list);
        }

        @Override
        public void services(List<BusService> list, List<BusServiceException> list2) {
            services.addAll(list);
            exceptions.addAll(list2);
        }

        @Override
        public void shapes(List<BusShape> list) {
            shapes.addAll(list);
        }

        @Override
        public void trips(List<BusTrip> list) {
            trips.addAll(list);
        }

        @Override
        public void stopTimes(List<BusStopTime> list) {
            stopTimeBatches++;
            stopTimes.addAll(list);
        }

        @Override
        public void discardTrips(Collection<UUID> ids) {
            discarded.addAll(ids);
        }

        @Override
        public void finish(BusImportStatistics statistics) {
            finished = true;
        }

        /** Trips that stay after the discarded ones are removed again. */
        public List<BusTrip> keptTrips() {
            return trips.stream().filter(t -> !discarded.contains(t.id())).toList();
        }
    }
}
