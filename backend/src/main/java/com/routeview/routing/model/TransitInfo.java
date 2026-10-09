package com.routeview.routing.model;

import java.util.List;

/**
 * What the provider reported about a public-transit route: its steps in travel order (walking parts and rides),
 * the number of transfers, the overall departure / arrival times and the fare. Nothing here is invented: every
 * value comes from the provider's answer and is null / empty when the provider did not send it.
 *
 * @param steps         walking and riding steps in travel order
 * @param transfers     number of changes between rides (rides - 1, never negative)
 * @param departureTime departure of the first ride (RFC 3339), or null
 * @param arrivalTime   arrival of the last ride (RFC 3339), or null
 * @param fare          the fare of the whole route when the provider could determine it, otherwise null
 */
public record TransitInfo(List<TransitStep> steps, int transfers, String departureTime, String arrivalTime, TransitFare fare) {

    public TransitInfo {
        steps = steps == null ? List.of() : List.copyOf(steps);
        transfers = Math.max(0, transfers);
    }

    public TransitInfo(List<TransitStep> steps, int transfers, String departureTime, String arrivalTime) {
        this(steps, transfers, departureTime, arrivalTime, null);
    }

    /** A fare exactly as the provider reported it: ISO 4217 currency code and a plain decimal amount. */
    public record TransitFare(String currency, String amount) {
    }

    /**
     * One step. For a walking step only {@code kind}, {@code distanceMeters} and {@code durationSeconds} are set.
     *
     * @param vehicleType the provider's vehicle type for a ride, e.g. "SUBWAY", "HEAVY_RAIL", "BUS"
     * @param departureLatitude / departureLongitude  location of the boarding stop when the provider sent it
     * @param arrivalLatitude / arrivalLongitude      location of the alighting stop when the provider sent it
     * @param lineShortName the line's short name / number when the provider sent one, otherwise empty
     * @param lineColor     the line's colour as #RRGGBB when the provider sent a valid one, otherwise empty
     */
    public record TransitStep(
            Kind kind,
            String lineName,
            String vehicleType,
            String departureStop,
            String arrivalStop,
            String departureTime,
            String arrivalTime,
            String headsign,
            int stopCount,
            long distanceMeters,
            long durationSeconds,
            Double departureLatitude,
            Double departureLongitude,
            Double arrivalLatitude,
            Double arrivalLongitude,
            String lineShortName,
            String lineColor) {

        public enum Kind { WALK, RIDE }

        public TransitStep(Kind kind, String lineName, String vehicleType, String departureStop, String arrivalStop,
                String departureTime, String arrivalTime, String headsign, int stopCount, long distanceMeters, long durationSeconds) {
            this(kind, lineName, vehicleType, departureStop, arrivalStop, departureTime, arrivalTime, headsign, stopCount,
                    distanceMeters, durationSeconds, null, null, null, null, "", "");
        }
    }
}
