package com.routeview.route.dto;

import java.util.List;

import com.routeview.bus.journey.BusJourney;
import com.routeview.metro.journey.MetroJourney;
import com.routeview.route.model.DetectedRoute;
import com.routeview.route.model.Route;
import com.routeview.routing.model.TransitInfo;

/**
 * One route as returned by the API, with the geographical areas it passes through in travel order.
 * Contains no provider-specific data.
 */
public record RouteDto(
        String id,
        int index,
        long distanceMeters,
        long durationSeconds,
        String encodedPolyline,
        String summary,
        List<DetectedAreaDto> detectedAreas,
        TransitInfo transit,
        List<String> warnings,
        MetroJourney metro,
        BusJourney bus) {

    public static RouteDto from(DetectedRoute detected) {
        Route route = detected.route();
        return new RouteDto(
                route.id(),
                route.index(),
                route.distanceMeters(),
                route.durationSeconds(),
                route.encodedPolyline(),
                route.summary(),
                detected.detectedAreas().stream().map(DetectedAreaDto::from).toList(),
                route.transit(),
                route.warnings(),
                route.metro(),
                route.bus());
    }
}
