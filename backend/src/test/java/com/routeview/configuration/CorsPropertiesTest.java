package com.routeview.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class CorsPropertiesTest {

    @Test
    void trimsAndDropsBlankOrigins() {
        CorsProperties properties = new CorsProperties(List.of(" https://app.example.com ", " ", ""));
        assertEquals(List.of("https://app.example.com"), properties.allowedOrigins());
    }

    @Test
    void normalizesOneTrailingSlashFromConfiguredOrigin() {
        CorsProperties properties = new CorsProperties(List.of(" https://app.example.com/ "));
        assertEquals(List.of("https://app.example.com"), properties.allowedOrigins());
    }

    @Test
    void missingListMeansNoCrossOriginAccess() {
        assertTrue(new CorsProperties(null).allowedOrigins().isEmpty());
    }

    @Test
    void wildcardOriginsAreRejectedAtStartup() {
        assertThrows(IllegalArgumentException.class, () -> new CorsProperties(List.of("*")));
        assertThrows(IllegalArgumentException.class, () -> new CorsProperties(List.of("https://*.example.com")));
        assertThrows(IllegalArgumentException.class,
                () -> new CorsProperties(Arrays.asList("https://app.example.com", " * ")));
    }
}
