package com.routeview.routing.model;

import java.time.Instant;

/**
 * Optional public-transit settings of a request. All fields are null when not asked for, which means "leave now,
 * provider's default ranking" (the behaviour before these options existed).
 *
 * @param preference    how to rank transit alternatives, or null for the provider's default
 * @param departureTime leave at this time, or null
 * @param arrivalTime   arrive by this time, or null (never together with departureTime)
 */
public record TransitOptions(Preference preference, Instant departureTime, Instant arrivalTime) {

    /** Ranking preferences the provider supports for transit. */
    public enum Preference { LESS_WALKING, FEWER_TRANSFERS }

    public static final TransitOptions NONE = new TransitOptions(null, null, null);

    public TransitOptions {
        if (departureTime != null && arrivalTime != null) {
            throw new IllegalArgumentException("Departure time and arrival time cannot both be set");
        }
    }

    public boolean isEmpty() {
        return preference == null && departureTime == null && arrivalTime == null;
    }
}
