package com.routeview.bus.journey;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.routeview.common.geo.Coordinates;
import com.routeview.routing.model.TransitOptions;

/**
 * Plans bus journeys from the imported GTFS data: nearby stops (PostGIS), a bounded search over the pattern graph, then real
 * scheduled trips for the few best candidates. The routing provider (Google) is not involved.
 */
@Service
public class BusJourneyService {

    private static final Logger log = LoggerFactory.getLogger(BusJourneyService.class);

    /** A journey with the overall geometry, distance and duration its Route needs. */
    public record Planned(BusJourney journey, String encodedPolyline, long distanceMeters, long durationSeconds) {
    }

    public enum Reason { NONE, NO_BUS_DATA, NO_STOP_NEAR_START, NO_STOP_NEAR_DESTINATION, NO_SERVICE, NO_JOURNEY }

    public record Result(List<Planned> journeys, Reason reason) {
        public Result {
            journeys = List.copyOf(journeys);
        }
    }

    private final BusNetworkProvider networkProvider;
    private final NearbyStopSource nearbyStops;
    private final BusTimetable timetable;
    private final BusJourneyProperties properties;

    @Autowired
    public BusJourneyService(BusNetworkProvider networkProvider, NearbyStopSource nearbyStops, BusTimetable timetable, BusJourneyProperties properties) {
        this.networkProvider = networkProvider;
        this.nearbyStops = nearbyStops;
        this.timetable = timetable;
        this.properties = properties;
    }

    /** @param departure when the person leaves (null = now) */
    public Result plan(Coordinates origin, Coordinates destination, Instant departure, TransitOptions.Preference preference) {
        BusNetwork network = networkProvider.current();
        if (network.isEmpty()) {
            return new Result(List.of(), Reason.NO_BUS_DATA);
        }
        ZonedDateTime start = (departure == null ? Instant.now() : departure).atZone(properties.zone());
        BusTimetable.ServiceDay today = timetable.serviceDay(start.toLocalDate());
        BusTimetable.ServiceDay yesterday = timetable.serviceDay(start.toLocalDate().minusDays(1));
        BitSet active = timetable.activePatterns(today, network);
        BusJourneyPlanner.Settings settings = settings(preference);

        List<BusNearbyStops.Selected> from = BusNearbyStops.select(network, nearbyStops, origin, active, settings, BusNearbyStops.Options.DEFAULT);
        if (from.isEmpty()) {
            return new Result(List.of(), Reason.NO_STOP_NEAR_START);
        }
        List<BusNearbyStops.Selected> to = BusNearbyStops.select(network, nearbyStops, destination, active, settings, BusNearbyStops.Options.DEFAULT);
        if (to.isEmpty()) {
            return new Result(List.of(), Reason.NO_STOP_NEAR_DESTINATION);
        }
        List<BusJourneyPlanner.Access> access = from.stream().map(s -> new BusJourneyPlanner.Access(s.stop(), s.walkSeconds())).toList();
        List<BusJourneyPlanner.Access> egress = to.stream().map(s -> new BusJourneyPlanner.Access(s.stop(), s.walkSeconds())).toList();

        List<String> notices = new ArrayList<>();
        if (today.unrestricted()) {
            notices.add("The dataset has no service calendar, so the days of operation are unknown.");
        }
        BusJourney.DatasetRef dataset = datasetRef(network);
        List<BusJourneyBuilder.Built> built = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<Integer> banned = new HashSet<>();
        boolean anyPlan = false;
        for (int attempt = 0; attempt < properties.maxAlternatives() && built.size() < properties.maxAlternatives(); attempt++) {
            List<BusJourneyPlanner.Plan> plans = BusJourneyPlanner.plan(network, access, egress, active, banned, settings);
            if (plans.isEmpty()) {
                break;
            }
            anyPlan = true;
            // The next attempt must avoid the first bus of the best journey found here, which gives a genuinely different alternative.
            Integer bannedRoute = null;
            for (BusJourneyPlanner.Plan plan : plans) {
                java.util.Optional<BusJourneyBuilder.Built> result = BusJourneyBuilder.build(network, timetable, plan, origin, destination, start, today, yesterday, settings, notices);
                if (result.isPresent()) {
                    if (bannedRoute == null) {
                        bannedRoute = network.routeIndexOf(plan.legs().get(0).pattern());
                    }
                    if (seen.add(key(result.get()))) {
                        built.add(result.get());
                    }
                }
            }
            if (bannedRoute == null) {
                bannedRoute = network.routeIndexOf(plans.get(0).legs().get(0).pattern());
            }
            banned.add(bannedRoute);
        }
        if (built.isEmpty()) {
            return new Result(List.of(), anyPlan ? Reason.NO_SERVICE : Reason.NO_JOURNEY);
        }
        built.sort(Comparator.comparing((BusJourneyBuilder.Built b) -> b.journey().arrivalTime()).thenComparingInt(b -> b.journey().transfers())
                .thenComparingLong(b -> b.journey().walkingSeconds()));
        List<Planned> out = built.stream().limit(properties.maxAlternatives())
                .map(b -> new Planned(b.journey().withDataset(dataset), b.encodedPolyline(), b.distanceMeters(), b.durationSeconds())).toList();
        log.debug("Bus journeys planned: {} from {} start stops and {} end stops", out.size(), from.size(), to.size());
        return new Result(out, Reason.NONE);
    }

    /** The bounded list of stops the engine would start from near a point. */
    public List<NearbyStop> nearby(Coordinates point, Instant at) {
        BusNetwork network = networkProvider.current();
        if (network.isEmpty()) {
            return List.of();
        }
        BusTimetable.ServiceDay day = timetable.serviceDay((at == null ? Instant.now() : at).atZone(properties.zone()).toLocalDate());
        BitSet active = timetable.activePatterns(day, network);
        return BusNearbyStops.select(network, nearbyStops, point, active, BusJourneyPlanner.Settings.DEFAULT, BusNearbyStops.Options.DEFAULT).stream()
                .map(s -> new NearbyStop(network.stop(s.stop()).id(), network.stop(s.stop()).externalId(), network.stop(s.stop()).name(),
                        network.stop(s.stop()).latitude(), network.stop(s.stop()).longitude(), Math.round(s.meters()), s.servingPatterns()))
                .toList();
    }

    public record NearbyStop(java.util.UUID stopId, String gtfsId, String name, double latitude, double longitude, long distanceMeters, int routeCount) {
    }

    private static BusJourneyPlanner.Settings settings(TransitOptions.Preference preference) {
        BusJourneyPlanner.Settings d = BusJourneyPlanner.Settings.DEFAULT;
        if (preference == TransitOptions.Preference.FEWER_TRANSFERS) {
            return new BusJourneyPlanner.Settings(d.maxLegs(), 900, d.walkWeight(), d.transferRadiusMeters(), d.walkSpeedMetersPerSecond(), d.detourFactor(),
                    d.minimumSavingPerExtraLegSeconds());
        }
        if (preference == TransitOptions.Preference.LESS_WALKING) {
            return new BusJourneyPlanner.Settings(d.maxLegs(), d.boardingPenaltySeconds(), 3.0, d.transferRadiusMeters(), d.walkSpeedMetersPerSecond(),
                    d.detourFactor(), d.minimumSavingPerExtraLegSeconds());
        }
        return d;
    }

    private static String key(BusJourneyBuilder.Built built) {
        StringBuilder key = new StringBuilder();
        for (BusJourney.Segment s : built.journey().segments()) {
            if (s.type() == BusJourney.SegmentType.BUS) {
                key.append(s.route().routeId()).append('@').append(s.boarding().stopId()).append('>').append(s.exit().stopId()).append(';');
            }
        }
        return key.toString();
    }

    private static BusJourney.DatasetRef datasetRef(BusNetwork network) {
        BusNetwork.DatasetInfo d = network.dataset();
        return d == null ? null : new BusJourney.DatasetRef(d.source(), d.sourceVersion(), d.sourceUpdatedAt(), d.importedAt(), d.servicePeriodStart(),
                d.servicePeriodEnd(), d.operatingDays());
    }
}
