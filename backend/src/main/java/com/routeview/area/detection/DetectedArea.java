package com.routeview.area.detection;

import java.util.UUID;

import com.routeview.area.model.AreaType;
import com.routeview.common.geo.Coordinates;

/**
 * A geographical area a route passes through, as a journey stop. Provider-independent and free of
 * PostGIS types: it carries only what the journey needs.
 *
 * @param areaId                    the stored area
 * @param name                      display name
 * @param areaType                  kind of area
 * @param sequence                  1-based place in travel order
 * @param positionAlongRoute        where the route first reaches the area: 0.0 = route start, 1.0 = route end
 * @param distanceFromRouteStartMeters distance travelled along the route when the area is first reached
 * @param distanceInsideAreaMeters  length of the route that lies inside the area (all visits together)
 * @param location                  the route point where the area is first reached
 */
public record DetectedArea(
        UUID areaId,
        String name,
        AreaType areaType,
        int sequence,
        double positionAlongRoute,
        long distanceFromRouteStartMeters,
        long distanceInsideAreaMeters,
        Coordinates location) {
}
