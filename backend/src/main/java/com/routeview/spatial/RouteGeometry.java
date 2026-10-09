package com.routeview.spatial;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.LineString;

import com.routeview.common.geo.Coordinates;

/**
 * Turns a route's encoded polyline (precision 5) into a JTS line in SRID 4326 (x = longitude, y = latitude).
 *
 * <p>The input comes from the routing provider, so it is validated: malformed data, out-of-range coordinates,
 * too many vertices and zero-length lines are rejected with an {@link IllegalArgumentException}
 * instead of producing a geometry that would make a spatial query meaningless.
 */
public final class RouteGeometry {

    private static final double COORDINATE_SCALE = 1e5;
    private static final int MAX_SHIFT = 30;

    private RouteGeometry() {
    }

    /**
     * @param maxVertices upper bound of accepted vertices (guards memory and query size)
     * @throws IllegalArgumentException if the polyline is missing, malformed, out of range, too large or has no length
     */
    public static LineString fromEncodedPolyline(String encoded, int maxVertices) {
        if (encoded == null || encoded.isBlank()) {
            throw new IllegalArgumentException("Route geometry is missing.");
        }

        Coordinate[] buffer = new Coordinate[Math.min(maxVertices, Math.max(2, encoded.length() / 2))];
        int count = 0;
        int index = 0;
        long lat = 0;
        long lng = 0;

        while (index < encoded.length()) {
            long[] latDelta = readDelta(encoded, index);
            index = (int) latDelta[1];
            long[] lngDelta = readDelta(encoded, index);
            index = (int) lngDelta[1];
            lat += latDelta[0];
            lng += lngDelta[0];

            double latitude = lat / COORDINATE_SCALE;
            double longitude = lng / COORDINATE_SCALE;
            if (!Coordinates.isValid(latitude, longitude)) {
                throw new IllegalArgumentException("Route geometry has a coordinate out of range.");
            }
            if (count >= maxVertices) {
                throw new IllegalArgumentException("Route geometry has too many vertices.");
            }
            if (count == buffer.length) {
                buffer = java.util.Arrays.copyOf(buffer, Math.min(maxVertices, buffer.length * 2));
            }
            buffer[count++] = new Coordinate(longitude, latitude);
        }

        if (count < 2) {
            throw new IllegalArgumentException("Route geometry needs at least two points.");
        }
        Coordinate[] coordinates = java.util.Arrays.copyOf(buffer, count);
        LineString line = SpatialReference.geometryFactory().createLineString(coordinates);
        if (line.getLength() == 0) {
            throw new IllegalArgumentException("Route geometry has no length.");
        }
        return line;
    }

    /** @return {value, nextIndex} */
    private static long[] readDelta(String encoded, int start) {
        long result = 0;
        int shift = 0;
        int index = start;
        int chunk;
        do {
            if (index >= encoded.length() || shift > MAX_SHIFT) {
                throw new IllegalArgumentException("Route geometry is malformed.");
            }
            chunk = encoded.charAt(index++) - 63;
            if (chunk < 0 || chunk > 63) {
                throw new IllegalArgumentException("Route geometry is malformed.");
            }
            result |= (long) (chunk & 0x1f) << shift;
            shift += 5;
        } while (chunk >= 0x20);
        return new long[] {(result & 1) != 0 ? ~(result >> 1) : result >> 1, index};
    }
}
