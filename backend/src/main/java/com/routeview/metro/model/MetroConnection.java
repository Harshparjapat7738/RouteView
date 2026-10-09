package com.routeview.metro.model;

import java.util.UUID;

/**
 * One station-to-station movement of a service, exactly as the dataset's trips make it: consecutive stops of a trip,
 * in the direction of travel. {@code tripCount} is how many trips make this movement. These are the edges of the
 * metro graph; routes between stations are reconstructed from them, never from names or distances.
 */
public record MetroConnection(UUID fromStationId, UUID toStationId, UUID lineId, int tripCount) {
}
