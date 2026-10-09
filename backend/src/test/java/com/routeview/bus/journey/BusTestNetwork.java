package com.routeview.bus.journey;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.routeview.common.geo.Coordinates;

/**
 * A small synthetic bus network (made-up places, not the Delhi dataset) with an in-memory timetable, so the journey engine is
 * tested without a database. About 1 km per 0.01 degree of longitude here.
 *
 * <pre>
 *   R1 "101"  A - B - C - D          (trips every 10 min from 08:00, direction 0, headsign "Dwarka")
 *   R1B "101" D - C - B - A          (the other direction; the dataset gives it no headsign)
 *   R2 "202"  C - E - F              (changes with R1 at C)
 *   R4 "404"  D2 - G - H             (D2 is ~100 m from D: changes with R1 on foot)
 *   R6 "101?" A - B - C - D          (same display name as R1 but another route; slower)
 *   R7 "707"  A - B - C              (has a GTFS shape)
 *   R9 "909"  Z - Y                  (far away; unconnected)
 * </pre>
 */
final class BusTestNetwork {

    static final String SOURCE = "TEST_BUS";
    static final LocalDate DAY = LocalDate.of(2026, 10, 12); // a Monday
    /** 08:00 in Asia/Kolkata. */
    static final Instant EIGHT_AM = Instant.parse("2026-10-12T02:30:00Z");

    final Map<String, UUID> ids = new LinkedHashMap<>();
    final List<BusNetwork.Stop> stops = new ArrayList<>();
    final List<BusNetwork.Route> routes = new ArrayList<>();
    final List<BusNetwork.Pattern> patterns = new ArrayList<>();
    final Map<String, Integer> stopIndex = new HashMap<>();
    final Map<String, Integer> routeIndex = new HashMap<>();
    final Map<String, Integer> patternIndex = new HashMap<>();
    final List<Trip> trips = new ArrayList<>();
    final Map<UUID, List<double[]>> shapes = new HashMap<>();

    record Trip(UUID id, String gtfsId, String patternKey, UUID shapeId, String headsign, Integer direction, int[] arrivals) {
    }

    UUID id(String kind, String key) {
        return ids.computeIfAbsent(kind + ":" + key, k -> UUID.nameUUIDFromBytes(k.getBytes(StandardCharsets.UTF_8)));
    }

    BusTestNetwork stop(String key, double lat, double lon) {
        return stop(key, lat, lon, null);
    }

    BusTestNetwork stop(String key, double lat, double lon, com.routeview.common.accessibility.Accessibility accessibility) {
        stopIndex.put(key, stops.size());
        stops.add(new BusNetwork.Stop(id("stop", key), "S_" + key, "Stop " + key, lat, lon, accessibility));
        return this;
    }

    BusTestNetwork route(String key, String shortName, String longName) {
        routeIndex.put(key, routes.size());
        routes.add(new BusNetwork.Route(id("route", key), "R_" + key, shortName, longName, "AG", "Test Agency"));
        return this;
    }

    /** @param secondsBetweenStops scheduled time between consecutive stops */
    BusTestNetwork pattern(String key, String routeKey, List<String> stopKeys, int secondsBetweenStops, Integer direction, String headsign) {
        int[] stopsOf = stopKeys.stream().mapToInt(stopIndex::get).toArray();
        int[] offsets = new int[stopsOf.length];
        for (int i = 0; i < offsets.length; i++) {
            offsets[i] = i * secondsBetweenStops;
        }
        patternIndex.put(key, patterns.size());
        patterns.add(new BusNetwork.Pattern(id("pattern", key), routeIndex.get(routeKey), stopsOf, offsets, 40, 6 * 3600, 22 * 3600, direction, headsign));
        return this;
    }

    /** Trips of a pattern from {@code fromSeconds} to {@code toSeconds} every {@code everySeconds}. */
    BusTestNetwork trips(String patternKey, int fromSeconds, int toSeconds, int everySeconds, String headsign, Integer direction, UUID shape) {
        BusNetwork.Pattern pattern = patterns.get(patternIndex.get(patternKey));
        for (int start = fromSeconds; start <= toSeconds; start += everySeconds) {
            int[] times = new int[pattern.stops().length];
            for (int i = 0; i < times.length; i++) {
                times[i] = start + pattern.offsetSeconds()[i];
            }
            trips.add(new Trip(id("trip", patternKey + "@" + start), patternKey + "_" + start, patternKey, shape, headsign, direction, times));
        }
        return this;
    }

    BusNetwork network() {
        return new BusNetwork(new BusNetwork.DatasetInfo(SOURCE, "test-1", null, null, DAY.minusYears(1), DAY.plusYears(1), List.of("monday")), stops, routes, patterns);
    }

    UUID stopId(String key) {
        return id("stop", key);
    }

    UUID routeId(String key) {
        return id("route", key);
    }

    Coordinates at(String stopKey) {
        BusNetwork.Stop stop = stops.get(stopIndex.get(stopKey));
        return new Coordinates(stop.latitude(), stop.longitude());
    }

    /** A point {@code metersNorth} north of a stop (about 111 m per 0.001 degree of latitude). */
    Coordinates near(String stopKey, double metersNorth) {
        BusNetwork.Stop stop = stops.get(stopIndex.get(stopKey));
        return new Coordinates(stop.latitude() + metersNorth / 111_320.0, stop.longitude());
    }

    static BusTestNetwork standard() {
        BusTestNetwork n = new BusTestNetwork();
        n.stop("A", 28.600, 77.200).stop("B", 28.600, 77.210).stop("C", 28.600, 77.220).stop("D", 28.600, 77.230)
                .stop("E", 28.610, 77.220).stop("F", 28.620, 77.220)
                .stop("D2", 28.6010, 77.2305).stop("G", 28.6010, 77.240).stop("H", 28.6010, 77.250)
                .stop("Z", 28.700, 77.500).stop("Y", 28.700, 77.510);
        n.route("R1", "101", "Ring Line 101").route("R1B", "101", "Ring Line 101").route("R2", "202", "Cross 202").route("R4", "404", "East 404")
                .route("R6", "101", "Ring Line 101").route("R7", "707", "Shape 707").route("R9", "909", "Far 909");
        n.pattern("P1", "R1", List.of("A", "B", "C", "D"), 300, 0, "Dwarka")
                .pattern("P1B", "R1B", List.of("D", "C", "B", "A"), 300, 1, null)
                .pattern("P2", "R2", List.of("C", "E", "F"), 300, 0, null)
                .pattern("P4", "R4", List.of("D2", "G", "H"), 300, 0, null)
                .pattern("P6", "R6", List.of("A", "B", "C", "D"), 600, 0, null)
                .pattern("P7", "R7", List.of("A", "B", "C"), 300, 0, null)
                .pattern("P9", "R9", List.of("Z", "Y"), 300, 0, null);
        n.trips("P1", 7 * 3600, 10 * 3600, 600, "Dwarka", 0, null)
                .trips("P1B", 7 * 3600, 10 * 3600, 600, null, 1, null)
                .trips("P2", 7 * 3600, 12 * 3600, 900, null, null, null)
                .trips("P4", 7 * 3600, 12 * 3600, 900, null, null, null)
                .trips("P6", 7 * 3600 + 5 * 60, 10 * 3600, 1800, null, null, null)
                .trips("P9", 7 * 3600, 12 * 3600, 3600, null, null, null);
        UUID shape = n.id("shape", "SH7");
        n.shapes.put(shape, List.of(new double[]{28.6000, 77.2000}, new double[]{28.6004, 77.2050}, new double[]{28.6010, 77.2100},
                new double[]{28.6005, 77.2150}, new double[]{28.6000, 77.2200}));
        n.trips("P7", 7 * 3600, 10 * 3600, 900, null, null, shape);
        return n;
    }

    /** The in-memory timetable over this network's trips. */
    BusTimetable timetable() {
        return new InMemoryTimetable();
    }

    final class InMemoryTimetable implements BusTimetable {
        boolean calendarKnown = true;
        Set<UUID> running = Set.of(id("service", "S"));

        @Override
        public ServiceDay serviceDay(LocalDate date) {
            // Mondays only: the test calendar
            boolean monday = date.getDayOfWeek() == java.time.DayOfWeek.MONDAY;
            return new ServiceDay(date, monday ? running : Set.of(), !calendarKnown);
        }

        @Override
        public BitSet activePatterns(ServiceDay day, BusNetwork network) {
            BitSet set = new BitSet();
            if (day.activeServices().isEmpty() && !day.unrestricted()) {
                return set;
            }
            for (Trip trip : trips) {
                set.set(patternIndex.get(trip.patternKey()));
            }
            return set;
        }

        @Override
        public Optional<TripRun> nextTrip(UUID patternId, UUID boardStopId, int boardPosition, ServiceDay today, ServiceDay yesterday, int readySeconds) {
            if (today.activeServices().isEmpty() && !today.unrestricted()) {
                return Optional.empty();
            }
            Trip best = null;
            for (Trip trip : trips) {
                BusNetwork.Pattern pattern = patterns.get(patternIndex.get(trip.patternKey()));
                if (!pattern.id().equals(patternId) || trip.arrivals()[boardPosition] < readySeconds) {
                    continue;
                }
                if (best == null || trip.arrivals()[boardPosition] < best.arrivals()[boardPosition]) {
                    best = trip;
                }
            }
            if (best == null) {
                return Optional.empty();
            }
            BusNetwork.Pattern pattern = patterns.get(patternIndex.get(best.patternKey()));
            List<TimedStop> called = new ArrayList<>();
            for (int i = 0; i < pattern.stops().length; i++) {
                called.add(new TimedStop(i, stops.get(pattern.stops()[i]).id(), i, best.arrivals()[i], best.arrivals()[i]));
            }
            return Optional.of(new TripRun(best.id(), best.gtfsId(), best.shapeId(), best.headsign(), best.direction(), 0, called));
        }

        @Override
        public Optional<List<double[]>> shape(UUID shapeId) {
            return Optional.ofNullable(shapes.get(shapeId));
        }
    }

    BusJourneyService service() {
        BusNetwork network = network();
        return new BusJourneyService(() -> network, new InMemoryNearbyStops(network), timetable(), BusJourneyProperties.defaults());
    }
}
