package com.routeview.metro.model;

import java.time.Instant;
import java.time.LocalDate;

/** Where the metro data comes from and how old it is. Static data: never a real-time feed. */
public record MetroDatasetInfo(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt, MetroServicePeriod servicePeriod) {

    public MetroDatasetInfo(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt) {
        this(source, sourceVersion, sourceUpdatedAt, importedAt, null);
    }
}
