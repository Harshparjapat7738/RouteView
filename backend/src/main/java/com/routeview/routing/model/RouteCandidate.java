package com.routeview.routing.model;

import java.util.List;

/**
 * One route returned by a routing provider, expressed in RouteView's own terms.
 *
 * @param distanceMeters  total length in meters
 * @param durationSeconds expected travel time in seconds
 * @param encodedPolyline route geometry as an encoded polyline (precision 5)
 * @param summary         short human-readable description such as "via NH19"; empty if unknown
 * @param transit         public-transit details, or null for road, walking and cycling routes
 * @param warnings        provider warnings that must be shown with the route (never null)
 */
public record RouteCandidate(
        long distanceMeters,
        long durationSeconds,
        String encodedPolyline,
        String summary,
        TransitInfo transit,
        List<String> warnings) {

    /** A route without transit details or warnings. */
    public RouteCandidate(long distanceMeters, long durationSeconds, String encodedPolyline, String summary) {
        this(distanceMeters, durationSeconds, encodedPolyline, summary, null, List.of());
    }

    public RouteCandidate {
        if (distanceMeters < 0 || durationSeconds < 0) {
            throw new IllegalArgumentException("Distance and duration must not be negative");
        }
        if (encodedPolyline == null || encodedPolyline.isBlank()) {
            throw new IllegalArgumentException("Route geometry is required");
        }
        summary = summary == null ? "" : summary.strip();
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
