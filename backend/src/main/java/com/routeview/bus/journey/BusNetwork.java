package com.routeview.bus.journey;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.routeview.common.accessibility.Accessibility;
import com.routeview.common.geo.GeoMath;

/**
 * An immutable in-memory snapshot of the bus PATTERN graph: stops, routes and patterns (one distinct ordered stop list of a
 * route, see V8__bus_patterns.sql) with the indexes the journey search needs. It holds no stop times, so it is small (for the
 * Delhi dataset ~10,500 stops and ~100,000 pattern stops) and safe to cache; times of real trips are read from the database
 * only for the few candidate journeys.
 *
 * <p>Identity is the id: a {@link Route} is a GTFS route_id, never its display name; a {@link Pattern} belongs to exactly one
 * route; stop order is the dataset's stop_sequence order, never derived from names or coordinates.
 */
public final class BusNetwork {

    public static final BusNetwork EMPTY = new BusNetwork(null, List.of(), List.of(), List.of());

    public record DatasetInfo(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt,
                              LocalDate servicePeriodStart, LocalDate servicePeriodEnd, List<String> operatingDays) {
        public DatasetInfo {
            operatingDays = operatingDays == null ? List.of() : List.copyOf(operatingDays);
        }
    }

    /** {@code accessibility} is what the dataset states (with its source and version); unknown unless it said so explicitly. */
    public record Stop(UUID id, String externalId, String name, double latitude, double longitude, Accessibility accessibility) {
        public Stop {
            accessibility = accessibility == null ? Accessibility.UNKNOWN : accessibility;
        }

        public Stop(UUID id, String externalId, String name, double latitude, double longitude) {
            this(id, externalId, name, latitude, longitude, Accessibility.UNKNOWN);
        }
    }

    /** {@code shortName} is the route number as the dataset gives it (null when it does not); {@code longName} is display text only. */
    public record Route(UUID id, String externalId, String shortName, String longName, String agencyExternalId, String agencyName) {
        /** The name shown to people: the short name (route number) when the dataset has one, else the long name. */
        public String displayName() {
            if (shortName != null && !shortName.isBlank()) {
                return shortName;
            }
            return longName == null ? externalId : longName;
        }
    }

    /**
     * One ordered stop list of a route. {@code stops[i]} is an index into {@link #stops()}; {@code offsetSeconds[i]} is the average
     * scheduled time from the first departure to the arrival at stop i. {@code directionId} / {@code headsign} are null unless the
     * dataset states one value for every trip of the pattern.
     */
    public record Pattern(UUID id, int route, int[] stops, int[] offsetSeconds, int tripCount, Integer firstDeparture, Integer lastDeparture,
                          Integer directionId, String headsign) {
        public Pattern {
            if (stops.length != offsetSeconds.length || stops.length < 2) {
                throw new IllegalArgumentException("A pattern needs at least two stops with one offset each");
            }
        }

        /** Expected wait for the next bus in seconds: half the typical headway, bounded; a fixed value when the headway is unknown. */
        public int expectedWaitSeconds() {
            if (tripCount >= 2 && firstDeparture != null && lastDeparture != null && lastDeparture > firstDeparture) {
                double headway = (lastDeparture - firstDeparture) / (double) (tripCount - 1);
                return (int) Math.max(120, Math.min(900, headway / 2));
            }
            return 900;
        }
    }

    private static final double CELL_DEGREES = 0.004; // ~440 m

    private final DatasetInfo dataset;
    private final List<Stop> stops;
    private final List<Route> routes;
    private final List<Pattern> patterns;
    private final Map<UUID, Integer> stopIndex = new HashMap<>();
    private final Map<UUID, Integer> routeIndex = new HashMap<>();
    private final Map<UUID, Integer> patternIndex = new HashMap<>();
    /** stop -> flat {pattern, position, pattern, position, ...} */
    private final int[][] patternsAtStop;
    private final Map<Long, int[]> grid = new HashMap<>();

    public BusNetwork(DatasetInfo dataset, List<Stop> stops, List<Route> routes, List<Pattern> patterns) {
        this.dataset = dataset;
        this.stops = List.copyOf(stops);
        this.routes = List.copyOf(routes);
        this.patterns = List.copyOf(patterns);
        for (int i = 0; i < this.stops.size(); i++) {
            stopIndex.put(this.stops.get(i).id(), i);
        }
        for (int i = 0; i < this.routes.size(); i++) {
            routeIndex.put(this.routes.get(i).id(), i);
        }
        int[] counts = new int[this.stops.size()];
        for (int p = 0; p < this.patterns.size(); p++) {
            Pattern pattern = this.patterns.get(p);
            patternIndex.put(pattern.id(), p);
            for (int stop : pattern.stops()) {
                counts[stop] += 2;
            }
        }
        patternsAtStop = new int[this.stops.size()][];
        for (int s = 0; s < patternsAtStop.length; s++) {
            patternsAtStop[s] = new int[counts[s]];
        }
        int[] fill = new int[this.stops.size()];
        for (int p = 0; p < this.patterns.size(); p++) {
            int[] stopsOfPattern = this.patterns.get(p).stops();
            for (int i = 0; i < stopsOfPattern.length; i++) {
                int s = stopsOfPattern[i];
                patternsAtStop[s][fill[s]++] = p;
                patternsAtStop[s][fill[s]++] = i;
            }
        }
        Map<Long, List<Integer>> cells = new HashMap<>();
        for (int i = 0; i < this.stops.size(); i++) {
            cells.computeIfAbsent(cellKey(this.stops.get(i).latitude(), this.stops.get(i).longitude()), k -> new ArrayList<>()).add(i);
        }
        cells.forEach((key, list) -> grid.put(key, list.stream().mapToInt(Integer::intValue).toArray()));
    }

    public DatasetInfo dataset() {
        return dataset;
    }

    public boolean isEmpty() {
        return patterns.isEmpty();
    }

    public List<Stop> stops() {
        return stops;
    }

    public List<Route> routes() {
        return routes;
    }

    public List<Pattern> patterns() {
        return patterns;
    }

    public Stop stop(int index) {
        return stops.get(index);
    }

    public Route routeOf(int patternIndex) {
        return routes.get(patterns.get(patternIndex).route());
    }

    public int routeIndexOf(int patternIndex) {
        return patterns.get(patternIndex).route();
    }

    /** Index of a stop id, or -1. */
    public int stopIndexOf(UUID stopId) {
        return stopIndex.getOrDefault(stopId, -1);
    }

    /** Index of a pattern id, or -1. */
    public int patternIndexOf(UUID patternId) {
        return patternIndex.getOrDefault(patternId, -1);
    }

    /** Flat pairs {pattern, position-in-pattern, ...} of every pattern call at the stop. */
    public int[] patternsAt(int stop) {
        return patternsAtStop[stop];
    }

    /** Number of distinct patterns serving the stop and accepted by {@code active} (null = all). */
    public int servingPatternCount(int stop, java.util.BitSet active) {
        int[] pairs = patternsAtStop[stop];
        int count = 0;
        int last = -1;
        for (int i = 0; i < pairs.length; i += 2) {
            if (pairs[i] != last && (active == null || active.get(pairs[i]))) {
                count++;
            }
            last = pairs[i];
        }
        return count;
    }

    /** Stops within {@code radiusMeters} (straight line) of the stop, excluding itself, nearest first as {stop, meters} would be: returns stop indexes. */
    public int[] stopsNear(int stop, double radiusMeters) {
        Stop origin = stops.get(stop);
        List<int[]> found = new ArrayList<>();
        double cellsLat = Math.ceil(radiusMeters / 111_320.0 / CELL_DEGREES);
        double cellsLon = Math.ceil(radiusMeters / (111_320.0 * Math.max(0.2, Math.cos(Math.toRadians(origin.latitude())))) / CELL_DEGREES);
        long baseLat = (long) Math.floor(origin.latitude() / CELL_DEGREES);
        long baseLon = (long) Math.floor(origin.longitude() / CELL_DEGREES);
        for (long a = baseLat - (long) cellsLat; a <= baseLat + (long) cellsLat; a++) {
            for (long b = baseLon - (long) cellsLon; b <= baseLon + (long) cellsLon; b++) {
                int[] members = grid.get(key(a, b));
                if (members == null) {
                    continue;
                }
                for (int other : members) {
                    if (other == stop) {
                        continue;
                    }
                    Stop candidate = stops.get(other);
                    double meters = GeoMath.haversineMeters(origin.latitude(), origin.longitude(), candidate.latitude(), candidate.longitude());
                    if (meters <= radiusMeters) {
                        found.add(new int[]{other, (int) Math.round(meters)});
                    }
                }
            }
        }
        found.sort((x, y) -> x[1] != y[1] ? Integer.compare(x[1], y[1]) : Integer.compare(x[0], y[0]));
        return found.stream().mapToInt(f -> f[0]).toArray();
    }

    private static long cellKey(double latitude, double longitude) {
        return key((long) Math.floor(latitude / CELL_DEGREES), (long) Math.floor(longitude / CELL_DEGREES));
    }

    private static long key(long a, long b) {
        return (a << 32) ^ (b & 0xffffffffL);
    }
}
