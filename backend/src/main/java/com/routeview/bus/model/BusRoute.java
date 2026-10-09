package com.routeview.bus.model;

import java.util.UUID;

/**
 * A bus route as the dataset describes it. Identity is the GTFS {@code route_id}; the long / short names are display
 * text only and are NOT unique (the Delhi dataset has several routes with the same long name).
 * {@code color} is #RRGGBB when the source gives one, otherwise null.
 */
public record BusRoute(UUID id, String externalId, String agencyExternalId, String longName, String shortName, int routeType, String color) {
}
