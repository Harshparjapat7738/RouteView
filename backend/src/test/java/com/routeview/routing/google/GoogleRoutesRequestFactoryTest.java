package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.common.geo.Coordinates;
import com.routeview.routing.model.RoutingRequest;

class GoogleRoutesRequestFactoryTest {

    private static final RoutingRequest REQUEST =
            new RoutingRequest(new Coordinates(28.3354, 77.4231), new Coordinates(28.4089, 77.3178));

    @Test
    void buildsAlternativeDrivingRequestWithGoogleWaypointFormat() {
        Map<String, Object> body = GoogleRoutesRequestFactory.build(REQUEST);

        assertEquals("DRIVE", body.get("travelMode"));
        assertEquals("TRAFFIC_UNAWARE", body.get("routingPreference"));
        assertEquals(true, body.get("computeAlternativeRoutes"));
        assertEquals("ENCODED_POLYLINE", body.get("polylineEncoding"));
        assertEquals(latLng(28.3354, 77.4231), body.get("origin"));
        assertEquals(latLng(28.4089, 77.3178), body.get("destination"));
    }

    @Test
    void fieldMaskRequestsOnlyWhatRouteViewUses() {
        assertTrue(GoogleRoutesRequestFactory.FIELD_MASK.contains("routes.polyline.encodedPolyline"));
        assertTrue(GoogleRoutesRequestFactory.FIELD_MASK.contains("routes.distanceMeters"));
        assertTrue(GoogleRoutesRequestFactory.FIELD_MASK.contains("routes.duration"));
        assertFalse(GoogleRoutesRequestFactory.FIELD_MASK.contains("*"));
    }

    private static Map<String, Object> latLng(double latitude, double longitude) {
        return Map.of("location", Map.of("latLng", Map.of("latitude", latitude, "longitude", longitude)));
    }
}
