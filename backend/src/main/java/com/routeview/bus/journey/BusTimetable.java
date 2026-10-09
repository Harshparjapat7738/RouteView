package com.routeview.bus.journey;

import java.time.LocalDate;
import java.util.BitSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Read access to the scheduled trips behind the pattern graph: which patterns run on a day, the next trip of a pattern at a
 * stop, the stop list of a trip and shapes. Implemented over indexed PostgreSQL queries (and in memory for tests).
 */
public interface BusTimetable {

    /** What runs on one service day. {@code unrestricted}: the dataset has no calendar, so every trip is assumed to run (and the journey says so). */
    record ServiceDay(LocalDate date, java.util.Set<UUID> activeServices, boolean unrestricted) {
        public ServiceDay {
            activeServices = java.util.Set.copyOf(activeServices);
        }
    }

    /** One call of a trip: {@code position} is its place in the trip's ordered stop list. */
    record TimedStop(int position, UUID stopId, int stopSequence, Integer arrivalSeconds, Integer departureSeconds) {
    }

    /**
     * A scheduled trip. {@code dayOffsetSeconds} is -86400 when the trip belongs to the previous service day (it runs past
     * midnight), 0 otherwise: absolute seconds = serviceDayStart + dayOffsetSeconds + stop time.
     */
    record TripRun(UUID tripId, String gtfsId, UUID shapeId, String headsign, Integer directionId, int dayOffsetSeconds, List<TimedStop> stops) {
        public TripRun {
            stops = List.copyOf(stops);
        }
    }

    /** The service day for a date (today's calendar); never null. */
    ServiceDay serviceDay(LocalDate date);

    /** Indexes of the network's patterns that have at least one trip on the day. */
    BitSet activePatterns(ServiceDay day, BusNetwork network);

    /**
     * The first trip of {@code patternId} that leaves the stop at position {@code boardPosition} of the pattern at or after
     * {@code readySeconds} (seconds since the start of the service day of {@code today}), looking at today's trips and at
     * yesterday's trips that run past midnight. Returns the trip's full ordered stop list.
     */
    Optional<TripRun> nextTrip(UUID patternId, UUID boardStopId, int boardPosition, ServiceDay today, ServiceDay yesterday, int readySeconds);

    /** Shape points {latitude, longitude} in order, or empty when the shape does not exist. */
    Optional<List<double[]>> shape(UUID shapeId);
}
