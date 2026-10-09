package com.routeview.area.detection;

import java.util.UUID;

import com.routeview.area.model.AreaType;

/**
 * One area the spatial query found near a route, summarised over all places where the route meets it.
 * It is the raw input of {@link AreaSelectionPolicy}; nothing here is final.
 *
 * @param entryDistanceMeters first point of contact, measured along the route from its start
 * @param exitDistanceMeters  last point of contact, measured along the route from its start
 * @param insideMeters        length of the route inside the area, all visits together (0 when only close by)
 * @param interiorMeters      the part of that length that counts as genuinely crossing the area: visits that are at
 *                            least the minimum visit length and not just running along the border
 * @param sizeMeters          the area's size as the side of an equally large square
 * @param nearStart           the route start is inside the area or within the spatial tolerance of it
 * @param nearEnd             the route end is inside the area or within the spatial tolerance of it
 * @param containsStart       the route start lies inside the area (stricter than {@code nearStart})
 * @param containsEnd         the route end lies inside the area (stricter than {@code nearEnd})
 * @param routeLengthMeters   total length of the route
 * @param entryLatitude       latitude of the first point of contact
 * @param entryLongitude      longitude of the first point of contact
 */
public record RouteAreaCandidate(
        UUID areaId,
        String name,
        AreaType areaType,
        double entryDistanceMeters,
        double exitDistanceMeters,
        double insideMeters,
        double interiorMeters,
        double sizeMeters,
        boolean nearStart,
        boolean nearEnd,
        boolean containsStart,
        boolean containsEnd,
        double routeLengthMeters,
        double entryLatitude,
        double entryLongitude) {
}
