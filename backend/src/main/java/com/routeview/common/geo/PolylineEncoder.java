package com.routeview.common.geo;

import java.util.List;

/** Encodes {latitude, longitude} points as a polyline of precision 5: the format RouteView uses for route geometry everywhere. */
public final class PolylineEncoder {

    private PolylineEncoder() {
    }

    /** @param points {latitude, longitude} pairs; at least one point */
    public static String encode(List<double[]> points) {
        StringBuilder out = new StringBuilder();
        long lastLat = 0;
        long lastLng = 0;
        for (double[] point : points) {
            long lat = Math.round(point[0] * 1e5);
            long lng = Math.round(point[1] * 1e5);
            write(out, lat - lastLat);
            write(out, lng - lastLng);
            lastLat = lat;
            lastLng = lng;
        }
        return out.toString();
    }

    /** Decodes a precision-5 polyline into {latitude, longitude} points. */
    public static List<double[]> decode(String encoded) {
        List<double[]> points = new java.util.ArrayList<>();
        int index = 0;
        long lat = 0;
        long lng = 0;
        while (index < encoded.length()) {
            long[] a = read(encoded, index);
            index = (int) a[1];
            long[] b = read(encoded, index);
            index = (int) b[1];
            lat += a[0];
            lng += b[0];
            points.add(new double[]{lat / 1e5, lng / 1e5});
        }
        return points;
    }

    private static long[] read(String encoded, int start) {
        long result = 0;
        int shift = 0;
        int index = start;
        int chunk;
        do {
            chunk = encoded.charAt(index++) - 63;
            result |= (long) (chunk & 0x1f) << shift;
            shift += 5;
        } while (chunk >= 0x20 && index < encoded.length());
        return new long[]{(result & 1) != 0 ? ~(result >> 1) : result >> 1, index};
    }

    private static void write(StringBuilder out, long delta) {
        long value = delta < 0 ? ~(delta << 1) : delta << 1;
        while (value >= 0x20) {
            out.append((char) ((0x20 | (value & 0x1f)) + 63));
            value >>= 5;
        }
        out.append((char) (value + 63));
    }
}
