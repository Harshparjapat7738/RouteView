package com.routeview.bus.ingest;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;

import com.routeview.bus.model.BusAgency;
import com.routeview.bus.model.BusRoute;
import com.routeview.bus.model.BusService;
import com.routeview.bus.model.BusServiceException;
import com.routeview.bus.model.BusShape;
import com.routeview.bus.model.BusStop;
import com.routeview.common.accessibility.Accessibility;
import com.routeview.bus.model.BusStopTime;
import com.routeview.bus.model.BusTrip;
import com.routeview.gtfs.GtfsSource;
import com.routeview.gtfs.GtfsText;

/**
 * Reads a bus GTFS feed (the Delhi bus dataset: stops, routes, trips, stop_times, optionally agency, calendar,
 * calendar_dates, shapes) into RouteView's own bus model and hands the validated records to a {@link BusImportSink}.
 *
 * <ul>
 *   <li>Every record is validated; invalid ones are rejected and counted, they never stop the import. Nothing is invented:
 *       a missing optional value stays null, an unknown shape reference is cleared (and counted), not replaced.</li>
 *   <li>Identity is the GTFS id. Ids in the database are derived from {@code source + kind + id}, so re-importing the
 *       same dataset yields the same records. Display names are never identities.</li>
 *   <li>{@code stop_times} (millions of rows) are streamed trip by trip: a trip is validated as a whole and written in batches.</li>
 *   <li>Fare files (fare_attributes / fare_rules) and any other table are intentionally not read.</li>
 * </ul>
 */
public final class BusGtfsImporter {

    /**
     * @param batchSize rows per call to the sink
     */
    public record Options(
            String source,
            String sourceVersion,
            LocalDate sourceUpdatedAt,
            int batchSize,
            double minLatitude,
            double maxLatitude,
            double minLongitude,
            double maxLongitude) {

        public static final int DEFAULT_BATCH_SIZE = 5_000;

        /** Plausible bounds of India: rejects swapped, zero or foreign coordinates without being region-specific. */
        public static Options india(String source, String sourceVersion, LocalDate sourceUpdatedAt) {
            return new Options(source, sourceVersion, sourceUpdatedAt, DEFAULT_BATCH_SIZE, 6.0, 38.0, 68.0, 98.0);
        }
    }

    private static final Pattern TIME = Pattern.compile("^(\\d{1,2}):([0-5]\\d):([0-5]\\d)$");
    private static final Pattern COLOR = Pattern.compile("^[0-9A-Fa-f]{6}$");
    private static final int MAX_HOURS = 47;
    private static final String[] DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"};
    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private BusGtfsImporter() {
    }

    /** Validates {@code feed} and streams it into {@code sink}. Throws when the feed is unusable as a whole. */
    public static BusImportStatistics read(GtfsSource feed, Options options, BusImportSink sink) {
        if (options.sourceVersion() == null || options.sourceVersion().isBlank()) {
            throw new IllegalArgumentException("A source version is required (publication date or version label)");
        }
        BusImportStatistics stats = new BusImportStatistics();
        String source = options.source();
        int batch = Math.max(1, options.batchSize());

        // ---- agencies (optional)
        Set<String> agencyIds = new LinkedHashSet<>();
        List<BusAgency> agencies = new ArrayList<>();
        if (feed.hasTable("agency.txt")) {
            stats.agenciesRead = feed.forEachRow("agency.txt", List.of("agency_name"), row -> {
                String id = row.getOrDefault("agency_id", "");
                String name = GtfsText.display(row.getOrDefault("agency_name", ""));
                if (id.isBlank() || name.isEmpty()) {
                    stats.invalid("agency without an id or name");
                } else if (!agencyIds.add(id)) {
                    stats.duplicatesSkipped++;
                } else {
                    agencies.add(new BusAgency(GtfsText.stableId(source, "bus-agency", id), id, name, blankToNull(row.get("agency_url")),
                            blankToNull(row.get("agency_timezone"))));
                }
            });
        } else {
            stats.warn("The dataset has no agency.txt");
        }
        stats.agenciesImported = agencies.size();
        sink.agencies(agencies);

        // ---- stops
        Map<String, UUID> stopIds = new HashMap<>();
        List<BusStop> stopBatch = new ArrayList<>();
        stats.stopsRead = feed.forEachRow("stops.txt", List.of("stop_id", "stop_name", "stop_lat", "stop_lon"), row -> {
            BusStop stop = readStop(row, options, stopIds, stats);
            if (stop != null) {
                stopIds.put(stop.externalId(), stop.id());
                stopBatch.add(stop);
                if (stopBatch.size() >= batch) {
                    sink.stops(List.copyOf(stopBatch));
                    stopBatch.clear();
                }
            }
        });
        sink.stops(List.copyOf(stopBatch));
        stats.stopsImported = stopIds.size();

        // ---- routes
        Map<String, UUID> routeIds = new HashMap<>();
        List<BusRoute> routes = new ArrayList<>();
        stats.routesRead = feed.forEachRow("routes.txt", List.of("route_id"), row -> {
            BusRoute route = readRoute(row, source, agencyIds, !agencyIds.isEmpty(), routeIds, stats);
            if (route != null) {
                routeIds.put(route.externalId(), route.id());
                routes.add(route);
            }
        });
        stats.routesImported = routes.size();
        for (int from = 0; from < routes.size(); from += batch) {
            sink.routes(List.copyOf(routes.subList(from, Math.min(routes.size(), from + batch))));
        }
        if (routes.isEmpty()) {
            sink.routes(List.of());
        }

        // ---- calendar
        Map<String, BusService> services = new LinkedHashMap<>();
        List<BusServiceException> exceptions = new ArrayList<>();
        boolean hasCalendar = feed.hasTable("calendar.txt");
        boolean hasCalendarDates = feed.hasTable("calendar_dates.txt");
        if (hasCalendar) {
            feed.forEachRow("calendar.txt", List.of("service_id"), row -> readService(row, services, stats));
        }
        Set<String> exceptionServices = new HashSet<>();
        if (hasCalendarDates) {
            feed.forEachRow("calendar_dates.txt", List.of("service_id", "date", "exception_type"), row -> {
                String id = row.getOrDefault("service_id", "");
                String type = row.getOrDefault("exception_type", "");
                try {
                    LocalDate date = LocalDate.parse(row.getOrDefault("date", ""), DATE);
                    if (id.isBlank() || !(type.equals("1") || type.equals("2"))) {
                        stats.invalid("invalid calendar date entry");
                        return;
                    }
                    exceptions.add(new BusServiceException(id, date, type.equals("1")));
                    exceptionServices.add(id);
                } catch (RuntimeException e) {
                    stats.invalid("invalid calendar date entry");
                }
            });
        }
        if (!hasCalendar && !hasCalendarDates) {
            stats.warn("The dataset has neither calendar.txt nor calendar_dates.txt: the days of service are unknown");
        }
        stats.servicesImported = services.size();
        stats.calendarDatesImported = exceptions.size();
        sink.services(List.copyOf(services.values()), List.copyOf(exceptions));

        // ---- shapes (optional)
        Set<String> shapeIds = readShapes(feed, options, sink, batch, stats);

        // ---- trips
        Map<String, UUID> tripIds = new HashMap<>();
        Set<String> routesWithTrips = new HashSet<>();
        Set<String> servicesUsed = new LinkedHashSet<>();
        List<BusTrip> tripBatch = new ArrayList<>();
        boolean checkService = hasCalendar || hasCalendarDates;
        stats.tripsRead = feed.forEachRow("trips.txt", List.of("route_id", "service_id", "trip_id"), row -> {
            String tripId = row.getOrDefault("trip_id", "");
            String routeId = row.getOrDefault("route_id", "");
            String serviceId = row.getOrDefault("service_id", "");
            if (tripId.isBlank()) {
                stats.invalid("trip without an id");
                return;
            }
            if (tripIds.containsKey(tripId)) {
                stats.duplicatesSkipped++;
                return;
            }
            UUID route = routeIds.get(routeId);
            if (route == null) {
                stats.invalid("trip of an unknown route");
                return;
            }
            if (serviceId.isBlank() || (checkService && !services.containsKey(serviceId) && !exceptionServices.contains(serviceId))) {
                stats.invalid(serviceId.isBlank() ? "trip without a service" : "trip of an unknown service");
                return;
            }
            String shape = row.getOrDefault("shape_id", "");
            if (shape.isBlank()) {
                shape = null;
                stats.tripsWithoutShape++;
            } else if (!shapeIds.contains(shape)) {
                stats.invalidShapeReferences++; // the reference is cleared; no geometry is invented
                shape = null;
                stats.tripsWithoutShape++;
            }
            String headsign = blankToNull(GtfsText.display(row.getOrDefault("trip_headsign", "")));
            Integer direction = parseDirection(row.getOrDefault("direction_id", ""));
            if (headsign != null) stats.tripsWithHeadsign++;
            if (direction != null) stats.tripsWithDirection++;
            UUID id = GtfsText.stableId(source, "bus-trip", tripId);
            tripIds.put(tripId, id);
            routesWithTrips.add(routeId);
            servicesUsed.add(serviceId);
            tripBatch.add(new BusTrip(id, tripId, route, routeId, serviceId, shape, headsign, direction));
            if (tripBatch.size() >= batch) {
                sink.trips(List.copyOf(tripBatch));
                tripBatch.clear();
            }
        });
        sink.trips(List.copyOf(tripBatch));
        if (stats.invalidShapeReferences > 0 && !shapeIds.isEmpty()) {
            stats.warn("Some trips reference shapes that are not in shapes.txt; those references were cleared");
        }
        if (stats.invalidShapeReferences > 0 && shapeIds.isEmpty()) {
            stats.warn("Trips reference shapes but the dataset has none; those references were cleared");
        }

        // ---- stop times, streamed and validated trip by trip
        Set<String> accepted = new HashSet<>();
        Set<String> finished = new HashSet<>();
        List<BusStopTime> timeBatch = new ArrayList<>();
        StopTimeReader reader = new StopTimeReader(options, stopIds, tripIds, accepted, finished, timeBatch, batch, sink, stats);
        stats.stopTimesRead = feed.forEachRow("stop_times.txt", List.of("trip_id", "stop_id", "stop_sequence"), reader::row);
        reader.finishTrip();
        if (!timeBatch.isEmpty()) {
            sink.stopTimes(List.copyOf(timeBatch));
        }

        // ---- trips that ended up without usable stop times are removed again
        List<UUID> discard = new ArrayList<>();
        for (Map.Entry<String, UUID> trip : tripIds.entrySet()) {
            if (!accepted.contains(trip.getKey())) {
                discard.add(trip.getValue());
                if (!finished.contains(trip.getKey())) {
                    stats.invalid("trip without stop times");
                }
            }
        }
        stats.tripsRejected = discard.size();
        stats.tripsImported = accepted.size();
        sink.discardTrips(discard);
        if (accepted.isEmpty() || stopIds.isEmpty() || routes.isEmpty()) {
            // Never replace working data with an empty or unusable dataset.
            throw new IllegalStateException("The dataset has no usable stops, routes or trips; nothing was imported.\n" + stats);
        }

        Set<String> usedRoutes = new HashSet<>(routesWithTrips);
        stats.routesWithoutTrips = (int) routes.stream().filter(r -> !usedRoutes.contains(r.externalId())).count();
        stats.unusedStops = Math.max(0, stats.stopsImported - reader.usedStops.size());

        // ---- service period of the services the imported trips actually use
        LocalDate start = null;
        LocalDate end = null;
        Set<String> days = new LinkedHashSet<>();
        for (String id : servicesUsed) {
            BusService s = services.get(id);
            if (s == null) continue;
            if (start == null || s.start().isBefore(start)) start = s.start();
            if (end == null || s.end().isAfter(end)) end = s.end();
            days.addAll(s.operatingDays());
        }
        stats.servicePeriodStart = start;
        stats.servicePeriodEnd = end;
        List<String> ordered = new ArrayList<>();
        for (String day : DAYS) if (days.contains(day)) ordered.add(day);
        stats.operatingDays = List.copyOf(ordered);
        if (start == null) {
            stats.warn("The imported trips have no calendar.txt service: the service period is unknown");
        }
        sink.finish(stats);
        return stats;
    }

    // ------------------------------------------------------------------ stops / routes / calendar / shapes

    private static BusStop readStop(Map<String, String> row, Options o, Map<String, UUID> known, BusImportStatistics stats) {
        String id = row.getOrDefault("stop_id", "");
        if (id.isBlank()) {
            stats.invalid("stop without an id");
            return null;
        }
        if (known.containsKey(id)) {
            stats.duplicatesSkipped++;
            return null;
        }
        String type = row.getOrDefault("location_type", "");
        if (!type.isBlank() && !type.equals("0")) { // stations, entrances, generic nodes are not places to board a bus
            stats.nonStopLocationsSkipped++;
            return null;
        }
        String name = GtfsText.display(row.getOrDefault("stop_name", ""));
        if (name.isEmpty()) {
            stats.invalid("stop without a name");
            return null;
        }
        double lat;
        double lon;
        try {
            lat = Double.parseDouble(row.getOrDefault("stop_lat", ""));
            lon = Double.parseDouble(row.getOrDefault("stop_lon", ""));
        } catch (NumberFormatException e) {
            stats.invalid("invalid coordinates");
            return null;
        }
        if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat == 0 && lon == 0)) {
            stats.invalid("invalid coordinates");
            return null;
        }
        if (lat < o.minLatitude() || lat > o.maxLatitude() || lon < o.minLongitude() || lon > o.maxLongitude()) {
            stats.invalid("coordinates outside the supported region");
            return null;
        }
        return new BusStop(GtfsText.stableId(o.source(), "bus-stop", id), id, blankToNull(row.get("stop_code")), name, round6(lat), round6(lon),
                blankToNull(row.get("zone_id")), Accessibility.fromGtfs(row.get("wheelchair_boarding")));
    }

    private static BusRoute readRoute(Map<String, String> row, String source, Set<String> agencyIds, boolean checkAgency, Map<String, UUID> known,
                                      BusImportStatistics stats) {
        String id = row.getOrDefault("route_id", "");
        if (id.isBlank()) {
            stats.invalid("route without an id");
            return null;
        }
        if (known.containsKey(id)) {
            stats.duplicatesSkipped++;
            return null;
        }
        String longName = GtfsText.display(row.getOrDefault("route_long_name", ""));
        String shortName = GtfsText.display(row.getOrDefault("route_short_name", ""));
        if (longName.isEmpty() && shortName.isEmpty()) {
            stats.invalid("route without a name");
            return null;
        }
        String agency = row.getOrDefault("agency_id", "");
        if (!agency.isBlank() && checkAgency && !agencyIds.contains(agency)) {
            stats.invalid("route of an unknown agency");
            return null;
        }
        int type;
        try {
            String text = row.getOrDefault("route_type", "");
            type = Integer.parseInt(text);
            if (type < 0) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            stats.invalid("invalid route type");
            return null;
        }
        String color = row.getOrDefault("route_color", "");
        return new BusRoute(GtfsText.stableId(source, "bus-route", id), id, blankToNull(agency), blankToNull(longName), blankToNull(shortName), type,
                COLOR.matcher(color).matches() ? "#" + color.toUpperCase() : null);
    }

    private static void readService(Map<String, String> row, Map<String, BusService> services, BusImportStatistics stats) {
        String id = row.getOrDefault("service_id", "");
        if (id.isBlank()) {
            stats.invalid("service without an id");
            return;
        }
        if (services.containsKey(id)) {
            stats.duplicatesSkipped++;
            return;
        }
        try {
            LocalDate start = LocalDate.parse(row.getOrDefault("start_date", ""), DATE);
            LocalDate end = LocalDate.parse(row.getOrDefault("end_date", ""), DATE);
            if (end.isBefore(start)) {
                stats.invalid("service ends before it starts");
                return;
            }
            List<String> days = new ArrayList<>();
            for (String day : DAYS) {
                String flag = row.getOrDefault(day, "");
                if (flag.equals("1")) {
                    days.add(day);
                } else if (!flag.equals("0")) {
                    stats.invalid("invalid service day flag");
                    return;
                }
            }
            services.put(id, new BusService(id, List.copyOf(days), start, end));
        } catch (RuntimeException e) {
            stats.invalid("invalid service dates");
        }
    }

    private static Set<String> readShapes(GtfsSource feed, Options options, BusImportSink sink, int batch, BusImportStatistics stats) {
        if (!feed.hasTable("shapes.txt")) {
            stats.warn("The dataset has no shapes.txt: bus routes have no geometry");
            sink.shapes(List.of());
            return Set.of();
        }
        Map<String, TreeMap<Integer, double[]>> points = new LinkedHashMap<>();
        stats.shapePointsRead = feed.forEachRow("shapes.txt", List.of("shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"), row -> {
            String id = row.getOrDefault("shape_id", "");
            if (id.isBlank()) {
                stats.invalid("shape point without a shape id");
                return;
            }
            try {
                double lat = Double.parseDouble(row.get("shape_pt_lat"));
                double lon = Double.parseDouble(row.get("shape_pt_lon"));
                int seq = Integer.parseInt(row.get("shape_pt_sequence"));
                if (!Double.isFinite(lat) || !Double.isFinite(lon) || seq < 0
                        || lat < options.minLatitude() || lat > options.maxLatitude() || lon < options.minLongitude() || lon > options.maxLongitude()) {
                    stats.invalid("invalid shape point");
                    return;
                }
                if (points.computeIfAbsent(id, k -> new TreeMap<>()).putIfAbsent(seq, new double[]{round6(lat), round6(lon)}) != null) {
                    stats.duplicatesSkipped++;
                }
            } catch (RuntimeException e) {
                stats.invalid("invalid shape point");
            }
        });
        Set<String> valid = new LinkedHashSet<>();
        List<BusShape> shapes = new ArrayList<>();
        for (Map.Entry<String, TreeMap<Integer, double[]>> shape : points.entrySet()) {
            List<double[]> ordered = new ArrayList<>();
            for (double[] pt : shape.getValue().values()) {
                if (ordered.isEmpty() || ordered.get(ordered.size() - 1)[0] != pt[0] || ordered.get(ordered.size() - 1)[1] != pt[1]) {
                    ordered.add(pt);
                }
            }
            if (ordered.size() < 2) {
                stats.invalid("shape with fewer than two points");
                continue;
            }
            valid.add(shape.getKey());
            shapes.add(new BusShape(GtfsText.stableId(options.source(), "bus-shape", shape.getKey()), shape.getKey(), ordered));
        }
        stats.shapesImported = shapes.size();
        for (int from = 0; from < shapes.size(); from += batch) {
            sink.shapes(List.copyOf(shapes.subList(from, Math.min(shapes.size(), from + batch))));
        }
        if (shapes.isEmpty()) {
            sink.shapes(List.of());
        }
        return valid;
    }

    // ------------------------------------------------------------------ stop times

    /** Collects the rows of one trip, validates the trip when the next one starts and hands accepted trips to the sink in batches. */
    private static final class StopTimeReader {
        private final Options options;
        private final Map<String, UUID> stopIds;
        private final Map<String, UUID> tripIds;
        private final Set<String> accepted;
        private final Set<String> finished;
        private final List<BusStopTime> batch;
        private final int batchSize;
        private final BusImportSink sink;
        private final BusImportStatistics stats;
        final Set<UUID> usedStops = new HashSet<>();
        private String current;
        private final TreeMap<Integer, BusStopTime> rows = new TreeMap<>();
        private boolean currentUnknown;

        StopTimeReader(Options options, Map<String, UUID> stopIds, Map<String, UUID> tripIds, Set<String> accepted, Set<String> finished,
                       List<BusStopTime> batch, int batchSize, BusImportSink sink, BusImportStatistics stats) {
            this.options = options;
            this.stopIds = stopIds;
            this.tripIds = tripIds;
            this.accepted = accepted;
            this.finished = finished;
            this.batch = batch;
            this.batchSize = batchSize;
            this.sink = sink;
            this.stats = stats;
        }

        void row(Map<String, String> row) {
            String trip = row.getOrDefault("trip_id", "");
            if (!trip.equals(current)) {
                finishTrip();
                current = trip;
                currentUnknown = !tripIds.containsKey(trip);
                if (!currentUnknown && finished.contains(trip)) {
                    // The rows of a trip must be together; a trip that reappears later is rejected, not merged.
                    currentUnknown = true;
                    stats.invalid("stop times of a trip are not contiguous");
                }
            }
            if (currentUnknown) {
                if (!tripIds.containsKey(trip)) stats.invalid("stop time of an unknown trip");
                return;
            }
            UUID stop = stopIds.get(row.getOrDefault("stop_id", ""));
            if (stop == null) {
                stats.invalid("stop time of an unknown stop");
                return;
            }
            int sequence;
            try {
                sequence = Integer.parseInt(row.getOrDefault("stop_sequence", ""));
            } catch (NumberFormatException e) {
                sequence = -1;
            }
            if (sequence < 0) {
                stats.invalid("invalid stop sequence");
                return;
            }
            Integer arrival = parseTime(row.getOrDefault("arrival_time", ""));
            Integer departure = parseTime(row.getOrDefault("departure_time", ""));
            if (isMalformed(arrival) || isMalformed(departure)) {
                stats.invalid("malformed stop time");
                return;
            }
            if (arrival != null && departure != null && departure < arrival) {
                stats.invalid("departure before arrival");
                return;
            }
            if (rows.containsKey(sequence)) {
                stats.duplicatesSkipped++;
                return;
            }
            rows.put(sequence, new BusStopTime(tripIds.get(current), sequence, stop, arrival, departure));
        }

        void finishTrip() {
            if (current == null) {
                return;
            }
            String trip = current;
            current = null;
            if (currentUnknown) {
                rows.clear();
                return;
            }
            finished.add(trip);
            boolean ok = rows.size() >= 2;
            Integer last = null;
            for (BusStopTime st : rows.values()) {
                for (Integer t : new Integer[]{st.arrivalSeconds(), st.departureSeconds()}) {
                    if (t == null) continue;
                    if (last != null && t < last) ok = false;
                    last = t;
                }
            }
            if (rows.size() < 2) {
                stats.invalid("trip with fewer than two valid stop times");
            } else if (!ok) {
                stats.invalid("trip with times going backwards");
            }
            if (ok) {
                accepted.add(trip);
                stats.stopTimesImported += rows.size();
                for (BusStopTime st : rows.values()) {
                    batch.add(st);
                    usedStops.add(st.stopId());
                }
                if (batch.size() >= batchSize) {
                    sink.stopTimes(List.copyOf(batch));
                    batch.clear();
                }
            }
            rows.clear();
        }
    }

    /** Marker for a time that is present but malformed (an impossible value, compared by value). */
    private static final int MALFORMED_SECONDS = Integer.MIN_VALUE + 7;
    private static final Integer MALFORMED = MALFORMED_SECONDS;

    static boolean isMalformed(Integer seconds) {
        return seconds != null && seconds.intValue() == MALFORMED_SECONDS;
    }

    /** "H:MM:SS" (hours may pass 24 for trips after midnight) -> seconds; null when blank; MALFORMED when invalid. */
    static Integer parseTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        java.util.regex.Matcher m = TIME.matcher(text.trim());
        if (!m.matches()) {
            return MALFORMED;
        }
        int hours = Integer.parseInt(m.group(1));
        if (hours > MAX_HOURS) {
            return MALFORMED;
        }
        return hours * 3600 + Integer.parseInt(m.group(2)) * 60 + Integer.parseInt(m.group(3));
    }

    private static Integer parseDirection(String text) {
        return text.equals("0") ? Integer.valueOf(0) : text.equals("1") ? Integer.valueOf(1) : null;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static double round6(double value) {
        return Math.round(value * 1e6) / 1e6;
    }
}
