package com.routeview.routing.google;

import java.util.List;

import com.routeview.routing.model.TravelMode;

/**
 * The one place that translates RouteView travel modes into Google Routes API configuration.
 * Google's names never leave this package.
 *
 * <p>Note the REST enum names: {@code DRIVE}, {@code WALK}, {@code BICYCLE} and {@code TWO_WHEELER}
 * (not the JavaScript API's DRIVING / WALKING / BICYCLING). Train and Metro are not modes of their own:
 * both are {@code TRANSIT} with different {@code transitPreferences.allowedTravelModes}.
 */
final class GoogleTravelModeMapping {

    private GoogleTravelModeMapping() {
    }

    /**
     * @param googleTravelMode   the {@code travelMode} value of the request
     * @param routingPreference  Google accepts {@code routingPreference} only for DRIVE and TWO_WHEELER
     * @param allowedTransitModes {@code transitPreferences.allowedTravelModes}; empty for non-transit modes
     * @param showsProviderWarnings Google requires showing {@code routes.warnings} for walking, cycling and two-wheeler
     */
    record Config(
            String googleTravelMode,
            boolean routingPreference,
            List<String> allowedTransitModes,
            boolean showsProviderWarnings) {

        boolean isTransit() {
            return "TRANSIT".equals(googleTravelMode);
        }
    }

    static Config forMode(TravelMode mode) {
        return switch (mode) {
            case TWO_WHEELER -> new Config("TWO_WHEELER", true, List.of(), true);
            case FOUR_WHEELER -> new Config("DRIVE", true, List.of(), false);
            case WALKING -> new Config("WALK", false, List.of(), true);
            case CYCLING -> new Config("BICYCLE", false, List.of(), true);
            case TRAIN -> new Config("TRANSIT", false, List.of("TRAIN"), false);
            case METRO -> new Config("TRANSIT", false, List.of("SUBWAY"), false);
            // Buses are planned from the imported GTFS data and normally never reach the provider; this keeps the mapping total.
            case BUS -> new Config("TRANSIT", false, List.of("BUS"), false);
        };
    }
}
