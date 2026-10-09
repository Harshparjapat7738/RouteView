package com.routeview.area.detection;

import java.util.List;
import java.util.Set;

import org.locationtech.jts.geom.LineString;

import com.routeview.area.model.AreaType;

/** Finds the areas near a route. The only implementation talks to PostGIS; tests use fakes. */
public interface RouteAreaCandidateSource {

    /**
     * Runs one spatial query for the whole route.
     *
     * @param route           route geometry, SRID 4326
     * @param toleranceMeters how far from the route an area may be to count as a candidate
     * @param types           only areas of these types are returned
     * @param boundaryBandMeters route within this distance of an area's border does not count as inside it
     * @param minVisitMeters  an inside piece of route shorter than this (after the border band) is not a visit
     * @throws IllegalArgumentException if the route is not in SRID 4326
     */
    List<RouteAreaCandidate> findCandidates(LineString route, double toleranceMeters, Set<AreaType> types,
            double boundaryBandMeters, double minVisitMeters);
}
