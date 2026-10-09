package com.routeview.route.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import com.routeview.routing.RoutingException;

/** Turns a routing failure into the API's problem response; shared by every endpoint that calculates routes. */
public final class RoutingFailureResponses {

    private static final Logger log = LoggerFactory.getLogger(RoutingFailureResponses.class);
    private static final String UNAVAILABLE_DETAIL = "Route calculation is currently unavailable.";

    private RoutingFailureResponses() {
    }

    /** Provider problems are reported with a generic message; the reason stays in the server log. */
    public static ProblemDetail toProblem(RoutingException ex) {
        log.warn("Route calculation failed: reason={}, detail={}", ex.getReason(), ex.getMessage());
        HttpStatus status = switch (ex.getReason()) {
            case UNAVAILABLE, NOT_CONFIGURED, QUOTA -> HttpStatus.SERVICE_UNAVAILABLE;
            case TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
            // The mode itself cannot be routed here: the client offers another mode instead of retrying.
            case UNSUPPORTED_MODE -> HttpStatus.UNPROCESSABLE_ENTITY;
            case REJECTED, INVALID_RESPONSE -> HttpStatus.BAD_GATEWAY;
        };
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, UNAVAILABLE_DETAIL);
        // A stable, non-sensitive code lets the client choose its message and whether a retry makes sense.
        problem.setProperty("code", "ROUTING_" + ex.getReason().name());
        return problem;
    }
}
