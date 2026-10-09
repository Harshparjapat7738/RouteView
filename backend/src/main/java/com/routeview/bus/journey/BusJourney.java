package com.routeview.bus.journey;

import com.routeview.common.accessibility.Accessibility;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A bus journey in RouteView's own terms (no provider or raw GTFS fields): walking, bus rides and transfers in order, the real
 * ordered stops of every ride, the scheduled times and the geometry. It belongs to a {@code Route}, which carries the journey's
 * overall geometry, distance and duration.
 *
 * <p><b>Counting.</b> Two different numbers are reported and they are never mixed up:
 * <ul>
 *   <li>{@code listedStopCount}: how many bus stops are LISTED for the journey (boarding, intermediate and exit stops of every ride;
 *       a stop where one ride ends and the next begins is listed once).</li>
 *   <li>{@code stopToStopSegments}: how many stop-to-stop hops the bus travels (a ride listing 10 stops travels 9). It is the sum
 *       over the rides, so walking between two rides is not a segment of any ride.</li>
 * </ul>
 * For one continuous ride {@code stopToStopSegments = listedStopCount - 1}.
 *
 * <p><b>Times</b> are the dataset's static schedule (the timetable of the scheduled trip), never live arrival predictions;
 * {@code timetableBasis} says so. Walking times are estimates from straight-line distance.
 *
 * @param transfers            number of changes from one bus route to another (the same route again is not a transfer)
 * @param fare                 null: no reliable fare source exists, shown as "Fare unavailable"
 * @param fareStatus           {@code UNAVAILABLE} unless a reliable fare is present
 * @param departureTime        when the person starts walking (ISO-8601 with offset)
 * @param arrivalTime          scheduled arrival at the destination
 * @param waitSeconds          total time waiting at stops for scheduled departures
 * @param rideSeconds          total scheduled time on buses
 * @param timetableBasis       {@code STATIC_SCHEDULE}
 * @param geometrySource       {@code GTFS_SHAPES} when every ride follows its shape, {@code STOP_SEQUENCE} when rides are drawn through their
 *                             ordered stops because the dataset has no shape, {@code MIXED} otherwise
 * @param notices              plain-language remarks about what is estimated or missing
 */
public record BusJourney(
        int transfers,
        int busLegCount,
        int listedStopCount,
        int stopToStopSegments,
        long walkingMeters,
        long walkingSeconds,
        long rideSeconds,
        long waitSeconds,
        String departureTime,
        String arrivalTime,
        Fare fare,
        String fareStatus,
        String timetableBasis,
        String geometrySource,
        List<Segment> segments,
        List<StopRef> stops,
        DatasetRef dataset,
        List<String> notices) {

    public static final String UNAVAILABLE = "UNAVAILABLE";
    public static final String STATIC_SCHEDULE = "STATIC_SCHEDULE";

    public BusJourney {
        segments = List.copyOf(segments);
        stops = List.copyOf(stops);
        notices = List.copyOf(notices);
    }

    /** The same journey, tied to the dataset it was planned from. */
    public BusJourney withDataset(DatasetRef ref) {
        return new BusJourney(transfers, busLegCount, listedStopCount, stopToStopSegments, walkingMeters, walkingSeconds, rideSeconds, waitSeconds,
                departureTime, arrivalTime, fare, fareStatus, timetableBasis, geometrySource, segments, stops, ref, notices);
    }

    public enum SegmentType { WALK, BUS, TRANSFER }

    public enum WalkRole { FIRST_MILE, LAST_MILE }

    public enum StopRole { BOARDING, INTERMEDIATE, TRANSFER, EXIT }

    /** Where a headsign comes from: the dataset, or (when it gives none) the last stop of the ride's pattern, shown as "towards". */
    public enum HeadsignSource { GTFS_TRIP, TERMINAL_STOP }

    public record Fare(String currency, String amount) {
    }

    /** A bus stop: its stable id is the database id derived from the GTFS stop_id, which is {@code gtfsId}. */
    public record StopRef(UUID stopId, String gtfsId, String name, double latitude, double longitude, StopRole role, Accessibility accessibility) {
        public StopRef {
            accessibility = accessibility == null ? Accessibility.UNKNOWN : accessibility;
        }

        public StopRef(UUID stopId, String gtfsId, String name, double latitude, double longitude, StopRole role) {
            this(stopId, gtfsId, name, latitude, longitude, role, Accessibility.UNKNOWN);
        }
    }

    /** A bus route: {@code routeId} / {@code gtfsId} identify it; {@code name} (route number or long name) is display text and never identity. */
    public record RouteRef(UUID routeId, String gtfsId, String name, String shortName, String longName, String agency) {
    }

    /**
     * One part of the journey. Only the fields of its {@code type} are set:
     * WALK (walkRole, distance, duration, geometry), BUS (route, trip, headsign, direction, boarding, exit, stops, counts, times,
     * geometry), TRANSFER (the change of route at {@code transferStop}; {@code fromRoute} / {@code toRoute}).
     *
     * @param tripId        the scheduled trip ridden (a route has many trips: this is the one the times belong to)
     * @param headsign      the trip's headsign, or "towards" the last stop of the ride's pattern when the dataset gives none
     * @param stops         the real ordered stops of the ride, boarding to exit inclusive
     * @param geometry      encoded polyline (precision 5)
     * @param estimated     the walking distance / time is an estimate
     */
    public record Segment(
            SegmentType type,
            WalkRole walkRole,
            long distanceMeters,
            long durationSeconds,
            RouteRef route,
            UUID tripId,
            String tripGtfsId,
            String headsign,
            HeadsignSource headsignSource,
            Integer directionId,
            StopRef boarding,
            StopRef exit,
            List<StopRef> stops,
            int listedStopCount,
            int stopToStopSegments,
            String departureTime,
            String arrivalTime,
            long waitSeconds,
            StopRef transferStop,
            RouteRef fromRoute,
            RouteRef toRoute,
            String geometry,
            String geometrySource,
            boolean estimated) {
        public Segment {
            stops = stops == null ? List.of() : List.copyOf(stops);
        }
    }

    /** Which static dataset the journey was planned from. Static data, never a real-time feed. */
    public record DatasetRef(String source, String sourceVersion, LocalDate sourceUpdatedAt, java.time.Instant importedAt,
                             LocalDate servicePeriodStart, LocalDate servicePeriodEnd, List<String> operatingDays) {
        public DatasetRef {
            operatingDays = operatingDays == null ? List.of() : List.copyOf(operatingDays);
        }
    }
}
