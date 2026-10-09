package com.routeview.bus.ingest;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings of the explicit bus import ({@code gradlew importBus}); environment variables {@code BUS_IMPORT_SOURCE_FILE},
 * {@code BUS_IMPORT_SOURCE_VERSION}, {@code BUS_IMPORT_SOURCE_UPDATED_AT}.
 *
 * @param run             true only for the import command; normal startup never imports
 * @param sourceFile      path of the GTFS .zip, the unpacked folder, or a folder holding the bus dataset
 * @param source          dataset family stored with every record
 * @param sourceVersion   version label of this dataset (required: it is what makes a re-import traceable)
 * @param sourceUpdatedAt publication / update date of the dataset (yyyy-MM-dd), optional
 * @param batchSize       rows per database batch
 */
@ConfigurationProperties(prefix = "routeview.bus-import")
public record BusImportProperties(
        boolean run,
        String sourceFile,
        String source,
        String sourceVersion,
        String sourceUpdatedAt,
        int batchSize) {

    public static final String DEFAULT_SOURCE = "DELHI_BUS_GTFS";

    public BusImportProperties {
        sourceFile = sourceFile == null ? "" : sourceFile.trim();
        source = source == null || source.isBlank() ? DEFAULT_SOURCE : source.trim();
        sourceVersion = sourceVersion == null ? "" : sourceVersion.trim();
        sourceUpdatedAt = sourceUpdatedAt == null ? "" : sourceUpdatedAt.trim();
        batchSize = batchSize <= 0 ? BusGtfsImporter.Options.DEFAULT_BATCH_SIZE : Math.min(batchSize, 50_000);
    }

    /** @throws IllegalArgumentException with a message that names the missing / invalid setting */
    public BusGtfsImporter.Options toOptions() {
        if (sourceVersion.isEmpty()) {
            throw new IllegalArgumentException("BUS_IMPORT_SOURCE_VERSION is required (for example the publication date of the dataset).");
        }
        LocalDate updated = null;
        if (!sourceUpdatedAt.isEmpty()) {
            try {
                updated = LocalDate.parse(sourceUpdatedAt);
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("BUS_IMPORT_SOURCE_UPDATED_AT must be a date like 2024-01-01.");
            }
        }
        BusGtfsImporter.Options d = BusGtfsImporter.Options.india(source, sourceVersion, updated);
        return new BusGtfsImporter.Options(source, sourceVersion, updated, batchSize, d.minLatitude(), d.maxLatitude(), d.minLongitude(), d.maxLongitude());
    }
}
