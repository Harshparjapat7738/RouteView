package com.routeview.routing.model;

import java.util.Objects;

import com.routeview.common.geo.Coordinates;

/**
 * What the application asks a routing provider for. Contains no provider-specific fields: {@code travelMode} is
 * RouteView's own {@link TravelMode}, which the provider adapter translates.
 */
public record RoutingRequest(Coordinates origin, Coordinates destination, TravelMode travelMode, TransitOptions transitOptions) {

    public RoutingRequest {
        Objects.requireNonNull(origin, "origin");
        Objects.requireNonNull(destination, "destination");
        travelMode = travelMode == null ? TravelMode.DEFAULT : travelMode;
        transitOptions = transitOptions == null ? TransitOptions.NONE : transitOptions;
    }

    public RoutingRequest(Coordinates origin, Coordinates destination, TravelMode travelMode) {
        this(origin, destination, travelMode, TransitOptions.NONE);
    }

    /** A request in the default mode (a normal car): the behaviour from before travel modes existed. */
    public RoutingRequest(Coordinates origin, Coordinates destination) {
        this(origin, destination, TravelMode.DEFAULT, TransitOptions.NONE);
    }
}
