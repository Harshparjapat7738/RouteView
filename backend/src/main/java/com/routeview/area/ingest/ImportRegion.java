package com.routeview.area.ingest;

/**
 * A geographic region to import, as a WGS 84 bounding box in degrees.
 * Configured as {@code AREA_IMPORT_REGION=south,west,north,east}.
 */
public record ImportRegion(double south, double west, double north, double east) {

    public ImportRegion {
        if (!isFinite(south, west, north, east)) {
            throw new IllegalArgumentException("Region coordinates must be numbers.");
        }
        if (south < -90 || north > 90 || west < -180 || east > 180) {
            throw new IllegalArgumentException("Region is outside the valid latitude/longitude range.");
        }
        if (south >= north || west >= east) {
            throw new IllegalArgumentException("Region must be south,west,north,east with south < north and west < east.");
        }
    }

    /** Parses {@code south,west,north,east}. */
    public static ImportRegion parse(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("AREA_IMPORT_REGION is not set. Use south,west,north,east in degrees.");
        }
        String[] parts = text.split(",");
        if (parts.length != 4) {
            throw new IllegalArgumentException("AREA_IMPORT_REGION must have four numbers: south,west,north,east.");
        }
        try {
            return new ImportRegion(
                    Double.parseDouble(parts[0].trim()),
                    Double.parseDouble(parts[1].trim()),
                    Double.parseDouble(parts[2].trim()),
                    Double.parseDouble(parts[3].trim()));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("AREA_IMPORT_REGION must contain only numbers: south,west,north,east.");
        }
    }

    /** The larger of the latitude and longitude extent, in degrees. */
    public double maxSpanDegrees() {
        return Math.max(north - south, east - west);
    }

    private static boolean isFinite(double... values) {
        for (double value : values) {
            if (!Double.isFinite(value)) {
                return false;
            }
        }
        return true;
    }
}
