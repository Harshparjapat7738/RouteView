package com.routeview.bus.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.routeview.bus.journey.BusStopLayer;
import com.routeview.common.error.BadRequestException;

/** The Bus layer endpoint is bounded: small windows only, a capped list, and it says when it was cut. */
class BusStopLayerTest {

    private static BusStopLayer layer(int stops) {
        return (s, w, n, e, limit) -> {
            List<BusStopLayer.Stop> list = new ArrayList<>();
            for (int i = 0; i < Math.min(stops, limit + 1); i++) {
                list.add(new BusStopLayer.Stop(UUID.randomUUID(), "S" + i, "Stop " + i, s + 0.001, w + 0.001));
            }
            return list;
        };
    }

    private static BusController controller(BusStopLayer layer) {
        return new BusController(null, null, layer);
    }

    @Test
    void aSmallWindowReturnsItsStopsWithoutTheTruncatedFlag() {
        var response = controller(layer(5)).inView(28.60, 77.20, 28.62, 77.22);
        assertEquals(5, response.stops().size());
        assertFalse(response.truncated());
    }

    @Test
    void aBusyWindowIsCutAtTheLimitAndSaysSo() {
        var response = controller(layer(400)).inView(28.60, 77.20, 28.62, 77.22);
        assertEquals(BusController.MAX_LAYER_STOPS, response.stops().size());
        assertTrue(response.truncated());
    }

    @Test
    void aWindowThatIsTooLargeOrInvalidIsRefused() {
        BusController c = controller(layer(5));
        assertThrows(BadRequestException.class, () -> c.inView(28.0, 77.0, 28.5, 77.5));
        assertThrows(BadRequestException.class, () -> c.inView(28.62, 77.20, 28.60, 77.22));
        assertThrows(BadRequestException.class, () -> c.inView(95.0, 77.20, 96.0, 77.22));
    }
}
