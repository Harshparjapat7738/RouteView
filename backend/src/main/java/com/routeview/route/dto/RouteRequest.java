package com.routeview.route.dto;

import java.time.Instant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

/**
 * Body of {@code POST /api/routes}. {@code travelMode} is optional: when it is missing the request is a normal
 * car route, exactly as before travel modes existed. An unknown value is rejected as a bad request.
 *
 * <p>The transit fields ({@code transitPreference}, {@code departureTime}, {@code arrivalTime}) only apply to
 * Train and Metro and are all optional; without them the journey leaves now with the provider's default ranking.
 */
public record RouteRequest(
        @NotNull @Valid PointDto origin,
        @NotNull @Valid PointDto destination,
        TravelMode travelMode,
        TransitOptions.Preference transitPreference,
        Instant departureTime,
        Instant arrivalTime) {

    public RouteRequest {
        travelMode = travelMode == null ? TravelMode.DEFAULT : travelMode;
    }

    public RouteRequest(PointDto origin, PointDto destination, TravelMode travelMode) {
        this(origin, destination, travelMode, null, null, null);
    }

    public RouteRequest(PointDto origin, PointDto destination) {
        this(origin, destination, TravelMode.DEFAULT, null, null, null);
    }

    /** The transit options of the request; null fields mean "not asked for". */
    public TransitOptions transitOptions() {
        if (departureTime != null && arrivalTime != null) {
            throw new com.routeview.common.error.BadRequestException("Choose either a departure time or an arrival time, not both.");
        }
        return new TransitOptions(transitPreference, departureTime, arrivalTime);
    }
}
