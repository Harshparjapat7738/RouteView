package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class GoogleRoutesPropertiesTest {

    @Test
    void appliesDefaultsForMissingValues() {
        GoogleRoutesProperties properties = new GoogleRoutesProperties(null, null, null, null);

        assertFalse(properties.hasApiKey());
        assertEquals("https://routes.googleapis.com", properties.baseUrl());
        assertEquals(Duration.ofSeconds(3), properties.connectTimeout());
        assertEquals(Duration.ofSeconds(10), properties.readTimeout());
    }

    @Test
    void blankKeyCountsAsNotConfigured() {
        assertFalse(new GoogleRoutesProperties("   ", null, null, null).hasApiKey());
    }

    @Test
    void neverPrintsTheApiKey() {
        GoogleRoutesProperties properties = new GoogleRoutesProperties("super-secret-key", null, null, null);

        assertTrue(properties.hasApiKey());
        assertFalse(properties.toString().contains("super-secret-key"));
    }
}
