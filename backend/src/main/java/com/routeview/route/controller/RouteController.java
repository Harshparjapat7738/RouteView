package com.routeview.route.controller;

import jakarta.validation.Valid;

import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.routeview.route.dto.RouteRequest;
import com.routeview.route.dto.RouteResponse;
import com.routeview.route.service.RouteService;
import com.routeview.routing.RoutingException;

@RestController
@RequestMapping("/api/routes")
public class RouteController {

    private final RouteService routeService;

    public RouteController(RouteService routeService) {
        this.routeService = routeService;
    }

    @PostMapping
    public RouteResponse calculateRoutes(@Valid @RequestBody RouteRequest request) {
        return RouteResponse.from(routeService.calculateRoutes(
                request.origin().toCoordinates(), request.destination().toCoordinates(), request.travelMode(), request.transitOptions()));
    }

    @ExceptionHandler(RoutingException.class)
    public ProblemDetail handleRoutingFailure(RoutingException ex) {
        return RoutingFailureResponses.toProblem(ex);
    }
}
