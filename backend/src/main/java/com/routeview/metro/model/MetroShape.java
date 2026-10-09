package com.routeview.metro.model;

import java.util.List;
import java.util.UUID;

/**
 * The drawn path of a service from the dataset's {@code shapes.txt}: ordered {lat, lon} points. It is static
 * network geometry for the map; the geometry of a calculated journey is the routing provider's.
 */
public record MetroShape(UUID id, UUID lineId, String externalId, List<double[]> points, int tripCount) {
    public MetroShape {
        points = List.copyOf(points);
    }
}
