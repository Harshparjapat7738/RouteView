package com.routeview.metro.model;

import java.util.Map;
import java.util.UUID;

import com.routeview.common.accessibility.Accessibility;

/**
 * A metro station: transportation infrastructure, never a geographical area / journey stop. Names are not unique;
 * relationships always use {@code id}.
 */
public record MetroStation(
        UUID id,
        String externalId,
        String name,
        double latitude,
        double longitude,
        String source,
        String sourceVersion,
        boolean active,
        Map<String, String> metadata) {

    /** Metadata key holding the dataset's explicit wheelchair statement (ACCESSIBLE / INACCESSIBLE); absent means unknown. */
    public static final String WHEELCHAIR_KEY = "wheelchairBoarding";

    public MetroStation {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }

    /** What the dataset this station was imported from says about wheelchair access; unknown unless it said so explicitly. */
    public Accessibility accessibility() {
        return Accessibility.of(metadata.get(WHEELCHAIR_KEY), source, sourceVersion);
    }
}
