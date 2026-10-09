package com.routeview.bus.journey;

import java.util.List;
import java.util.UUID;

import com.routeview.common.geo.Coordinates;

/**
 * Finds bus stops around a point, nearest first. The production implementation is a PostGIS nearest-neighbour query on the
 * spatial index; the result is always bounded by {@code limit}.
 */
public interface NearbyStopSource {

    /** A stop and its straight-line distance from the point in meters. */
    record Candidate(UUID stopId, double meters) {
    }

    /** @return at most {@code limit} active stops within {@code radiusMeters}, nearest first */
    List<Candidate> nearest(Coordinates point, double radiusMeters, int limit);
}
