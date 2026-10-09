package com.routeview.route.dto;

import java.util.List;

import com.routeview.route.model.DetectedRoute;

/**
 * Body of a successful {@code POST /api/routes}. An empty list means no route exists. {@code emptyReason} is set only by the
 * bus endpoint, only when the list is empty, and says why in a stable code (for example {@code NO_STOP_NEAR_START}).
 */
public record RouteResponse(List<RouteDto> routes, String emptyReason) {

    public RouteResponse(List<RouteDto> routes) {
        this(routes, null);
    }

    public static RouteResponse from(List<DetectedRoute> routes) {
        return new RouteResponse(routes.stream().map(RouteDto::from).toList());
    }

    public static RouteResponse from(List<DetectedRoute> routes, String emptyReason) {
        return new RouteResponse(routes.stream().map(RouteDto::from).toList(), routes.isEmpty() ? emptyReason : null);
    }
}
