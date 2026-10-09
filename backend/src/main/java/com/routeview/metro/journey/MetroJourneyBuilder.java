package com.routeview.metro.journey;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.routeview.metro.ingest.MetroNameNormalizer;
import com.routeview.metro.journey.MetroJourney.DatasetRef;
import com.routeview.metro.journey.MetroJourney.Fare;
import com.routeview.metro.journey.MetroJourney.LineRef;
import com.routeview.metro.journey.MetroJourney.Segment;
import com.routeview.metro.journey.MetroJourney.SegmentType;
import com.routeview.metro.journey.MetroJourney.StationRef;
import com.routeview.metro.journey.MetroJourney.StationRole;
import com.routeview.metro.journey.MetroJourney.WalkRole;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;
import com.routeview.routing.model.TransitInfo;
import com.routeview.routing.model.TransitInfo.TransitStep;

/**
 * Turns what the routing provider reported for a transit route into a {@link MetroJourney}: ordered segments,
 * stations, transfers, first / last-mile walking. The provider supplies the facts (stops, lines, times, stop
 * counts, fare); the metro dataset only adds station identity and the stations between boarding and exit, and
 * only when they can be verified against the provider's stop count. Nothing is estimated or invented.
 */
public final class MetroJourneyBuilder {

    /** Google vehicle types that are metro. Anything else is shown honestly as other transit. */
    private static final Set<String> METRO_VEHICLES = Set.of("SUBWAY", "METRO_RAIL");

    private MetroJourneyBuilder() {
    }

    public static boolean isMetroRide(TransitStep step) {
        return step.kind() == TransitStep.Kind.RIDE && METRO_VEHICLES.contains(step.vehicleType().toUpperCase());
    }

    /** True when the route contains at least one metro ride, i.e. it can honestly be presented as a metro journey. */
    public static boolean hasMetroRide(TransitInfo transit) {
        return transit != null && transit.steps().stream().anyMatch(MetroJourneyBuilder::isMetroRide);
    }

    public static Optional<MetroJourney> build(TransitInfo transit, MetroNetwork network) {
        if (!hasMetroRide(transit)) {
            return Optional.empty();
        }
        List<Segment> segments = new ArrayList<>();
        long walkMeters = 0;
        long walkSeconds = 0;
        long pendingMeters = 0;
        long pendingSeconds = 0;
        boolean pendingWalk = false;
        Segment previousRide = null;
        boolean matchedAny = false;
        int sameLineContinuations = 0;

        for (TransitStep step : transit.steps()) {
            if (step.kind() == TransitStep.Kind.WALK) {
                pendingMeters += step.distanceMeters();
                pendingSeconds += step.durationSeconds();
                walkMeters += step.distanceMeters();
                walkSeconds += step.durationSeconds();
                pendingWalk = true;
                continue;
            }
            Segment ride = ride(step, network);
            matchedAny |= ride.boarding().stationId() != null || ride.exit().stationId() != null;
            if (previousRide == null) {
                if (pendingWalk && (pendingMeters > 0 || pendingSeconds > 0)) {
                    segments.add(walk(WalkRole.FIRST_MILE, pendingMeters, pendingSeconds));
                }
            } else {
                boolean walked = pendingWalk && (pendingMeters > 0 || pendingSeconds > 0);
                if (continuesSameLine(previousRide, ride, walked)) {
                    // Two services of ONE logical line at the same station (Blue main -> Vaishali branch) are not an interchange.
                    sameLineContinuations++;
                } else {
                    segments.add(transfer(previousRide, ride, walked ? pendingMeters : null, walked ? pendingSeconds : null));
                }
            }
            pendingMeters = 0;
            pendingSeconds = 0;
            pendingWalk = false;
            segments.add(ride);
            previousRide = ride;
        }
        if (previousRide != null && pendingWalk && (pendingMeters > 0 || pendingSeconds > 0)) {
            segments.add(walk(WalkRole.LAST_MILE, pendingMeters, pendingSeconds));
        }

        List<Segment> rides = segments.stream().filter(s -> s.type() == SegmentType.METRO || s.type() == SegmentType.TRANSIT).toList();
        List<Segment> metroRides = rides.stream().filter(s -> s.type() == SegmentType.METRO).toList();
        int transfers = (int) segments.stream().filter(s -> s.type() == SegmentType.TRANSFER).count();
        Integer travelledStops = metroRides.stream().allMatch(s -> s.stopCount() > 0) ? metroRides.stream().mapToInt(Segment::stopCount).sum() : null;
        boolean verified = metroRides.stream().allMatch(s -> s.intermediateStations() != null);
        List<StationRef> stationList = stationsInOrder(segments);
        // Stations listed are known only when every metro ride's stations were verified; the segments travelled come from the provider.
        Integer stationCount = verified && !metroRides.isEmpty() ? listedMetroStations(metroRides) : null;

        List<String> notices = new ArrayList<>();
        if (rides.size() > metroRides.size()) {
            notices.add("This journey also uses other public transport besides the metro.");
        }
        if (network.isEmpty()) {
            notices.add("Metro network data is not available on the server, so station details come from the routing provider only.");
        } else if (!verified) {
            notices.add("Some stations along the way could not be confirmed with the metro data, so only boarding and exit stations are listed for them.");
        }
        if (sameLineContinuations > 0) {
            notices.add("The journey continues on the same metro line (a different branch), which is not counted as a change of line.");
        }
        DatasetRef dataset = matchedAny && network.dataset() != null
                ? new DatasetRef(network.dataset().source(), network.dataset().sourceVersion(), network.dataset().sourceUpdatedAt(), network.dataset().importedAt(),
                        network.dataset().servicePeriod() == null ? null : network.dataset().servicePeriod().start(),
                        network.dataset().servicePeriod() == null ? null : network.dataset().servicePeriod().end(),
                        network.dataset().servicePeriod() == null ? List.of() : network.dataset().servicePeriod().operatingDays())
                : null;
        Fare fare = transit.fare() == null ? null : new Fare(transit.fare().currency(), transit.fare().amount());
        return Optional.of(new MetroJourney(fare, transfers, stationCount, travelledStops, walkMeters, walkSeconds, transit.departureTime(), transit.arrivalTime(),
                verified, segments, stationList, dataset, notices));
    }

    // ------------------------------------------------------------------ segments

    /** Distinct stations listed for the metro rides: boarding, intermediate and exit stations, each once (other transit is not counted). */
    private static int listedMetroStations(List<Segment> metroRides) {
        Set<String> keys = new java.util.LinkedHashSet<>();
        for (Segment ride : metroRides) {
            List<StationRef> all = new ArrayList<>();
            all.add(ride.boarding());
            if (ride.intermediateStations() != null) all.addAll(ride.intermediateStations());
            all.add(ride.exit());
            for (StationRef station : all) {
                keys.add(station.stationId() != null ? station.stationId().toString() : "name:" + MetroNameNormalizer.key(station.name()));
            }
        }
        return keys.size();
    }

    /** Consecutive metro rides on the same logical line (by dataset group id), at the same matched station, with no walk between. */
    private static boolean continuesSameLine(Segment from, Segment to, boolean walked) {
        if (walked || from.type() != SegmentType.METRO || to.type() != SegmentType.METRO) return false;
        if (from.line().groupId() == null || !from.line().groupId().equals(to.line().groupId())) return false;
        return from.exit().stationId() != null && from.exit().stationId().equals(to.boarding().stationId());
    }

    private static Segment walk(WalkRole role, long meters, long seconds) {
        return new Segment(SegmentType.WALK, role, meters, seconds, null, null, null, null, 0, null, null, null, null, null, null, null, null, null);
    }

    private static Segment transfer(Segment from, Segment to, Long walkMeters, Long walkSeconds) {
        StationRef station = from.exit();
        boolean sameStation = station.stationId() != null && station.stationId().equals(to.boarding().stationId())
                || MetroNameNormalizer.key(station.name()).equals(MetroNameNormalizer.key(to.boarding().name()));
        StationRef interchange = withRole(station, StationRole.INTERCHANGE);
        if (sameStation) { // the interchange lists the line it is left on and the line it is joined on
            List<LineRef> both = new ArrayList<>(station.lines());
            for (LineRef joined : to.boarding().lines()) {
                if (both.stream().noneMatch(l -> l.groupId() != null && l.groupId().equals(joined.groupId()))) both.add(joined);
            }
            interchange = new StationRef(station.stationId(), station.name(), station.latitude(), station.longitude(), StationRole.INTERCHANGE, both, station.interchange(), station.accessibility());
        }
        return new Segment(SegmentType.TRANSFER, null, walkMeters == null ? 0 : walkMeters, walkSeconds == null ? 0 : walkSeconds, null, null, null, null, 0, null, null, null,
                interchange, sameStation ? null : withRole(to.boarding(), StationRole.INTERCHANGE),
                from.line(), to.line(), walkMeters, walkSeconds);
    }

    private static Segment ride(TransitStep step, MetroNetwork network) {
        Optional<MetroStation> boardMatch = MetroStationMatcher.find(network, step.departureStop(), step.departureLatitude(), step.departureLongitude());
        Optional<MetroStation> exitMatch = MetroStationMatcher.find(network, step.arrivalStop(), step.arrivalLatitude(), step.arrivalLongitude());
        boolean metro = isMetroRide(step);

        LineRef line = new LineRef(null, null, step.lineName(), step.lineShortName(), step.lineColor().isEmpty() ? null : step.lineColor(), step.vehicleType(), null);
        List<MetroNetwork.LineGroup> usedGroups = List.of();
        List<StationRef> between = null;
        if (metro) {
            if (step.stopCount() == 1) {
                between = List.of(); // adjacent stations: nothing lies between them
            }
            Set<UUID> candidates = candidateServices(network, step.lineName());
            Set<UUID> candidateGroups = new java.util.LinkedHashSet<>();
            candidates.forEach(id -> candidateGroups.add(network.line(id).groupId()));
            if (candidateGroups.size() == 1) { // the provider's line is one logical line of the dataset, even when its path is unknown
                MetroNetwork.LineGroup group = network.group(candidateGroups.iterator().next());
                usedGroups = List.of(group);
                line = lineOfGroup(line, group, null);
            }
            if (boardMatch.isPresent() && exitMatch.isPresent() && step.stopCount() > 0) {
                Path path = reconstruct(network, boardMatch.get(), exitMatch.get(), candidates, step.stopCount());
                if (path != null) {
                    between = path.stations.subList(1, path.stations.size() - 1).stream()
                            .map(id -> stationRef(network, network.station(id), "", null, null, StationRole.INTERMEDIATE, usedGroups(network, path.services))).toList();
                    usedGroups = groupsOf(network, path.services);
                    line = lineOfGroup(line, usedGroups.get(0), path.services.size() == 1 ? path.services.get(0) : null);
                }
            }
        }
        StationRef boarding = stationRef(network, boardMatch.orElse(null), step.departureStop(), step.departureLatitude(), step.departureLongitude(), StationRole.BOARDING, usedGroups);
        StationRef exit = stationRef(network, exitMatch.orElse(null), step.arrivalStop(), step.arrivalLatitude(), step.arrivalLongitude(), StationRole.EXIT, usedGroups);
        if (between != null && !usedGroups.isEmpty()) {
            final List<MetroNetwork.LineGroup> used = usedGroups;
            between = between.stream().map(r -> new StationRef(r.stationId(), r.name(), r.latitude(), r.longitude(), r.role(), linesOf(used), r.interchange(), r.accessibility())).toList();
        }
        // The provider's heading is the only reliable direction: the dataset has no headsign / direction, and the last station of a
        // pattern is not a heading (a pattern runs both ways).
        return new Segment(metro ? SegmentType.METRO : SegmentType.TRANSIT, null, step.distanceMeters(), step.durationSeconds(), line, step.headsign().isEmpty() ? null : step.headsign(),
                boarding, exit, step.stopCount(), between, blankToNull(step.departureTime()), blankToNull(step.arrivalTime()), null, null, null, null, null, null);
    }

    /** A reconstructed ride: the stations from boarding to exit (both included) and the services that run along all of it. */
    private record Path(List<UUID> stations, List<UUID> services) {
    }

    /**
     * Rebuilds the stations of a ride from the dataset's connections: every distinct station sequence from boarding to exit that
     * stays on the candidate services and whose length agrees with the provider's stop count. A shared trunk is therefore
     * represented once, whatever number of services run on it. When more than one DIFFERENT sequence remains, nothing is
     * guessed and null is returned (the stations are then not listed); one sequence is never discarded in favour of another.
     */
    private static Path reconstruct(MetroNetwork network, MetroStation boarding, MetroStation exit, Set<UUID> candidates, int stopCount) {
        List<List<UUID>> paths = network.paths(boarding.id(), exit.id(), candidates, stopCount, 8).stream()
                .filter(p -> p.size() - 1 == stopCount).toList();
        if (paths.size() != 1) {
            return null;
        }
        List<UUID> stations = paths.get(0);
        List<MetroLine> services = network.servicesOnPath(stations, candidates);
        if (services.isEmpty()) { // a path that no single service covers end to end (a change of branch inside one logical line)
            Set<UUID> groups = new java.util.LinkedHashSet<>();
            for (int i = 0; i + 1 < stations.size(); i++) {
                List<MetroLine> edge = network.servicesOnPath(List.of(stations.get(i), stations.get(i + 1)), candidates);
                if (edge.isEmpty()) return null;
                edge.forEach(l -> groups.add(l.groupId()));
            }
            if (groups.size() != 1) return null;
            services = network.lines().stream().filter(l -> groups.contains(l.groupId()) && candidates.contains(l.id())).toList();
        }
        return new Path(stations, services.stream().map(MetroLine::id).toList());
    }

    /** The dataset services whose logical line carries the provider's line name. All services when none does. */
    private static Set<UUID> candidateServices(MetroNetwork network, String providerLineName) {
        String wanted = MetroNameNormalizer.key(providerLineName);
        Set<UUID> byName = new java.util.LinkedHashSet<>();
        if (!wanted.isEmpty()) {
            for (MetroLine line : network.lines()) {
                String group = MetroNameNormalizer.key(line.groupName());
                String own = MetroNameNormalizer.key(line.name());
                if ((!group.isEmpty() && (group.contains(wanted) || wanted.contains(group))) || (!own.isEmpty() && (own.contains(wanted) || wanted.contains(own)))) {
                    byName.add(line.id());
                }
            }
        }
        if (!byName.isEmpty()) {
            return byName;
        }
        Set<UUID> all = new java.util.LinkedHashSet<>();
        network.lines().forEach(l -> all.add(l.id()));
        return all;
    }

    private static List<MetroNetwork.LineGroup> groupsOf(MetroNetwork network, List<UUID> services) {
        Set<UUID> groupIds = new java.util.LinkedHashSet<>();
        services.forEach(id -> groupIds.add(network.line(id).groupId()));
        return groupIds.stream().map(network::group).toList();
    }

    private static List<MetroNetwork.LineGroup> usedGroups(MetroNetwork network, List<UUID> services) {
        return groupsOf(network, services);
    }

    /** A line as shown for a ride: the provider's wording wins, the dataset adds identity. */
    private static LineRef lineOfGroup(LineRef provider, MetroNetwork.LineGroup group, UUID serviceId) {
        MetroLine service = serviceId == null ? null : group.services().stream().filter(l -> l.id().equals(serviceId)).findFirst().orElse(null);
        String name = provider.name().isEmpty() ? group.name() : provider.name();
        String shortName = provider.shortName().isEmpty() ? (service != null && service.shortName() != null ? service.shortName() : "") : provider.shortName();
        String color = provider.color() != null ? provider.color() : group.color();
        return new LineRef(serviceId, group.id(), name, shortName, color, provider.vehicleType(), service == null ? null : service.branchName());
    }

    // ------------------------------------------------------------------ stations

    /** One entry per logical line, so a service pair that shares a display name (Blue main + Vaishali) is listed once. */
    private static List<LineRef> linesOf(List<MetroNetwork.LineGroup> groups) {
        return groups.stream().map(g -> new LineRef(g.services().size() == 1 ? g.services().get(0).id() : null, g.id(), g.name(),
                g.services().size() == 1 && g.services().get(0).shortName() != null ? g.services().get(0).shortName() : "", g.color(), "SUBWAY",
                g.services().size() == 1 ? g.services().get(0).branchName() : null)).toList();
    }

    /**
     * A station of the journey. {@code used} are the logical lines the journey uses here: only those are listed (a station where
     * the journey rides the Yellow Line does not also list Rapid Metro). Without any, every line serving the station is listed.
     */
    private static StationRef stationRef(MetroNetwork network, MetroStation station, String providerName, Double lat, Double lon, StationRole role, List<MetroNetwork.LineGroup> used) {
        if (station == null) {
            return new StationRef(null, providerName, lat, lon, role, List.of(), false);
        }
        List<MetroNetwork.LineGroup> serving = network.groupsOf(station.id());
        List<MetroNetwork.LineGroup> shown = used.isEmpty() ? serving
                : serving.stream().filter(g -> used.stream().anyMatch(u -> u.id().equals(g.id()))).toList();
        if (shown.isEmpty()) {
            shown = serving;
        }
        return new StationRef(station.id(), station.name(), station.latitude(), station.longitude(), role, linesOf(shown), serving.size() >= 2, station.accessibility());
    }

    private static StationRef withRole(StationRef ref, StationRole role) {
        return new StationRef(ref.stationId(), ref.name(), ref.latitude(), ref.longitude(), role, ref.lines(), ref.interchange(), ref.accessibility());
    }

    /** All stations of the journey in travel order with their role. Unverifiable stretches contribute only their ends. */
    private static List<StationRef> stationsInOrder(List<Segment> segments) {
        List<StationRef> stations = new ArrayList<>();
        for (int index = 0; index < segments.size(); index++) {
            Segment segment = segments.get(index);
            if (segment.type() != SegmentType.METRO && segment.type() != SegmentType.TRANSIT) {
                if (segment.type() == SegmentType.TRANSFER && segment.transferToStation() != null) {
                    stations.add(segment.transferToStation());
                }
                continue;
            }
            if (stations.isEmpty()) {
                stations.add(withRole(segment.boarding(), StationRole.BOARDING));
            }
            if (segment.intermediateStations() != null) {
                stations.addAll(segment.intermediateStations());
            }
            boolean changesNext = index + 1 < segments.size() && segments.get(index + 1).type() == SegmentType.TRANSFER;
            boolean continuesNext = index + 1 < segments.size() && (segments.get(index + 1).type() == SegmentType.METRO || segments.get(index + 1).type() == SegmentType.TRANSIT);
            stations.add(changesNext ? segments.get(index + 1).transferStation()
                    : withRole(segment.exit(), continuesNext ? StationRole.INTERMEDIATE : StationRole.EXIT));
        }
        return stations;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
