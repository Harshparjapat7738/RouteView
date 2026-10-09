package com.routeview.metro.ingest;

import com.routeview.gtfs.GtfsSource;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;

import com.routeview.metro.model.MetroConnection;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroServicePeriod;
import com.routeview.metro.model.MetroShape;
import com.routeview.common.accessibility.Accessibility;
import com.routeview.metro.model.MetroStation;
import com.routeview.metro.model.MetroStationLine;

/**
 * Reads a GTFS feed (the Delhi Open Transit Data DMRC static dataset: stops, routes, trips, stop_times) into
 * RouteView's own metro model. Pure logic, no database: the result is stored by a {@link MetroImportStore}.
 *
 * <ul>
 *   <li>Every record is validated; invalid ones are rejected and counted, they never stop the import.</li>
 *   <li>Stops that belong together (a {@code parent_station}, or the same station name within a few hundred
 *       metres) become one station, so interchanges are one station served by several lines. Other stations
 *       that merely share a name stay separate.</li>
 *   <li>The ordered stations of a line are taken from the feed's trips: one pattern per distinct stopping
 *       pattern (branches included), reverse and partial duplicates removed.</li>
 *   <li>Ids are derived from {@code source + external id}, so importing the same dataset again produces the
 *       same records (idempotent) and a newer dataset updates them in place.</li>
 * </ul>
 */
public final class MetroGtfsImporter {

    /**
     * @param clusterMeters      stops with the same station name closer than this are one station
     * @param maxStationGapMeters a trip with two consecutive stations further apart than this is rejected as implausible
     */
    public record Options(
            String source,
            String sourceVersion,
            LocalDate sourceUpdatedAt,
            double clusterMeters,
            double maxStationGapMeters,
            double minLatitude,
            double maxLatitude,
            double minLongitude,
            double maxLongitude) {

        public static final double DEFAULT_CLUSTER_METERS = 300;
        public static final double DEFAULT_MAX_STATION_GAP_METERS = 40_000;

        /** Plausible bounds of India: rejects swapped, zero or foreign coordinates without being region-specific. */
        public static Options india(String source, String sourceVersion, LocalDate sourceUpdatedAt) {
            return new Options(source, sourceVersion, sourceUpdatedAt, DEFAULT_CLUSTER_METERS, DEFAULT_MAX_STATION_GAP_METERS, 6.0, 38.0, 68.0, 98.0);
        }
    }

    private static final Pattern COLOR = Pattern.compile("^[0-9A-Fa-f]{6}$");
    private static final int MAX_STOP_IDS_IN_METADATA = 12;

    private record Stop(String id, String name, double lat, double lon, String parent, int locationType, Accessibility.Status wheelchair) {
    }

    private MetroGtfsImporter() {
    }

    public static MetroDataset read(GtfsSource feed, Options options) {
        if (options.sourceVersion() == null || options.sourceVersion().isBlank()) {
            throw new IllegalArgumentException("A source version is required (publication date or version label)");
        }
        MetroImportStatistics stats = new MetroImportStatistics();

        // ---- stops
        Map<String, Stop> stops = new LinkedHashMap<>();
        Set<String> skippedStops = new HashSet<>();
        stats.stopsRead = feed.forEachRow("stops.txt", List.of("stop_id", "stop_name", "stop_lat", "stop_lon"), row -> readStop(row, options, stops, skippedStops, stats));

        // ---- routes
        Map<String, MetroLine> lines = new LinkedHashMap<>();
        stats.routesRead = feed.forEachRow("routes.txt", List.of("route_id"), row -> readRoute(row, options, lines, stats));

        // ---- trips
        Map<String, String> tripRoute = new LinkedHashMap<>();
        Map<String, String> tripShape = new HashMap<>();
        Map<String, String> tripService = new HashMap<>();
        stats.tripsRead = feed.forEachRow("trips.txt", List.of("route_id", "trip_id"), row -> {
            String tripId = row.getOrDefault("trip_id", "");
            String routeId = row.getOrDefault("route_id", "");
            if (tripId.isBlank()) {
                stats.invalid("trip without an id");
            } else if (tripRoute.containsKey(tripId)) {
                stats.duplicatesSkipped++;
            } else if (!lines.containsKey(routeId)) {
                stats.invalid("trip of an unknown route");
            } else {
                tripRoute.put(tripId, routeId);
                tripShape.put(tripId, row.getOrDefault("shape_id", ""));
                tripService.put(tripId, row.getOrDefault("service_id", ""));
                if (!row.getOrDefault("trip_headsign", "").isBlank()) {
                    stats.tripsWithHeadsign++;
                }
                if (!row.getOrDefault("direction_id", "").isBlank()) {
                    stats.tripsWithDirection++;
                }
            }
        });

        // ---- stop times (kept only as ordered stop lists per trip)
        Map<String, TreeMap<Integer, String>> tripStops = new HashMap<>();
        stats.stopTimesRead = feed.forEachRow("stop_times.txt", List.of("trip_id", "stop_id", "stop_sequence"), row -> {
            String tripId = row.getOrDefault("trip_id", "");
            String stopId = row.getOrDefault("stop_id", "");
            if (!tripRoute.containsKey(tripId)) {
                stats.invalid("stop time of an unknown trip");
                return;
            }
            if (skippedStops.contains(stopId)) {
                return;
            }
            if (!stops.containsKey(stopId)) {
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
            if (tripStops.computeIfAbsent(tripId, key -> new TreeMap<>()).putIfAbsent(sequence, stopId) != null) {
                stats.duplicatesSkipped++;
            }
        });

        // ---- stations: stops that belong together become one station
        Map<String, String> stationOfStop = cluster(stops, options, stats);
        Map<String, List<Stop>> members = new HashMap<>();
        for (Stop stop : stops.values()) {
            String key = stationOfStop.get(stop.id());
            members.computeIfAbsent(key, k -> new ArrayList<>()).add(stop);
        }

        // ---- patterns of every route
        Map<String, Set<List<String>>> patternsOfRoute = new HashMap<>();
        Map<String, Map<String, Integer>> edgesOfRoute = new HashMap<>(); // route -> "fromKey>toKey" -> trips
        Set<String> validTrips = new HashSet<>();
        for (Map.Entry<String, String> trip : tripRoute.entrySet()) {
            TreeMap<Integer, String> rows = tripStops.get(trip.getKey());
            if (rows == null) {
                stats.invalid("trip without stop times");
                continue;
            }
            List<String> sequence = new ArrayList<>();
            for (String stopId : rows.values()) {
                String station = stationOfStop.get(stopId);
                if (sequence.isEmpty() || !sequence.get(sequence.size() - 1).equals(station)) {
                    sequence.add(station);
                }
            }
            if (sequence.size() < 2) {
                stats.invalid("trip with fewer than two stations");
                continue;
            }
            if (hasImplausibleGap(sequence, members, options.maxStationGapMeters())) {
                stats.invalid("trip with an implausible distance between stations");
                continue;
            }
            stats.tripsImported++;
            validTrips.add(trip.getKey());
            Map<String, Integer> edges = edgesOfRoute.computeIfAbsent(trip.getValue(), key -> new HashMap<>());
            for (int i = 1; i < sequence.size(); i++) {
                edges.merge(sequence.get(i - 1) + ">" + sequence.get(i), 1, Integer::sum);
            }
            stats.stopTimesImported += rows.size();
            patternsOfRoute.computeIfAbsent(trip.getValue(), key -> new HashSet<>()).add(canonical(sequence));
        }

        // ---- stations and station-line links
        List<MetroStationLine> links = new ArrayList<>();
        Set<String> usedStations = new HashSet<>();
        List<MetroLine> importedLines = new ArrayList<>();
        Map<String, MetroStation> stationByKey = new HashMap<>();
        for (MetroLine line : lines.values()) {
            Set<List<String>> raw = patternsOfRoute.get(line.externalId());
            if (raw == null || raw.isEmpty()) {
                stats.invalid("route without valid trips");
                continue;
            }
            importedLines.add(line);
            List<List<String>> patterns = withoutContained(raw);
            int number = 1;
            for (List<String> pattern : patterns) {
                String name = "P" + number++;
                // No "towards": the feed has no headsign / direction_id, and the last station of a pattern is not a
                // reliable direction for a passenger (a pattern is travelled both ways).
                String toward = null;
                for (int i = 0; i < pattern.size(); i++) {
                    String key = pattern.get(i);
                    usedStations.add(key);
                    MetroStation station = stationByKey.computeIfAbsent(key, k -> buildStation(k, members.get(k), options));
                    links.add(new MetroStationLine(station.id(), line.id(), name, i + 1, toward));
                }
            }
        }
        stats.routesImported = importedLines.size();
        stats.unusedStationsSkipped = (int) members.keySet().stream().filter(key -> !usedStations.contains(key)).count();

        List<MetroStation> stations = new ArrayList<>(stationByKey.values());
        stations.sort(Comparator.comparing(MetroStation::name).thenComparing(MetroStation::externalId));
        stats.stationsImported = stations.size();
        stats.stationLinksImported = links.size();

        // ---- connections: consecutive stations of real trips, per service
        List<MetroConnection> connections = new ArrayList<>();
        Map<String, MetroLine> lineByRoute = new HashMap<>();
        importedLines.forEach(l -> lineByRoute.put(l.externalId(), l));
        for (Map.Entry<String, Map<String, Integer>> route : edgesOfRoute.entrySet()) {
            MetroLine line = lineByRoute.get(route.getKey());
            if (line == null) {
                continue;
            }
            for (Map.Entry<String, Integer> edge : route.getValue().entrySet()) {
                int cut = edge.getKey().indexOf('>');
                MetroStation from = stationByKey.get(edge.getKey().substring(0, cut));
                MetroStation to = stationByKey.get(edge.getKey().substring(cut + 1));
                if (from != null && to != null && !from.id().equals(to.id())) {
                    connections.add(new MetroConnection(from.id(), to.id(), line.id(), edge.getValue()));
                }
            }
        }
        connections.sort(Comparator.comparing((MetroConnection c) -> c.lineId().toString())
                .thenComparing(c -> c.fromStationId().toString()).thenComparing(c -> c.toStationId().toString()));
        stats.connectionsImported = connections.size();

        // ---- logical lines: services of one colour that share trunk connections (Blue main + Vaishali)
        importedLines = groupServices(importedLines, connections, options);
        stats.lineGroups = (int) importedLines.stream().map(MetroLine::groupId).distinct().count();
        Map<UUID, UUID> groupOfLine = new HashMap<>();
        importedLines.forEach(l -> groupOfLine.put(l.id(), l.groupId()));
        Map<UUID, Set<UUID>> groupsOfStation = new HashMap<>();
        for (MetroStationLine link : links) {
            groupsOfStation.computeIfAbsent(link.stationId(), k -> new HashSet<>()).add(groupOfLine.get(link.lineId()));
        }
        stats.interchangeStations = (int) groupsOfStation.values().stream().filter(set -> set.size() >= 2).count();

        // ---- shapes and service period
        Map<String, MetroLine> lineByRouteFinal = new HashMap<>();
        importedLines.forEach(l -> lineByRouteFinal.put(l.externalId(), l));
        List<MetroShape> shapes = readShapes(feed, options, tripRoute, tripShape, validTrips, lineByRouteFinal, stats);
        MetroServicePeriod period = readServicePeriod(feed, tripService, validTrips, stats);

        warnAboutStations(stations, stats);

        importedLines.sort(Comparator.comparing(MetroLine::name).thenComparing(MetroLine::externalId));
        links.sort(Comparator.comparing((MetroStationLine l) -> l.lineId().toString()).thenComparing(MetroStationLine::pattern).thenComparingInt(MetroStationLine::sequence));
        return new MetroDataset(options.source(), options.sourceVersion(), options.sourceUpdatedAt(), List.copyOf(stations), List.copyOf(importedLines), List.copyOf(links),
                List.copyOf(connections), List.copyOf(shapes), period, stats);
    }

    /** Services become one logical line when they have the same colour and share at least one connection. */
    private static List<MetroLine> groupServices(List<MetroLine> services, List<MetroConnection> connections, Options options) {
        Map<UUID, UUID> parent = new HashMap<>();
        services.forEach(l -> parent.put(l.id(), l.id()));
        Map<String, UUID> firstServiceOfEdge = new HashMap<>();
        Map<UUID, MetroLine> byId = new HashMap<>();
        services.forEach(l -> byId.put(l.id(), l));
        for (MetroConnection c : connections) {
            String a = c.fromStationId().compareTo(c.toStationId()) <= 0 ? c.fromStationId() + ">" + c.toStationId() : c.toStationId() + ">" + c.fromStationId();
            UUID other = firstServiceOfEdge.putIfAbsent(a, c.lineId());
            if (other != null && !other.equals(c.lineId())) {
                String colorA = byId.get(other).displayColor();
                String colorB = byId.get(c.lineId()).displayColor();
                if (colorA != null && colorA.equalsIgnoreCase(colorB)) {
                    UUID ra = findId(parent, other);
                    UUID rb = findId(parent, c.lineId());
                    if (!ra.equals(rb)) {
                        parent.put(ra, rb);
                    }
                }
            }
        }
        Map<UUID, List<MetroLine>> members = new HashMap<>();
        for (MetroLine l : services) {
            members.computeIfAbsent(findId(parent, l.id()), k -> new ArrayList<>()).add(l);
        }
        List<MetroLine> out = new ArrayList<>();
        for (List<MetroLine> group : members.values()) {
            group.sort(Comparator.comparing(MetroLine::externalId));
            String key = String.join("+", group.stream().map(MetroLine::externalId).toList());
            UUID groupId = stableId(options.source(), "line-group", key);
            String groupName = group.size() == 1 ? MetroLine.baseName(group.get(0).name()) : commonBaseName(group);
            for (MetroLine l : group) {
                String branch = MetroLine.branchOf(l.name());
                out.add(new MetroLine(l.id(), l.externalId(), l.name(), l.shortName(), l.displayColor(), l.source(), l.active(), groupId, groupName, branch));
            }
        }
        return out;
    }

    private static String commonBaseName(List<MetroLine> group) {
        Map<String, Integer> counts = new HashMap<>();
        group.forEach(l -> counts.merge(MetroLine.baseName(l.name()), 1, Integer::sum));
        return counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .map(Map.Entry::getKey).findFirst().orElse(group.get(0).name());
    }

    private static UUID findId(Map<UUID, UUID> parent, UUID id) {
        UUID root = id;
        while (!parent.get(root).equals(root)) {
            root = parent.get(root);
        }
        return root;
    }

    // ------------------------------------------------------------------ shapes / calendar

    private static List<MetroShape> readShapes(GtfsSource feed, Options options, Map<String, String> tripRoute, Map<String, String> tripShape,
                                               Set<String> validTrips, Map<String, MetroLine> lineByRoute, MetroImportStatistics stats) {
        Map<String, Map<String, Integer>> tripsOfShape = new HashMap<>(); // shape -> route -> trips
        for (String tripId : validTrips) {
            String shapeId = tripShape.getOrDefault(tripId, "");
            if (shapeId.isBlank()) {
                stats.tripsWithoutShape++;
            } else {
                tripsOfShape.computeIfAbsent(shapeId, k -> new HashMap<>()).merge(tripRoute.get(tripId), 1, Integer::sum);
            }
        }
        if (!feed.hasTable("shapes.txt")) {
            stats.warn("The dataset has no shapes.txt: the static network is drawn from station sequences");
            return List.of();
        }
        Map<String, TreeMap<Integer, double[]>> points = new HashMap<>();
        feed.forEachRow("shapes.txt", List.of("shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"), row -> {
            String id = row.getOrDefault("shape_id", "");
            if (!tripsOfShape.containsKey(id)) {
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
                points.computeIfAbsent(id, k -> new TreeMap<>()).putIfAbsent(seq, new double[]{round6(lat), round6(lon)});
            } catch (RuntimeException e) {
                stats.invalid("invalid shape point");
            }
        });
        List<MetroShape> shapes = new ArrayList<>();
        for (Map.Entry<String, Map<String, Integer>> use : tripsOfShape.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
            TreeMap<Integer, double[]> pts = points.get(use.getKey());
            if (pts == null || pts.size() < 2) {
                stats.invalidShapes++;
                stats.warn("Shape " + use.getKey() + " is referenced by trips but has fewer than two valid points");
                continue;
            }
            // a shape belongs to the route that uses it most (ties: smallest route id)
            String route = use.getValue().entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                    .map(Map.Entry::getKey).findFirst().orElse(null);
            MetroLine line = route == null ? null : lineByRoute.get(route);
            if (line == null) {
                stats.invalidShapes++;
                continue;
            }
            if (use.getValue().size() > 1) {
                stats.warn("Shape " + use.getKey() + " is used by more than one route; kept for " + route);
            }
            List<double[]> ordered = new ArrayList<>();
            for (double[] pt : pts.values()) {
                if (ordered.isEmpty() || ordered.get(ordered.size() - 1)[0] != pt[0] || ordered.get(ordered.size() - 1)[1] != pt[1]) {
                    ordered.add(pt);
                }
            }
            if (ordered.size() < 2) {
                stats.invalidShapes++;
                continue;
            }
            int trips = use.getValue().values().stream().mapToInt(Integer::intValue).sum();
            shapes.add(new MetroShape(stableId(options.source(), "shape", use.getKey()), line.id(), use.getKey(), ordered, trips));
        }
        stats.shapesImported = shapes.size();
        return shapes;
    }

    private static final String[] DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"};

    /** The validity window and weekdays of the services the imported trips actually use; null when the feed has no calendar. */
    private static MetroServicePeriod readServicePeriod(GtfsSource feed, Map<String, String> tripService, Set<String> validTrips, MetroImportStatistics stats) {
        if (!feed.hasTable("calendar.txt")) {
            stats.warn("The dataset has no calendar.txt: the service period is unknown");
            return null;
        }
        Set<String> used = new HashSet<>();
        validTrips.forEach(t -> used.add(tripService.getOrDefault(t, "")));
        LocalDate[] start = {null};
        LocalDate[] end = {null};
        Set<String> days = new java.util.LinkedHashSet<>();
        Set<String> daysFound = new HashSet<>();
        java.time.format.DateTimeFormatter format = java.time.format.DateTimeFormatter.BASIC_ISO_DATE;
        feed.forEachRow("calendar.txt", List.of("service_id"), row -> {
            if (!used.contains(row.getOrDefault("service_id", ""))) {
                return;
            }
            try {
                LocalDate s = LocalDate.parse(row.getOrDefault("start_date", ""), format);
                LocalDate e = LocalDate.parse(row.getOrDefault("end_date", ""), format);
                if (start[0] == null || s.isBefore(start[0])) start[0] = s;
                if (end[0] == null || e.isAfter(end[0])) end[0] = e;
            } catch (RuntimeException ex) {
                stats.invalid("invalid calendar dates");
            }
            for (String day : DAYS) {
                if ("1".equals(row.getOrDefault(day, ""))) {
                    daysFound.add(day);
                }
            }
        });
        for (String day : DAYS) {
            if (daysFound.contains(day)) days.add(day);
        }
        if (start[0] == null || end[0] == null) {
            stats.warn("calendar.txt has no usable service for the imported trips");
            return null;
        }
        return new MetroServicePeriod(start[0], end[0], List.copyOf(days));
    }

    // ------------------------------------------------------------------ data-quality warnings

    private static void warnAboutStations(List<MetroStation> stations, MetroImportStatistics stats) {
        Map<String, List<MetroStation>> byName = new HashMap<>();
        Map<String, List<MetroStation>> byPlace = new HashMap<>();
        for (MetroStation s : stations) {
            byName.computeIfAbsent(MetroNameNormalizer.key(s.name()), k -> new ArrayList<>()).add(s);
            byPlace.computeIfAbsent(Math.round(s.latitude() * 20000) + ":" + Math.round(s.longitude() * 20000), k -> new ArrayList<>()).add(s);
        }
        byName.values().stream().filter(l -> l.size() > 1).forEach(l -> stats.warn("Stations with similar names kept separate: "
                + String.join(" / ", l.stream().map(x -> x.name() + " [" + x.externalId() + "]").toList())));
        byPlace.values().stream().filter(l -> l.size() > 1).forEach(l -> stats.warn("Distinct stations at identical coordinates (source data): "
                + String.join(" / ", l.stream().map(x -> x.name() + " [" + x.externalId() + "]").toList())));
    }

    // ------------------------------------------------------------------ stops / routes

    private static void readStop(Map<String, String> row, Options o, Map<String, Stop> stops, Set<String> skipped, MetroImportStatistics stats) {
        String id = row.getOrDefault("stop_id", "");
        if (id.isBlank()) {
            stats.invalid("stop without an id");
            return;
        }
        if (stops.containsKey(id) || skipped.contains(id)) {
            stats.duplicatesSkipped++;
            return;
        }
        int type;
        try {
            String text = row.getOrDefault("location_type", "");
            type = text.isBlank() ? 0 : Integer.parseInt(text);
        } catch (NumberFormatException e) {
            stats.invalid("invalid location type");
            return;
        }
        if (type >= 2) { // entrances, generic nodes, boarding areas are not stations
            skipped.add(id);
            stats.nonStationStopsSkipped++;
            return;
        }
        String name = MetroNameNormalizer.display(row.getOrDefault("stop_name", ""));
        if (name.isEmpty()) {
            stats.invalid("station without a name");
            return;
        }
        double lat;
        double lon;
        try {
            lat = Double.parseDouble(row.getOrDefault("stop_lat", ""));
            lon = Double.parseDouble(row.getOrDefault("stop_lon", ""));
        } catch (NumberFormatException e) {
            stats.invalid("invalid coordinates");
            return;
        }
        if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat == 0 && lon == 0)) {
            stats.invalid("invalid coordinates");
            return;
        }
        if (lat < o.minLatitude() || lat > o.maxLatitude() || lon < o.minLongitude() || lon > o.maxLongitude()) {
            stats.invalid("coordinates outside the supported region");
            return;
        }
        stops.put(id, new Stop(id, name, lat, lon, row.getOrDefault("parent_station", ""), type, Accessibility.fromGtfs(row.get("wheelchair_boarding"))));
    }

    private static void readRoute(Map<String, String> row, Options o, Map<String, MetroLine> lines, MetroImportStatistics stats) {
        String id = row.getOrDefault("route_id", "");
        if (id.isBlank()) {
            stats.invalid("route without an id");
            return;
        }
        if (lines.containsKey(id)) {
            stats.duplicatesSkipped++;
            return;
        }
        String longName = MetroNameNormalizer.display(row.getOrDefault("route_long_name", ""));
        String shortName = MetroNameNormalizer.display(row.getOrDefault("route_short_name", ""));
        String name = longName.isEmpty() ? shortName : longName;
        if (name.isEmpty()) {
            stats.invalid("route without a name");
            return;
        }
        String color = row.getOrDefault("route_color", "");
        String displayColor = COLOR.matcher(color).matches() ? "#" + color.toUpperCase() : null;
        lines.put(id, new MetroLine(stableId(o.source(), "line", id), id, name, shortName.isEmpty() || shortName.equals(name) ? null : shortName, displayColor, o.source(), true));
    }

    // ------------------------------------------------------------------ stations

    /** Union-find over stops: parent_station links, then same name key within the cluster radius. Returns stop id -> station key. */
    private static Map<String, String> cluster(Map<String, Stop> stops, Options options, MetroImportStatistics stats) {
        Map<String, String> parent = new HashMap<>();
        stops.keySet().forEach(id -> parent.put(id, id));
        for (Stop stop : stops.values()) {
            if (!stop.parent().isBlank() && stops.containsKey(stop.parent())) {
                union(parent, stop.id(), stop.parent());
            }
        }
        // Distinct stops are distinct stations. Two stops are one station only when the feed says so (parent_station) or
        // when they are the same station written twice: an identical name, or a name that differs only by a bracketed
        // service note ("Sikanderpur" / "Sikanderpur (Rapid Metro)"), within the cluster radius. Merges are reported.
        Map<String, List<Stop>> byBase = new HashMap<>();
        for (Stop stop : stops.values()) {
            byBase.computeIfAbsent(baseKey(stop.name()), k -> new ArrayList<>()).add(stop);
        }
        for (List<Stop> list : byBase.values()) {
            for (int i = 0; i < list.size(); i++) {
                for (int j = i + 1; j < list.size(); j++) {
                    Stop a = list.get(i);
                    Stop b = list.get(j);
                    boolean sameName = a.name().equalsIgnoreCase(b.name());
                    boolean noteOnOne = hasNote(a.name()) != hasNote(b.name());
                    if ((sameName || noteOnOne)
                            && distanceMeters(a.lat(), a.lon(), b.lat(), b.lon()) <= options.clusterMeters()) {
                        union(parent, a.id(), b.id());
                        stats.warn("Stops treated as one station: " + a.name() + " [" + a.id() + "] + " + b.name() + " [" + b.id() + "]");
                    }
                }
            }
        }
        // The station key is the smallest stop id of the cluster: stable whatever the file order.
        Map<String, String> smallest = new HashMap<>();
        for (String id : stops.keySet()) {
            String root = find(parent, id);
            smallest.merge(root, id, (a, b) -> a.compareTo(b) <= 0 ? a : b);
        }
        Map<String, String> result = new HashMap<>();
        for (String id : stops.keySet()) {
            result.put(id, smallest.get(find(parent, id)));
        }
        return result;
    }

    private static final Pattern NOTE = Pattern.compile("\\s*\\([^()]*\\)\\s*$");

    private static boolean hasNote(String name) {
        return NOTE.matcher(name).find();
    }

    /** Lower-case name without a trailing bracketed note. */
    private static String baseKey(String name) {
        return NOTE.matcher(name).replaceFirst("").toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ").strip();
    }

    private static String find(Map<String, String> parent, String id) {
        String root = id;
        while (!parent.get(root).equals(root)) {
            root = parent.get(root);
        }
        String current = id;
        while (!parent.get(current).equals(root)) {
            String next = parent.get(current);
            parent.put(current, root);
            current = next;
        }
        return root;
    }

    private static void union(Map<String, String> parent, String a, String b) {
        String rootA = find(parent, a);
        String rootB = find(parent, b);
        if (!rootA.equals(rootB)) {
            parent.put(rootA, rootB);
        }
    }

    private static MetroStation buildStation(String key, List<Stop> stopsOfStation, Options options) {
        List<Stop> sorted = stopsOfStation.stream().sorted(Comparator.comparing(Stop::id)).toList();
        Stop parentRecord = sorted.stream().filter(s -> s.locationType() == 1).findFirst().orElse(null);
        Stop main = parentRecord != null ? parentRecord : sorted.stream().filter(x -> !hasNote(x.name())).findFirst().orElse(sorted.get(0));
        double lat = parentRecord != null ? parentRecord.lat() : sorted.stream().mapToDouble(Stop::lat).average().orElse(main.lat());
        double lon = parentRecord != null ? parentRecord.lon() : sorted.stream().mapToDouble(Stop::lon).average().orElse(main.lon());
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("stopIds", String.join(",", sorted.stream().map(Stop::id).limit(MAX_STOP_IDS_IN_METADATA).toList()));
        metadata.put("stopCount", Integer.toString(sorted.size()));
        // Only an explicit statement of the dataset is stored; a missing field leaves no key (= unknown).
        Accessibility.Status wheelchair = stationWheelchair(sorted);
        if (wheelchair != Accessibility.Status.UNKNOWN) {
            metadata.put(MetroStation.WHEELCHAIR_KEY, wheelchair.name());
        }
        return new MetroStation(stableId(options.source(), "station", key), key, main.name(), round6(lat), round6(lon), options.source(), options.sourceVersion(), true, metadata);
    }

    /**
     * GTFS: a stop with no statement of its own takes its parent station's. A station is accessible/inaccessible only when every
     * stop that makes it up (after inheriting) says the same; otherwise it is unknown.
     */
    static Accessibility.Status stationWheelchair(List<Stop> stopsOfStation) {
        Accessibility.Status parentStatus = stopsOfStation.stream().filter(s -> s.locationType() == 1).map(Stop::wheelchair).findFirst().orElse(Accessibility.Status.UNKNOWN);
        List<Accessibility.Status> effective = stopsOfStation.stream()
                .filter(s -> s.locationType() != 1)
                .map(s -> s.wheelchair() == Accessibility.Status.UNKNOWN ? parentStatus : s.wheelchair())
                .toList();
        return effective.isEmpty() ? parentStatus : Accessibility.combine(effective);
    }

    private static String stationName(List<Stop> stopsOfStation) {
        List<Stop> sorted = stopsOfStation.stream().sorted(Comparator.comparing(Stop::id)).toList();
        return sorted.stream().filter(s -> s.locationType() == 1).findFirst().orElse(sorted.get(0)).name();
    }

    // ------------------------------------------------------------------ patterns

    private static boolean hasImplausibleGap(List<String> sequence, Map<String, List<Stop>> members, double maxMeters) {
        for (int i = 1; i < sequence.size(); i++) {
            Stop a = members.get(sequence.get(i - 1)).get(0);
            Stop b = members.get(sequence.get(i)).get(0);
            if (distanceMeters(a.lat(), a.lon(), b.lat(), b.lon()) > maxMeters) {
                return true;
            }
        }
        return false;
    }

    /** The orientation with the smaller joined key, so a trip and its return trip are the same pattern. */
    private static List<String> canonical(List<String> sequence) {
        List<String> reversed = new ArrayList<>(sequence);
        Collections.reverse(reversed);
        return String.join("|", sequence).compareTo(String.join("|", reversed)) <= 0 ? List.copyOf(sequence) : List.copyOf(reversed);
    }

    /** Longest patterns first; patterns contained in another one (forward or reversed) are dropped. */
    private static List<List<String>> withoutContained(Set<List<String>> raw) {
        List<List<String>> sorted = new ArrayList<>(raw);
        sorted.sort(Comparator.<List<String>>comparingInt(List::size).reversed().thenComparing(list -> String.join("|", list)));
        List<List<String>> kept = new ArrayList<>();
        for (List<String> candidate : sorted) {
            List<String> reversed = new ArrayList<>(candidate);
            Collections.reverse(reversed);
            boolean contained = kept.stream().anyMatch(longer -> Collections.indexOfSubList(longer, candidate) >= 0 || Collections.indexOfSubList(longer, reversed) >= 0);
            if (!contained) {
                kept.add(candidate);
            }
        }
        return kept;
    }

    // ------------------------------------------------------------------ helpers

    static UUID stableId(String source, String kind, String externalId) {
        return UUID.nameUUIDFromBytes((source + ":" + kind + ":" + externalId).getBytes(StandardCharsets.UTF_8));
    }

    private static double round6(double value) {
        return Math.round(value * 1e6) / 1e6;
    }

    /** Great-circle distance (haversine), metres. */
    static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }
}
