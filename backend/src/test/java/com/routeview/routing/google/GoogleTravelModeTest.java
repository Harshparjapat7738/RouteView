package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.common.geo.Coordinates;
import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.model.RoutingRequest;
import com.routeview.routing.model.TravelMode;

class GoogleTravelModeTest {

    private static final Coordinates FARIDABAD = new Coordinates(28.4089, 77.3178);
    private static final Coordinates GURUGRAM = new Coordinates(28.4595, 77.0266);

    private static Map<String, Object> body(TravelMode mode) {
        return GoogleRoutesRequestFactory.build(new RoutingRequest(FARIDABAD, GURUGRAM, mode));
    }

    @Test
    void mapsEveryTravelModeToItsGoogleRestValue() {
        assertEquals("TWO_WHEELER", GoogleTravelModeMapping.forMode(TravelMode.TWO_WHEELER).googleTravelMode());
        assertEquals("DRIVE", GoogleTravelModeMapping.forMode(TravelMode.FOUR_WHEELER).googleTravelMode());
        assertEquals("WALK", GoogleTravelModeMapping.forMode(TravelMode.WALKING).googleTravelMode());
        assertEquals("BICYCLE", GoogleTravelModeMapping.forMode(TravelMode.CYCLING).googleTravelMode());
        assertEquals("TRANSIT", GoogleTravelModeMapping.forMode(TravelMode.TRAIN).googleTravelMode());
        assertEquals("TRANSIT", GoogleTravelModeMapping.forMode(TravelMode.METRO).googleTravelMode());
    }

    @Test
    void trainPrefersTrainAndMetroPrefersSubway() {
        assertEquals(List.of("TRAIN"), GoogleTravelModeMapping.forMode(TravelMode.TRAIN).allowedTransitModes());
        assertEquals(List.of("SUBWAY"), GoogleTravelModeMapping.forMode(TravelMode.METRO).allowedTransitModes());
        assertEquals(Map.of("allowedTravelModes", List.of("TRAIN")), body(TravelMode.TRAIN).get("transitPreferences"));
        assertEquals(Map.of("allowedTravelModes", List.of("SUBWAY")), body(TravelMode.METRO).get("transitPreferences"));
        assertEquals("TRANSIT", body(TravelMode.TRAIN).get("travelMode"));
        assertEquals("TRANSIT", body(TravelMode.METRO).get("travelMode"));
    }

    @Test
    void roadModesHaveNoTransitPreferences() {
        for (TravelMode mode : List.of(TravelMode.TWO_WHEELER, TravelMode.FOUR_WHEELER, TravelMode.WALKING, TravelMode.CYCLING)) {
            assertNull(body(mode).get("transitPreferences"), mode.name());
        }
    }

    @Test
    void routingPreferenceIsSentOnlyWhereGoogleAcceptsIt() {
        assertEquals("TRAFFIC_UNAWARE", body(TravelMode.FOUR_WHEELER).get("routingPreference"));
        assertEquals("TRAFFIC_UNAWARE", body(TravelMode.TWO_WHEELER).get("routingPreference"));
        for (TravelMode mode : List.of(TravelMode.WALKING, TravelMode.CYCLING, TravelMode.TRAIN, TravelMode.METRO)) {
            assertFalse(body(mode).containsKey("routingPreference"), mode.name());
        }
    }

    @Test
    void everyModeAsksForAlternativesAndDetailedGeometry() {
        for (TravelMode mode : TravelMode.values()) {
            assertEquals(true, body(mode).get("computeAlternativeRoutes"), mode.name());
            assertEquals("ENCODED_POLYLINE", body(mode).get("polylineEncoding"), mode.name());
        }
    }

    @Test
    void defaultModeKeepsTheExistingCarRequest() {
        assertEquals(TravelMode.FOUR_WHEELER, new RoutingRequest(FARIDABAD, GURUGRAM).travelMode());
        assertEquals(TravelMode.FOUR_WHEELER, new RoutingRequest(FARIDABAD, GURUGRAM, null).travelMode());
        assertEquals("DRIVE", GoogleRoutesRequestFactory.build(new RoutingRequest(FARIDABAD, GURUGRAM)).get("travelMode"));
        assertEquals(GoogleRoutesRequestFactory.FIELD_MASK, GoogleRoutesRequestFactory.fieldMask(TravelMode.FOUR_WHEELER));
    }

    @Test
    void fieldMaskAddsWarningsOrTransitDetailsOnlyWhereTheyApply() {
        for (TravelMode mode : List.of(TravelMode.TWO_WHEELER, TravelMode.WALKING, TravelMode.CYCLING)) {
            assertTrue(GoogleRoutesRequestFactory.fieldMask(mode).contains("routes.warnings"), mode.name());
            assertFalse(GoogleRoutesRequestFactory.fieldMask(mode).contains("transitDetails"), mode.name());
        }
        for (TravelMode mode : List.of(TravelMode.TRAIN, TravelMode.METRO)) {
            assertTrue(GoogleRoutesRequestFactory.fieldMask(mode).contains("routes.legs.steps.transitDetails"), mode.name());
        }
        assertFalse(GoogleRoutesRequestFactory.fieldMask(TravelMode.FOUR_WHEELER).contains("legs"));
        assertFalse(GoogleRoutesRequestFactory.fieldMask(TravelMode.METRO).contains("*"));
    }

    @Test
    void unsupportedModeIsReportedOnlyForNonCarModes() {
        assertEquals(Reason.UNSUPPORTED_MODE, GoogleRoutesErrors.reasonFor(400, TravelMode.TWO_WHEELER));
        assertEquals(Reason.UNSUPPORTED_MODE, GoogleRoutesErrors.reasonFor(404, TravelMode.METRO));
        assertEquals(Reason.REJECTED, GoogleRoutesErrors.reasonFor(400, TravelMode.FOUR_WHEELER));
        assertEquals(Reason.REJECTED, GoogleRoutesErrors.reasonFor(403, TravelMode.TWO_WHEELER));
        assertEquals(Reason.QUOTA, GoogleRoutesErrors.reasonFor(429, TravelMode.WALKING));
        assertEquals(Reason.UNAVAILABLE, GoogleRoutesErrors.reasonFor(503, TravelMode.TRAIN));
    }

    @Test
    void onlyTrainAndMetroAreTransit() {
        for (TravelMode mode : TravelMode.values()) {
            assertEquals(mode == TravelMode.TRAIN || mode == TravelMode.METRO, mode.isTransit(), mode.name());
        }
    }
}
