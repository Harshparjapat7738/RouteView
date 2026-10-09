package com.routeview.route.model;

import java.util.List;

import com.routeview.area.detection.DetectedArea;

/**
 * A calculated route together with the geographical areas it passes through, in travel order.
 * Each route carries its own list; areas of different routes are never merged.
 */
public record DetectedRoute(Route route, List<DetectedArea> detectedAreas) {

    public DetectedRoute {
        detectedAreas = detectedAreas == null ? List.of() : List.copyOf(detectedAreas);
    }
}
