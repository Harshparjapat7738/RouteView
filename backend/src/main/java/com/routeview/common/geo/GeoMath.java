package com.routeview.common.geo;

/** Small geodesy helpers (spherical earth: accurate to well under 0.5 % at city scale). */
public final class GeoMath {

    public static final double EARTH_RADIUS_METERS = 6_371_008.8;

    private GeoMath() {
    }

    /** Great-circle distance in meters between two WGS 84 points. */
    public static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1);
        double p2 = Math.toRadians(lat2);
        double dp = p2 - p1;
        double dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /** Length in meters of a {latitude, longitude} polyline. */
    public static double lengthMeters(java.util.List<double[]> points) {
        double total = 0;
        for (int i = 1; i < points.size(); i++) {
            total += haversineMeters(points.get(i - 1)[0], points.get(i - 1)[1], points.get(i)[0], points.get(i)[1]);
        }
        return total;
    }
}
