package com.routeview.bus.model;

import java.util.UUID;

/**
 * One scheduled run of a route (GTFS trip). {@code serviceExternalId} refers to the calendar; {@code shapeExternalId} is set
 * only when the dataset has that shape; {@code headsign} and {@code directionId} are null when the dataset gives none.
 */
public record BusTrip(UUID id, String externalId, UUID routeId, String routeExternalId, String serviceExternalId, String shapeExternalId,
                      String headsign, Integer directionId) {
}
