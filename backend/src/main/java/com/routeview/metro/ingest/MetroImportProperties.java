package com.routeview.metro.ingest;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings of the explicit metro import ({@code gradlew importMetro}); environment variables
 * {@code METRO_IMPORT_SOURCE_FILE}, {@code METRO_IMPORT_SOURCE_VERSION}, {@code METRO_IMPORT_SOURCE_UPDATED_AT}.
 *
 * @param run             true only for the import command; normal startup never imports
 * @param sourceFile      path of the downloaded GTFS .zip (or unpacked folder)
 * @param source          dataset family stored with every record
 * @param sourceVersion   version label of this dataset (required: it is what makes a re-import traceable)
 * @param sourceUpdatedAt publication / update date of the dataset (yyyy-MM-dd), optional
 */
@ConfigurationProperties(prefix = "routeview.metro-import")
public record MetroImportProperties(
        boolean run,
        String sourceFile,
        String source,
        String sourceVersion,
        String sourceUpdatedAt,
        double clusterMeters,
        double maxStationGapMeters) {

    public static final String DEFAULT_SOURCE = "DMRC_GTFS";

    public MetroImportProperties {
        sourceFile = sourceFile == null ? "" : sourceFile.trim();
        source = source == null || source.isBlank() ? DEFAULT_SOURCE : source.trim();
        sourceVersion = sourceVersion == null ? "" : sourceVersion.trim();
        sourceUpdatedAt = sourceUpdatedAt == null ? "" : sourceUpdatedAt.trim();
        clusterMeters = clusterMeters <= 0 ? MetroGtfsImporter.Options.DEFAULT_CLUSTER_METERS : clusterMeters;
        maxStationGapMeters = maxStationGapMeters <= 0 ? MetroGtfsImporter.Options.DEFAULT_MAX_STATION_GAP_METERS : maxStationGapMeters;
    }

    /** @throws IllegalArgumentException with a message that names the missing / invalid setting */
    public MetroGtfsImporter.Options toOptions() {
        if (sourceVersion.isEmpty()) {
            throw new IllegalArgumentException("METRO_IMPORT_SOURCE_VERSION is required (for example the publication date of the dataset).");
        }
        LocalDate updated = null;
        if (!sourceUpdatedAt.isEmpty()) {
            try {
                updated = LocalDate.parse(sourceUpdatedAt);
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("METRO_IMPORT_SOURCE_UPDATED_AT must be a date like 2023-08-10.");
            }
        }
        MetroGtfsImporter.Options defaults = MetroGtfsImporter.Options.india(source, sourceVersion, updated);
        return new MetroGtfsImporter.Options(source, sourceVersion, updated, clusterMeters, maxStationGapMeters,
                defaults.minLatitude(), defaults.maxLatitude(), defaults.minLongitude(), defaults.maxLongitude());
    }
}
