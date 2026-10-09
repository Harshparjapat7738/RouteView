package com.routeview.bus.controller;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.routeview.bus.journey.BusJourneyService;
import com.routeview.bus.journey.BusStopLayer;
import com.routeview.common.error.BadRequestException;
import com.routeview.common.geo.Coordinates;
import com.routeview.route.dto.RouteRequest;
import com.routeview.route.dto.RouteResponse;
import com.routeview.route.service.RouteService;

/**
 * Bus API. Journeys are the same {@code RouteResponse} as {@code /api/routes} with {@code travelMode = BUS}, so the same Route
 * Session, area detection and error handling apply; each route's {@code bus} field holds the journey. Nothing here exposes raw
 * GTFS rows. There is deliberately no import endpoint: importing is a command ({@code gradlew importBus}).
 */
@RestController
@RequestMapping("/api/bus")
public class BusController {

    private final RouteService routeService;
    private final BusJourneyService busJourneyService;
    private final BusStopLayer stopLayer;

    /** Largest window (degrees, about 4 km) the stop layer answers for, and the most stops it returns. */
    static final double MAX_WINDOW_DEGREES = 0.04;
    static final int MAX_LAYER_STOPS = 150;

    public BusController(RouteService routeService, BusJourneyService busJourneyService, BusStopLayer stopLayer) {
        this.routeService = routeService;
        this.busJourneyService = busJourneyService;
        this.stopLayer = stopLayer;
    }

    /** A bus journey between two places; the travel mode of the body is ignored: this is always Bus. */
    @PostMapping("/journey")
    public RouteResponse journey(@Valid @RequestBody RouteRequest request) {
        RouteService.BusPlan plan = routeService.planBus(request.origin().toCoordinates(), request.destination().toCoordinates(), request.transitOptions());
        return RouteResponse.from(plan.routes(), plan.reason().name());
    }

    /**
     * The bounded list (at most 8) of bus stops a journey could start from near a point: served by a bus on the day, ranked by
     * walking distance and how many routes call there.
     */
    @GetMapping("/stops/nearby")
    public NearbyStopsResponse nearby(@RequestParam double latitude, @RequestParam double longitude, @RequestParam(required = false) Instant at) {
        if (!Coordinates.isValid(latitude, longitude)) {
            throw new BadRequestException("The location is not a valid latitude / longitude.");
        }
        List<BusJourneyService.NearbyStop> stops = busJourneyService.nearby(new Coordinates(latitude, longitude), at);
        return new NearbyStopsResponse(stops.stream().map(s -> new StopDto(s.stopId(), s.gtfsId(), s.name(), s.latitude(), s.longitude(), s.distanceMeters(), s.routeCount())).toList());
    }

    /** The bus stops inside a small map window (the map's Bus layer). Larger windows are refused: the map shows stops only when zoomed in. */
    @GetMapping("/stops/in-view")
    public StopLayerResponse inView(@RequestParam double south, @RequestParam double west, @RequestParam double north, @RequestParam double east) {
        if (!Coordinates.isValid(south, west) || !Coordinates.isValid(north, east) || north <= south || east <= west) {
            throw new BadRequestException("The map window is not valid.");
        }
        if (north - south > MAX_WINDOW_DEGREES || east - west > MAX_WINDOW_DEGREES) {
            throw new BadRequestException("Zoom in to see bus stops.");
        }
        List<BusStopLayer.Stop> found = stopLayer.inWindow(south, west, north, east, MAX_LAYER_STOPS);
        boolean truncated = found.size() > MAX_LAYER_STOPS;
        List<BusStopLayer.Stop> shown = truncated ? found.subList(0, MAX_LAYER_STOPS) : found;
        return new StopLayerResponse(shown.stream().map(s -> new LayerStopDto(s.id(), s.gtfsId(), s.name(), s.latitude(), s.longitude())).toList(), truncated);
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(com.routeview.routing.RoutingException.class)
    public org.springframework.http.ProblemDetail handleRoutingFailure(com.routeview.routing.RoutingException ex) {
        return com.routeview.route.controller.RoutingFailureResponses.toProblem(ex);
    }

    public record StopDto(UUID id, String gtfsId, String name, double latitude, double longitude, long distanceMeters, int routeCount) {
    }

    public record LayerStopDto(UUID id, String gtfsId, String name, double latitude, double longitude) {
    }

    /** {@code truncated}: the window holds more stops than are listed; zooming in shows the rest. */
    public record StopLayerResponse(List<LayerStopDto> stops, boolean truncated) {
    }

    public record NearbyStopsResponse(List<StopDto> stops) {
    }
}
