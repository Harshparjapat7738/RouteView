package com.routeview.configuration;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Browser origins allowed to call the API from a different origin.
 * Bound from {@code routeview.cors.allowed-origins} (env: {@code CORS_ALLOWED_ORIGINS}).
 * An empty list allows no cross-origin requests. A wildcard origin is rejected at startup:
 * every allowed origin must be listed explicitly.
 */
@ConfigurationProperties(prefix = "routeview.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null
                ? List.of()
                : allowedOrigins.stream().map(String::trim).filter(origin -> !origin.isEmpty()).toList();
        if (allowedOrigins.stream().anyMatch(origin -> origin.contains("*"))) {
            throw new IllegalArgumentException(
                    "routeview.cors.allowed-origins must list explicit origins; wildcards are not allowed");
        }
    }
}
