package com.routeview.metro.controller;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.repository.MetroNetworkProvider;
import com.routeview.route.dto.RouteRequest;
import com.routeview.route.dto.RouteResponse;
import com.routeview.route.service.RouteService;
import com.routeview.routing.model.TravelMode;

/**
 * Metro API: the static network (for the map and station information) and metro journeys. Journeys are the
 * same {@code RouteResponse} as {@code /api/routes} with {@code travelMode = METRO}, so the same Route Session,
 * area detection and error handling apply. There is deliberately no import endpoint: importing is a command.
 */
@RestController
@RequestMapping("/api/metro")
public class MetroController {

    private final MetroNetworkProvider networkProvider;
    private final RouteService routeService;

    public MetroController(MetroNetworkProvider networkProvider, RouteService routeService) {
        this.networkProvider = networkProvider;
        this.routeService = routeService;
    }

    /** Stations only (id, name, position, lines): for station search and detail. */
    @GetMapping("/stations")
    public StationsResponse stations() {
        MetroNetwork network = networkProvider.current();
        return new StationsResponse(DatasetDto.of(network), MetroNetworkDto.stationsOf(network));
    }

    /** Stations, lines and the ordered stations of each line (patterns): for drawing the network. */
    @GetMapping("/network")
    public MetroNetworkDto network() {
        return MetroNetworkDto.of(networkProvider.current());
    }

    /** A metro journey between two places; the travel mode of the body is ignored: this is always Metro. */
    @PostMapping("/journey")
    public RouteResponse journey(@Valid @RequestBody RouteRequest request) {
        return RouteResponse.from(routeService.calculateRoutes(
                request.origin().toCoordinates(), request.destination().toCoordinates(), TravelMode.METRO, request.transitOptions()));
    }

    /** Routing problems of {@code /api/metro/journey} are reported exactly like those of {@code /api/routes}. */
    @org.springframework.web.bind.annotation.ExceptionHandler(com.routeview.routing.RoutingException.class)
    public org.springframework.http.ProblemDetail handleRoutingFailure(com.routeview.routing.RoutingException ex) {
        return com.routeview.route.controller.RoutingFailureResponses.toProblem(ex);
    }

    /** {@code servicePeriodStart/End} and {@code operatingDays} are what the dataset's own calendar states; null / empty when it has none. */
    public record DatasetDto(String source, String sourceVersion, LocalDate sourceUpdatedAt, Instant importedAt, boolean available,
                             LocalDate servicePeriodStart, LocalDate servicePeriodEnd, List<String> operatingDays) {
        static DatasetDto of(MetroNetwork network) {
            if (network.dataset() == null) {
                return new DatasetDto(null, null, null, null, false, null, null, List.of());
            }
            var period = network.dataset().servicePeriod();
            return new DatasetDto(network.dataset().source(), network.dataset().sourceVersion(), network.dataset().sourceUpdatedAt(), network.dataset().importedAt(), true,
                    period == null ? null : period.start(), period == null ? null : period.end(), period == null ? List.of() : period.operatingDays());
        }
    }

    public record StationsResponse(DatasetDto dataset, List<MetroNetworkDto.StationDto> stations) {
    }

    /**
     * Line colours are only shown when the dataset provides them. {@code geometry} is "GTFS_SHAPES" when the dataset's shapes are
     * included per service, otherwise "STATION_SEQUENCE" (ordered station-to-station connections). A line here is a SERVICE
     * (GTFS route); {@code groupId} ties the services of one logical line together (Blue Line main + Vaishali).
     */
    public record MetroNetworkDto(DatasetDto dataset, String geometry, List<StationDto> stations, List<LineDto> lines) {

        public record StationDto(UUID id, String name, double latitude, double longitude, List<UUID> lineIds, List<UUID> groupIds, boolean interchange) {
        }

        public record PatternDto(String pattern, String toward, List<UUID> stationIds) {
        }

        public record ShapeDto(String id, List<double[]> points) {
        }

        public record LineDto(UUID id, String name, String shortName, String color, UUID groupId, String groupName, String branch,
                              List<PatternDto> patterns, List<ShapeDto> shapes) {
        }

        static List<StationDto> stationsOf(MetroNetwork network) {
            return network.stations().stream()
                    .sorted(Comparator.comparing(com.routeview.metro.model.MetroStation::name).thenComparing(s -> s.id().toString()))
                    .map(station -> new StationDto(station.id(), station.name(), station.latitude(), station.longitude(),
                            network.linesOf(station.id()).stream().map(com.routeview.metro.model.MetroLine::id).toList(),
                            network.groupsOf(station.id()).stream().map(MetroNetwork.LineGroup::id).toList(), network.isInterchange(station.id())))
                    .toList();
        }

        static MetroNetworkDto of(MetroNetwork network) {
            List<LineDto> lines = network.lines().stream()
                    .sorted(Comparator.comparing(com.routeview.metro.model.MetroLine::name).thenComparing(l -> l.id().toString()))
                    .map(line -> new LineDto(line.id(), line.name(), line.shortName(), line.displayColor(), line.groupId(), line.groupName(), line.branchName(),
                            network.patterns().stream().filter(p -> p.line().id().equals(line.id()))
                                    .map(p -> new PatternDto(p.pattern(), p.toward(), p.stationIds())).toList(),
                            network.shapesOf(line.id()).stream().map(shape -> new ShapeDto(shape.externalId(), shape.points())).toList()))
                    .toList();
            // The dataset's shapes are the static geometry when it has them; otherwise lines are ordered station-to-station connections.
            return new MetroNetworkDto(DatasetDto.of(network), network.shapes().isEmpty() ? "STATION_SEQUENCE" : "GTFS_SHAPES", stationsOf(network), lines);
        }
    }
}
