package com.routeview.bus.model;

import java.util.UUID;

import com.routeview.common.accessibility.Accessibility;

/**
 * A bus stop. Identity is the GTFS {@code stop_id} ({@code externalId}); names and {@code stop_code} are NOT unique
 * (the Delhi dataset has several stop ids with the same code at the same place). WGS 84 coordinates.
 */
public record BusStop(UUID id, String externalId, String code, String name, double latitude, double longitude, String zoneId,
                      Accessibility.Status wheelchair) {

    public BusStop {
        wheelchair = wheelchair == null ? Accessibility.Status.UNKNOWN : wheelchair;
    }

    public BusStop(UUID id, String externalId, String code, String name, double latitude, double longitude, String zoneId) {
        this(id, externalId, code, name, latitude, longitude, zoneId, Accessibility.Status.UNKNOWN);
    }

    /** The GTFS value to store: 1 / 2 for an explicit statement, null (unknown) otherwise. */
    public Integer wheelchairBoardingValue() {
        return switch (wheelchair) {
            case ACCESSIBLE -> 1;
            case INACCESSIBLE -> 2;
            case UNKNOWN -> null;
        };
    }
}
