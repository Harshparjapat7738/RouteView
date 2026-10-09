package com.routeview.metro.model;

import java.util.UUID;

/**
 * A station's place on a line. {@code pattern} identifies one ordered branch / service pattern of the line;
 * {@code sequence} starts at 1 within it; {@code toward} is the last station of the pattern (or null).
 */
public record MetroStationLine(UUID stationId, UUID lineId, String pattern, int sequence, String toward) {
}
