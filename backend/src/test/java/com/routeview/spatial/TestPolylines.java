package com.routeview.spatial;

/** Encodes coordinates with the standard polyline algorithm (precision 5), to build realistic route geometry in tests. */
public final class TestPolylines {

    private TestPolylines() {
    }

    /** @param latLng latitude, longitude pairs */
    public static String encode(double... latLng) {
        StringBuilder out = new StringBuilder();
        long lastLat = 0;
        long lastLng = 0;
        for (int i = 0; i < latLng.length; i += 2) {
            long lat = Math.round(latLng[i] * 1e5);
            long lng = Math.round(latLng[i + 1] * 1e5);
            append(out, lat - lastLat);
            append(out, lng - lastLng);
            lastLat = lat;
            lastLng = lng;
        }
        return out.toString();
    }

    private static void append(StringBuilder out, long value) {
        long v = value < 0 ? ~(value << 1) : value << 1;
        while (v >= 0x20) {
            out.append((char) ((0x20 | (v & 0x1f)) + 63));
            v >>= 5;
        }
        out.append((char) (v + 63));
    }
}
