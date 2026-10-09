package com.routeview.spatial;

import java.util.ArrayList;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;

import com.routeview.common.geo.Coordinates;
import com.routeview.spatial.InvalidRouteGeometryException.Reason;

/**
 * First stage of area detection: makes sure the route geometry is something PostGIS can be asked about.
 *
 * <p>Accepts a {@link LineString} or a {@link MultiLineString} (its parts are joined in order, the way a route is
 * travelled), SRID 4326 or unset (treated as 4326, the Google polyline convention). Coordinates are
 * x = longitude, y = latitude; values outside the valid range (which includes a swapped latitude/longitude pair
 * with a latitude beyond 90) are rejected. Consecutive repeated points are removed. Anything else is rejected with an
 * {@link InvalidRouteGeometryException}; the geometry source itself is never changed.
 */
public final class RouteGeometryNormalizer {

    private RouteGeometryNormalizer() {
    }

    public static LineString normalize(Geometry input, int maxVertices) {
        if (input == null || input.isEmpty()) {
            throw new InvalidRouteGeometryException(Reason.MISSING, "Route geometry is missing or empty.");
        }
        if (input.getSRID() != 0 && input.getSRID() != SpatialReference.WGS84_SRID) {
            throw new InvalidRouteGeometryException(Reason.WRONG_SRID, "Route geometry must use SRID " + SpatialReference.WGS84_SRID + ".");
        }
        if (!(input instanceof LineString) && !(input instanceof MultiLineString)) {
            throw new InvalidRouteGeometryException(Reason.UNSUPPORTED_TYPE, "Route geometry must be a line, not " + input.getGeometryType() + ".");
        }

        List<Coordinate> kept = new ArrayList<>();
        for (Coordinate c : input.getCoordinates()) {
            if (!Coordinates.isValid(c.y, c.x)) {
                throw new InvalidRouteGeometryException(Reason.COORDINATE_OUT_OF_RANGE, "Route geometry has a coordinate out of range.");
            }
            if (kept.isEmpty() || !same(kept.get(kept.size() - 1), c)) {
                kept.add(new Coordinate(c.x, c.y));
            }
            if (kept.size() > maxVertices) {
                throw new InvalidRouteGeometryException(Reason.TOO_MANY_VERTICES, "Route geometry has too many vertices.");
            }
        }
        if (kept.size() < 2) {
            throw new InvalidRouteGeometryException(Reason.NO_LENGTH, "Route geometry has no length.");
        }
        return SpatialReference.geometryFactory().createLineString(kept.toArray(new Coordinate[0]));
    }

    private static boolean same(Coordinate a, Coordinate b) {
        return a.x == b.x && a.y == b.y;
    }
}
