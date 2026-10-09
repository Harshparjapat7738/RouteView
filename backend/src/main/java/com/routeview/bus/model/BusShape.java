package com.routeview.bus.model;

import java.util.List;
import java.util.UUID;

/** A shape (GTFS shapes.txt) as ordered {latitude, longitude} points. Absent from the Delhi bus dataset; supported when present. */
public record BusShape(UUID id, String externalId, List<double[]> points) {
}
