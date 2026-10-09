package com.routeview.common.geo;

/**
 * A WGS84 point. Construction fails for non-finite or out-of-range values, so a
 * {@code Coordinates} instance is always a real position on Earth.
 */
public record Coordinates(double latitude, double longitude) {

    private static final double MAX_LATITUDE = 90.0;
    private static final double MAX_LONGITUDE = 180.0;

    public Coordinates {
        if (!isValid(latitude, longitude)) {
            throw new IllegalArgumentException("Coordinates are outside the valid range");
        }
    }

    public static boolean isValid(double latitude, double longitude) {
        return Double.isFinite(latitude)
                && Double.isFinite(longitude)
                && Math.abs(latitude) <= MAX_LATITUDE
                && Math.abs(longitude) <= MAX_LONGITUDE;
    }
}
