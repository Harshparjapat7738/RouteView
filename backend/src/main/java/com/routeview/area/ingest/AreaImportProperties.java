package com.routeview.area.ingest;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings of the explicit area import. Bound from {@code routeview.area-import.*}
 * (environment: {@code AREA_IMPORT_REGION}, {@code AREA_IMPORT_SOURCE_FILE}, {@code AREA_IMPORT_OVERPASS_URL},
 * {@code AREA_IMPORT_BATCH_SIZE}, {@code AREA_IMPORT_MAX_SPAN_DEGREES}).
 *
 * @param run             true only for the import command ({@code gradlew importAreas}); normal startup never imports
 * @param region          {@code south,west,north,east} in degrees; required unless a source file is used
 * @param sourceFile      optional path of a saved Overpass XML file to import instead of calling Overpass
 * @param overpassUrl     Overpass API endpoint (https)
 * @param batchSize       records per database transaction
 * @param maxSpanDegrees  largest allowed width/height of the region, a guard against importing a huge area
 * @param minAreaSquareMeters     smaller polygons are digitising slivers and rejected (default 500)
 * @param maxAreaSquareKilometers larger polygons are states/countries or broken data and rejected (default 150000)
 */
@ConfigurationProperties(prefix = "routeview.area-import")
public record AreaImportProperties(
        boolean run,
        String region,
        String sourceFile,
        String overpassUrl,
        int batchSize,
        double maxSpanDegrees,
        double minAreaSquareMeters,
        double maxAreaSquareKilometers) {

    public static final int DEFAULT_BATCH_SIZE = 200;
    public static final int MAX_BATCH_SIZE = 1000;
    public static final double DEFAULT_MAX_SPAN_DEGREES = 1.0;
    public static final String DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

    public AreaImportProperties {
        region = region == null ? "" : region.trim();
        sourceFile = sourceFile == null ? "" : sourceFile.trim();
        overpassUrl = overpassUrl == null || overpassUrl.isBlank() ? DEFAULT_OVERPASS_URL : overpassUrl.trim();
        batchSize = batchSize <= 0 ? DEFAULT_BATCH_SIZE : Math.min(batchSize, MAX_BATCH_SIZE);
        maxSpanDegrees = maxSpanDegrees <= 0 ? DEFAULT_MAX_SPAN_DEGREES : maxSpanDegrees;
        minAreaSquareMeters = minAreaSquareMeters <= 0 ? AreaGeometryNormalizer.DEFAULT_MIN_AREA_SQUARE_METERS : minAreaSquareMeters;
        maxAreaSquareKilometers = maxAreaSquareKilometers <= 0 ? AreaGeometryNormalizer.DEFAULT_MAX_AREA_SQUARE_METERS / 1e6 : maxAreaSquareKilometers;
    }

    public boolean usesSourceFile() {
        return !sourceFile.isEmpty();
    }
}
