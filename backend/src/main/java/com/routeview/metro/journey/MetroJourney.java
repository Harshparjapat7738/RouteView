package com.routeview.metro.journey;

import com.routeview.common.accessibility.Accessibility;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A metro journey in RouteView's own terms (no provider fields): ordered segments, the stations in journey
 * order, transfers, walking, fare and the metro dataset the station information was matched against.
 * It is an enhancement of a {@code Route}: the route keeps the geometry, duration and distance.
 *
 * @param fare            the fare when the routing provider could determine it, otherwise null ("Fare unavailable")
 * @param transfers       number of changes between rides
 * @param stationCount    stations listed for the journey (boarding, intermediate, interchange and exit stations, each once) when every
 *                        metro ride's stations were verified, else null. A single ride of 9 segments lists 10 stations.
 * @param travelledStops  segments travelled by metro (station-to-station hops, the boarding station not counted) when every metro
 *                        ride reports it, else null. Always stationCount - 1 for one continuous ride.
 * @param stationsVerified every metro ride's intermediate stations were confirmed against the dataset
 * @param dataset         the dataset used to match stations, or null when nothing could be matched
 * @param notices         plain-language remarks about what could not be shown
 */
public record MetroJourney(
        Fare fare,
        int transfers,
        Integer stationCount,
        Integer travelledStops,
        long walkingMeters,
        long walkingSeconds,
        String departureTime,
        String arrivalTime,
        boolean stationsVerified,
        List<Segment> segments,
        List<StationRef> stations,
        DatasetRef dataset,
        List<String> notices) {

    public MetroJourney {
        segments = List.copyOf(segments);
        stations = List.copyOf(stations);
        notices = List.copyOf(notices);
    }

    /** Compatibility constructor for callers that predate the explicit {@code travelledStops} field. */
    public MetroJourney(Fare fare, int transfers, Integer stationCount, long walkingMeters, long walkingSeconds, String departureTime,
                        String arrivalTime, boolean stationsVerified, List<Segment> segments, List<StationRef> stations, DatasetRef dataset,
                        List<String> notices) {
        this(fare, transfers, stationCount, null, walkingMeters, walkingSeconds, departureTime, arrivalTime, stationsVerified, segments,
                stations, dataset, notices);
    }

    public enum SegmentType { WALK, METRO, TRANSFER, TRANSIT }

    public enum WalkRole { FIRST_MILE, LAST_MILE }

    public enum StationRole { BOARDING, INTERMEDIATE, INTERCHANGE, EXIT }

    /** A fare as reported by the routing provider. */
    public record Fare(String currency, String amount) {
    }

    /**
     * A line as shown to the user. {@code lineId} is the dataset <b>service</b> (GTFS route) and is set only when exactly one
     * service was determined; {@code groupId} is the logical line (Blue Line = main + Vaishali) and is what decides whether two
     * lines are the same line. {@code branch} is the service-specific part of the name, when known. Never compare lines by name.
     */
    public record LineRef(UUID lineId, UUID groupId, String name, String shortName, String color, String vehicleType, String branch) {
        public LineRef(UUID lineId, String name, String shortName, String color, String vehicleType) {
            this(lineId, null, name, shortName, color, vehicleType, null);
        }
    }

    /** A station of the journey. {@code stationId} is set only when it was matched to a station of the dataset. */
    public record StationRef(UUID stationId, String name, Double latitude, Double longitude, StationRole role, List<LineRef> lines, boolean interchange,
                             Accessibility accessibility) {
        public StationRef {
            lines = lines == null ? List.of() : List.copyOf(lines);
            accessibility = accessibility == null ? Accessibility.UNKNOWN : accessibility;
        }

        public StationRef(UUID stationId, String name, Double latitude, Double longitude, StationRole role, List<LineRef> lines, boolean interchange) {
            this(stationId, name, latitude, longitude, role, lines, interchange, Accessibility.UNKNOWN);
        }

        public StationRef(UUID stationId, String name, Double latitude, Double longitude, StationRole role, List<LineRef> lines) {
            this(stationId, name, latitude, longitude, role, lines, false, Accessibility.UNKNOWN);
        }
    }

    /**
     * One part of the journey. Only the fields of its {@code type} are set:
     * WALK (walkRole, distance, duration), METRO / TRANSIT (line, towards, boarding, exit, stopCount,
     * intermediateStations or null when they could not be verified, times), TRANSFER (transferStation,
     * transferToStation when the next ride starts at a differently named station, fromLine, toLine, and the
     * walking distance / time only when the provider reported a walking step).
     */
    public record Segment(
            SegmentType type,
            WalkRole walkRole,
            long distanceMeters,
            long durationSeconds,
            LineRef line,
            String towards,
            StationRef boarding,
            StationRef exit,
            int stopCount,
            List<StationRef> intermediateStations,
            String departureTime,
            String arrivalTime,
            StationRef transferStation,
            StationRef transferToStation,
            LineRef fromLine,
            LineRef toLine,
            Long transferWalkMeters,
            Long transferWalkSeconds) {
    }

    /** Which static dataset station information came from. Static data, never real time. */
    public record DatasetRef(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt,
                             LocalDate servicePeriodStart, LocalDate servicePeriodEnd, List<String> operatingDays) {
        public DatasetRef {
            operatingDays = operatingDays == null ? List.of() : List.copyOf(operatingDays);
        }

        public DatasetRef(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt) {
            this(source, sourceVersion, sourceUpdatedAt, importedAt, null, null, List.of());
        }
    }
}
