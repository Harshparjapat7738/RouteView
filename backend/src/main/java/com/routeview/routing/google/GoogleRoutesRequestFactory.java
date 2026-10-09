package com.routeview.routing.google;

import java.util.LinkedHashMap;
import java.util.Map;

import com.routeview.common.geo.Coordinates;
import com.routeview.routing.model.RoutingRequest;
import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

/** Builds the JSON body and field mask for {@code directions/v2:computeRoutes}. */
final class GoogleRoutesRequestFactory {

    /** Only the fields RouteView uses: a narrow mask keeps responses small and billing at the lowest tier. */
    static final String FIELD_MASK =
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description";

    /** Extra fields that describe a transit journey: walking and riding steps with their stops and times. */
    private static final String TRANSIT_FIELDS =
            "routes.legs.steps.travelMode,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,"
                    + "routes.legs.steps.transitDetails,routes.travelAdvisory.transitFare";

    private GoogleRoutesRequestFactory() {
    }

    /** The field mask for a mode: the base fields plus provider warnings or transit details where they apply. */
    static String fieldMask(TravelMode mode) {
        GoogleTravelModeMapping.Config config = GoogleTravelModeMapping.forMode(mode);
        StringBuilder mask = new StringBuilder(FIELD_MASK);
        if (config.showsProviderWarnings()) {
            mask.append(",routes.warnings");
        }
        if (config.isTransit()) {
            mask.append(',').append(TRANSIT_FIELDS);
        }
        return mask.toString();
    }

    static Map<String, Object> build(RoutingRequest request) {
        GoogleTravelModeMapping.Config config = GoogleTravelModeMapping.forMode(request.travelMode());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("origin", waypoint(request.origin()));
        body.put("destination", waypoint(request.destination()));
        body.put("travelMode", config.googleTravelMode());
        if (config.routingPreference()) {
            // Traffic is out of scope for RouteView; unaware routing is deterministic and the cheapest SKU.
            // Google rejects this field for walking, cycling and transit, so it is only sent where it is valid.
            body.put("routingPreference", "TRAFFIC_UNAWARE");
        }
        body.put("computeAlternativeRoutes", true);
        // The geometry feeds area detection later, so request the detailed polyline.
        body.put("polylineQuality", "HIGH_QUALITY");
        body.put("polylineEncoding", "ENCODED_POLYLINE");
        if (config.isTransit()) {
            // Departure defaults to "now" at Google. allowedTravelModes is a preference, not a guarantee.
            Map<String, Object> transitPreferences = new LinkedHashMap<>();
            transitPreferences.put("allowedTravelModes", config.allowedTransitModes());
            TransitOptions options = request.transitOptions();
            if (options.preference() != null) {
                // Google's own transit ranking preferences: LESS_WALKING or FEWER_TRANSFERS.
                transitPreferences.put("routingPreference", options.preference().name());
            }
            body.put("transitPreferences", transitPreferences);
            if (options.departureTime() != null) {
                body.put("departureTime", options.departureTime().toString());
            }
            if (options.arrivalTime() != null) {
                body.put("arrivalTime", options.arrivalTime().toString());
            }
        }
        return body;
    }

    private static Map<String, Object> waypoint(Coordinates point) {
        Map<String, Object> latLng = new LinkedHashMap<>();
        latLng.put("latitude", point.latitude());
        latLng.put("longitude", point.longitude());
        return Map.of("location", Map.of("latLng", latLng));
    }
}
