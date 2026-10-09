package com.routeview.bus.model;

import java.util.UUID;

/**
 * A stop on a trip. {@code stopSequence} is the dataset's own value (increasing; it may start at 0). Times are seconds since
 * the start of the service day and may exceed 86,400 (a trip running past midnight); null when the dataset has no time.
 */
public record BusStopTime(UUID tripId, int stopSequence, UUID stopId, Integer arrivalSeconds, Integer departureSeconds) {
}
