package com.routeview.routing.google;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings for the Google Routes API adapter ({@code routeview.google.routes.*}).
 * The API key is a server-side secret (env: {@code GOOGLE_MAPS_SERVER_API_KEY}).
 */
@ConfigurationProperties(prefix = "routeview.google.routes")
public record GoogleRoutesProperties(String apiKey, String baseUrl, Duration connectTimeout, Duration readTimeout) {

    static final String DEFAULT_BASE_URL = "https://routes.googleapis.com";
    static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration DEFAULT_READ_TIMEOUT = Duration.ofSeconds(10);

    public GoogleRoutesProperties {
        apiKey = apiKey == null ? "" : apiKey.strip();
        baseUrl = baseUrl == null || baseUrl.isBlank() ? DEFAULT_BASE_URL : baseUrl.strip();
        connectTimeout = connectTimeout == null ? DEFAULT_CONNECT_TIMEOUT : connectTimeout;
        readTimeout = readTimeout == null ? DEFAULT_READ_TIMEOUT : readTimeout;
    }

    public boolean hasApiKey() {
        return !apiKey.isEmpty();
    }

    /** Never prints the API key. */
    @Override
    public String toString() {
        return "GoogleRoutesProperties[baseUrl=" + baseUrl + ", apiKey=" + (hasApiKey() ? "****" : "<not set>")
                + ", connectTimeout=" + connectTimeout + ", readTimeout=" + readTimeout + "]";
    }
}
