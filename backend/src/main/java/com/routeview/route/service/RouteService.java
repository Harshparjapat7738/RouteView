package com.routeview.route.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.routeview.area.detection.AreaDetector;
import com.routeview.bus.journey.BusJourneyService;
import com.routeview.common.error.BadRequestException;
import com.routeview.common.geo.Coordinates;
import com.routeview.metro.journey.MetroJourney;
import com.routeview.metro.journey.MetroJourneyService;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.route.model.DetectedRoute;
import com.routeview.route.model.Route;
import com.routeview.routing.RoutingProvider;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.RoutingRequest;
import com.routeview.routing.model.TransitOptions;
import com.routeview.routing.model.TravelMode;

/**
 * Calculates route alternatives between two points through the configured {@link RoutingProvider}
 * and determines the geographical areas each alternative passes through.
 */
@Service
public class RouteService {

    /** Google transit schedules reach about 100 days ahead; stay inside that. */
    private static final Duration MAX_SCHEDULE_AHEAD = Duration.ofDays(90);

    private final RoutingProvider routingProvider;
    private final AreaDetector areaDetector;
    private final MetroJourneyService metroJourneyService;
    private final BusJourneyService busJourneyService;

    @Autowired
    public RouteService(RoutingProvider routingProvider, AreaDetector areaDetector, MetroJourneyService metroJourneyService, BusJourneyService busJourneyService) {
        this.routingProvider = routingProvider;
        this.areaDetector = areaDetector;
        this.metroJourneyService = metroJourneyService;
        this.busJourneyService = busJourneyService;
    }

    /** Without bus data: Bus then has no journeys. */
    public RouteService(RoutingProvider routingProvider, AreaDetector areaDetector, MetroJourneyService metroJourneyService) {
        this(routingProvider, areaDetector, metroJourneyService, null);
    }

    /** Without metro network data: Metro journeys then rely on the routing provider's stop information alone. */
    public RouteService(RoutingProvider routingProvider, AreaDetector areaDetector) {
        this(routingProvider, areaDetector, new MetroJourneyService(() -> MetroNetwork.EMPTY));
    }

    /**
     * @return the alternatives, preferred route first, each with its own detected areas (possibly none);
     *         empty when no route exists
     * @throws BadRequestException when origin and destination are the same point
     * @throws com.routeview.routing.RoutingException when the provider cannot deliver routes
     */
    public List<DetectedRoute> calculateRoutes(Coordinates origin, Coordinates destination) {
        return calculateRoutes(origin, destination, TravelMode.DEFAULT);
    }

    /**
     * Calculates the alternatives for one travel mode. Area detection runs on the geometry the provider returned
     * for that mode, never on another route.
     */
    public List<DetectedRoute> calculateRoutes(Coordinates origin, Coordinates destination, TravelMode travelMode) {
        return calculateRoutes(origin, destination, travelMode, TransitOptions.NONE);
    }

    /**
     * Calculates the alternatives for one travel mode. For Metro, only routes that really contain a metro ride
     * are kept (a walking-only or bus-only answer is not a metro journey) and each carries its
     * {@link MetroJourney}; area detection still runs on the geometry of the route, exactly as for other modes.
     */
    public List<DetectedRoute> calculateRoutes(Coordinates origin, Coordinates destination, TravelMode travelMode, TransitOptions options) {
        if (origin.equals(destination)) {
            throw new BadRequestException("Start and destination must be different locations.");
        }
        TransitOptions transitOptions = options == null ? TransitOptions.NONE : options;
        if (!transitOptions.isEmpty()) {
            if (!travelMode.acceptsTimeOptions()) {
                throw new BadRequestException("Departure time, arrival time and transit preferences only apply to Train, Metro and Bus.");
            }
            validateTimes(transitOptions);
        }
        if (travelMode == TravelMode.BUS) {
            return calculateBusRoutes(origin, destination, transitOptions);
        }
        List<RouteCandidate> candidates = routingProvider.computeRoutes(new RoutingRequest(origin, destination, travelMode, transitOptions));
        List<Route> routes = new ArrayList<>();
        for (RouteCandidate candidate : candidates) {
            MetroJourney metro = null;
            if (travelMode == TravelMode.METRO) {
                metro = metroJourneyService.journeyOf(candidate.transit()).orElse(null);
                if (metro == null) {
                    continue; // no metro ride: never presented as a metro journey
                }
            }
            routes.add(toRoute(routes.size(), candidate, metro));
        }
        return routes.stream().map(route -> new DetectedRoute(route, areaDetector.detectAreas(route))).toList();
    }

    /**
     * Bus journeys are planned from RouteView's own imported GTFS data; the routing provider is not asked. Area detection still
     * runs on the journey's geometry exactly as for every other mode: the bus stops themselves are never passing areas.
     */
    private List<DetectedRoute> calculateBusRoutes(Coordinates origin, Coordinates destination, TransitOptions options) {
        return planBus(origin, destination, options).routes();
    }

    /** The bus routes of a request plus, when there are none, why (so the app can say so in plain words). */
    public record BusPlan(List<DetectedRoute> routes, BusJourneyService.Reason reason) {
    }

    public BusPlan planBus(Coordinates origin, Coordinates destination, TransitOptions options) {
        if (origin.equals(destination)) {
            throw new BadRequestException("Start and destination must be different locations.");
        }
        TransitOptions transitOptions = options == null ? TransitOptions.NONE : options;
        if (!transitOptions.isEmpty()) {
            validateTimes(transitOptions);
        }
        if (transitOptions.arrivalTime() != null) {
            throw new BadRequestException("Bus journeys can be planned for a departure time, not for an arrival time.");
        }
        if (busJourneyService == null) {
            return new BusPlan(List.of(), BusJourneyService.Reason.NO_BUS_DATA);
        }
        BusJourneyService.Result result = busJourneyService.plan(origin, destination, transitOptions.departureTime(), transitOptions.preference());
        List<Route> routes = new ArrayList<>();
        for (BusJourneyService.Planned planned : result.journeys()) {
            routes.add(new Route(UUID.randomUUID().toString(), routes.size(), planned.distanceMeters(), planned.durationSeconds(), planned.encodedPolyline(),
                    busSummary(planned), null, List.of(), null, planned.journey()));
        }
        return new BusPlan(routes.stream().map(route -> new DetectedRoute(route, areaDetector.detectAreas(route))).toList(), result.reason());
    }

    private static String busSummary(BusJourneyService.Planned planned) {
        return planned.journey().segments().stream()
                .filter(segment -> segment.type() == com.routeview.bus.journey.BusJourney.SegmentType.BUS)
                .map(segment -> segment.route().name()).collect(java.util.stream.Collectors.joining(" \u2192 "));
    }

    private static void validateTimes(TransitOptions options) {
        Instant now = Instant.now();
        Instant requested = options.departureTime() != null ? options.departureTime() : options.arrivalTime();
        if (requested != null && (requested.isBefore(now.minus(Duration.ofMinutes(5))) || requested.isAfter(now.plus(MAX_SCHEDULE_AHEAD)))) {
            throw new BadRequestException("The time must be between now and " + MAX_SCHEDULE_AHEAD.toDays() + " days ahead.");
        }
    }

    private static Route toRoute(int index, RouteCandidate candidate, MetroJourney metro) {
        return new Route(
                UUID.randomUUID().toString(),
                index,
                candidate.distanceMeters(),
                candidate.durationSeconds(),
                candidate.encodedPolyline(),
                candidate.summary(),
                candidate.transit(),
                candidate.warnings(),
                metro);
    }
}
