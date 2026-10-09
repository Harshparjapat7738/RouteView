package com.routeview.bus.journey;

import java.time.DateTimeException;
import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings of the bus journey engine ({@code routeview.bus-journey.*}); every value has a safe default.
 *
 * @param timeZone         time zone of the dataset's service days (the agencies' zone); journeys are planned in it
 * @param maxAlternatives  most journeys returned
 */
@ConfigurationProperties(prefix = "routeview.bus-journey")
public record BusJourneyProperties(String timeZone, int maxAlternatives) {

    public static final String DEFAULT_ZONE = "Asia/Kolkata";

    public BusJourneyProperties {
        timeZone = timeZone == null || timeZone.isBlank() ? DEFAULT_ZONE : timeZone.trim();
        try {
            ZoneId.of(timeZone);
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("routeview.bus-journey.time-zone is not a valid time zone: " + timeZone);
        }
        maxAlternatives = maxAlternatives <= 0 ? 3 : Math.min(maxAlternatives, 5);
    }

    public static BusJourneyProperties defaults() {
        return new BusJourneyProperties(null, 0);
    }

    public ZoneId zone() {
        return ZoneId.of(timeZone);
    }
}
