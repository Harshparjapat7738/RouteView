package com.routeview.bus.journey;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.routeview.bus.journey.BusJourney.HeadsignSource;
import com.routeview.bus.journey.BusJourney.RouteRef;
import com.routeview.bus.journey.BusJourney.Segment;
import com.routeview.bus.journey.BusJourney.SegmentType;
import com.routeview.bus.journey.BusJourney.StopRef;
import com.routeview.bus.journey.BusJourney.StopRole;
import com.routeview.bus.journey.BusJourney.WalkRole;
import com.routeview.bus.journey.BusTimetable.TimedStop;
import com.routeview.bus.journey.BusTimetable.TripRun;
import com.routeview.common.geo.Coordinates;
import com.routeview.common.geo.GeoMath;
import com.routeview.common.geo.PolylineEncoder;

/**
 * Phase two: turns a ranked {@link BusJourneyPlanner.Plan} into a real, scheduled journey. For every ride it looks up the first
 * trip that leaves the boarding stop after the rider could be there, keeps that trip's REAL ordered stops, and chains the next
 * ride after the arrival plus the walk and a short buffer. Whatever cannot be scheduled (no trip left today, an unreasonable
 * wait, stop lists that do not match the pattern) makes the plan unusable; nothing is guessed.
 */
public final class BusJourneyBuilder {

    /** Longest wait for a scheduled departure that is still presented as a practical journey. */
    public static final int MAX_WAIT_SECONDS = 90 * 60;
    /** Time to get from one bus to the next at the same or a nearby stop. */
    public static final int TRANSFER_BUFFER_SECONDS = 60;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    private BusJourneyBuilder() {
    }

    /** A built journey with its geometry as {latitude, longitude} points, for the route's overall polyline. */
    public record Built(BusJourney journey, List<double[]> points, long distanceMeters, long durationSeconds) {
        public String encodedPolyline() {
            return PolylineEncoder.encode(points);
        }
    }

    private record Ride(BusJourneyPlanner.Leg leg, BusNetwork.Pattern pattern, TripRun run, List<TimedStop> called, long boardAbs, long alightAbs,
                        long waitSeconds, List<double[]> points, boolean fromShape) {
    }

    public static Optional<Built> build(BusNetwork network, BusTimetable timetable, BusJourneyPlanner.Plan plan, Coordinates origin, Coordinates destination,
                                        ZonedDateTime departure, BusTimetable.ServiceDay today, BusTimetable.ServiceDay yesterday,
                                        BusJourneyPlanner.Settings walking, List<String> baseNotices) {
        ZoneId zone = departure.getZone();
        ZonedDateTime dayStart = departure.toLocalDate().atStartOfDay(zone);
        long departAbs = departure.toEpochSecond() - dayStart.toEpochSecond(); // seconds since the start of the service day
        long ready = departAbs + plan.access().walkSeconds();

        // ---- schedule every ride
        List<Ride> rides = new ArrayList<>();
        for (int i = 0; i < plan.legs().size(); i++) {
            BusJourneyPlanner.Leg leg = plan.legs().get(i);
            BusNetwork.Pattern pattern = network.patterns().get(leg.pattern());
            BusNetwork.Stop boardStop = network.stop(pattern.stops()[leg.boardPos()]);
            BusNetwork.Stop alightStop = network.stop(pattern.stops()[leg.alightPos()]);
            Optional<TripRun> found = timetable.nextTrip(pattern.id(), boardStop.id(), leg.boardPos(), today, yesterday, (int) Math.min(Integer.MAX_VALUE, ready));
            if (found.isEmpty()) {
                return Optional.empty();
            }
            TripRun run = found.get();
            if (!matches(run, network, pattern)) {
                return Optional.empty(); // the trip's stops are not the pattern's: never mix them up
            }
            TimedStop board = run.stops().get(leg.boardPos());
            TimedStop alight = run.stops().get(leg.alightPos());
            Integer boardTime = board.departureSeconds() != null ? board.departureSeconds() : board.arrivalSeconds();
            Integer alightTime = alight.arrivalSeconds() != null ? alight.arrivalSeconds() : alight.departureSeconds();
            if (boardTime == null || alightTime == null) {
                return Optional.empty();
            }
            long boardAbs = run.dayOffsetSeconds() + boardTime;
            long alightAbs = run.dayOffsetSeconds() + alightTime;
            long wait = boardAbs - ready;
            if (wait < 0 || wait > MAX_WAIT_SECONDS || alightAbs < boardAbs) {
                return Optional.empty();
            }
            List<TimedStop> called = run.stops().subList(leg.boardPos(), leg.alightPos() + 1);
            double[] boardPoint = {boardStop.latitude(), boardStop.longitude()};
            double[] alightPoint = {alightStop.latitude(), alightStop.longitude()};
            List<double[]> points = null;
            boolean fromShape = false;
            if (run.shapeId() != null) {
                Optional<List<double[]>> shape = timetable.shape(run.shapeId());
                Optional<List<double[]>> cut = shape.flatMap(s -> ShapeSlicer.slice(s, boardPoint, alightPoint));
                if (cut.isPresent()) {
                    points = cut.get();
                    fromShape = true;
                }
            }
            if (points == null) {
                points = new ArrayList<>();
                for (TimedStop stop : called) {
                    BusNetwork.Stop s = network.stop(network.stopIndexOf(stop.stopId()));
                    points.add(new double[]{s.latitude(), s.longitude()});
                }
            }
            rides.add(new Ride(leg, pattern, run, called, boardAbs, alightAbs, wait, points, fromShape));
            if (i + 1 < plan.legs().size()) {
                BusJourneyPlanner.Leg next = plan.legs().get(i + 1);
                BusNetwork.Stop nextBoard = network.stop(network.patterns().get(next.pattern()).stops()[next.boardPos()]);
                ready = alightAbs + walkSeconds(alightStop, nextBoard, walking) + TRANSFER_BUFFER_SECONDS;
            }
        }

        // ---- assemble
        List<String> notices = new ArrayList<>(baseNotices);
        List<Segment> segments = new ArrayList<>();
        List<double[]> overall = new ArrayList<>();
        long walkingMeters = 0;
        long walkingSeconds = 0;
        long rideSeconds = 0;
        long waitSeconds = 0;
        long busMeters = 0;
        int stopToStop = 0;
        boolean anyShape = false;
        boolean allShape = true;

        Ride first = rides.get(0);
        BusNetwork.Stop firstStop = stopOf(network, first, true);
        Segment firstMile = walk(WalkRole.FIRST_MILE, origin.latitude(), origin.longitude(), firstStop.latitude(), firstStop.longitude(), plan.access().walkSeconds(), walking);
        addWalk(segments, overall, firstMile);
        walkingMeters += firstMile.distanceMeters();
        walkingSeconds += firstMile.durationSeconds();

        List<StopRef> journeyStops = new ArrayList<>();
        for (int i = 0; i < rides.size(); i++) {
            Ride ride = rides.get(i);
            RouteRef route = routeRef(network, ride.pattern());
            List<StopRef> stops = rideStops(network, ride.called());
            Segment bus = busSegment(network, ride, route, stops, dayStart);
            Segment previous = segments.get(segments.size() - 1);
            // The same route straight after the same route at the same stop is one service, not a transfer.
            if (previous.type() == SegmentType.BUS && previous.route().routeId().equals(route.routeId())
                    && previous.exit().stopId().equals(stops.get(0).stopId())) {
                segments.set(segments.size() - 1, merge(previous, bus));
                append(overall, ride.points());
                notices.add("Continues on the same route: this is not a transfer.");
                stopToStop += stops.size() - 1;
                busMeters += lengthMeters(ride.points());
                rideSeconds += ride.alightAbs() - ride.boardAbs();
                waitSeconds += ride.waitSeconds();
                journeyStops.set(journeyStops.size() - 1, withRole(journeyStops.get(journeyStops.size() - 1), StopRole.INTERMEDIATE));
                journeyStops.addAll(stops.subList(1, stops.size()));
                anyShape |= ride.fromShape();
                allShape &= ride.fromShape();
                continue;
            }
            boolean routeChanged = false;
            if (i > 0) {
                Ride before = rides.get(i - 1);
                BusNetwork.Stop exitStop = stopOf(network, before, false);
                BusNetwork.Stop boardStop = stopOf(network, ride, true);
                RouteRef fromRoute = routeRef(network, before.pattern());
                routeChanged = !fromRoute.routeId().equals(route.routeId());
                boolean sameStop = exitStop.id().equals(boardStop.id());
                double straight = GeoMath.haversineMeters(exitStop.latitude(), exitStop.longitude(), boardStop.latitude(), boardStop.longitude());
                long meters = sameStop ? 0 : Math.round(straight * walking.detourFactor());
                long seconds = sameStop ? 0 : walking.walkSeconds(straight);
                List<double[]> walkPoints = sameStop ? List.of() : List.of(
                        new double[]{exitStop.latitude(), exitStop.longitude()}, new double[]{boardStop.latitude(), boardStop.longitude()});
                if (routeChanged) {
                    segments.add(new Segment(SegmentType.TRANSFER, null, meters, seconds, null, null, null, null, null, null, null, null, List.of(), 0, 0,
                            null, null, 0, stopRef(exitStop, StopRole.TRANSFER), fromRoute, route,
                            walkPoints.isEmpty() ? null : PolylineEncoder.encode(walkPoints), walkPoints.isEmpty() ? null : "ESTIMATED_STRAIGHT_LINE", !walkPoints.isEmpty()));
                } else if (!sameStop) {
                    segments.add(walkSegment(null, meters, seconds, walkPoints));
                }
                if (!sameStop) {
                    append(overall, walkPoints);
                    walkingMeters += meters;
                    walkingSeconds += seconds;
                }
            }
            segments.add(bus);
            append(overall, ride.points());
            stopToStop += stops.size() - 1;
            busMeters += lengthMeters(ride.points());
            rideSeconds += ride.alightAbs() - ride.boardAbs();
            waitSeconds += ride.waitSeconds();
            anyShape |= ride.fromShape();
            allShape &= ride.fromShape();
            if (i == 0) {
                journeyStops.addAll(stops);
            } else {
                // Listed once when the bus changes at the same stop; both stops are listed when the rider walks between them.
                StopRole role = routeChanged ? StopRole.TRANSFER : StopRole.INTERMEDIATE;
                StopRef lastListed = journeyStops.get(journeyStops.size() - 1);
                journeyStops.set(journeyStops.size() - 1, withRole(lastListed, role));
                if (lastListed.stopId().equals(stops.get(0).stopId())) {
                    journeyStops.addAll(stops.subList(1, stops.size()));
                } else {
                    journeyStops.add(withRole(stops.get(0), role));
                    journeyStops.addAll(stops.subList(1, stops.size()));
                }
            }
        }

        Ride last = rides.get(rides.size() - 1);
        BusNetwork.Stop lastStop = stopOf(network, last, false);
        Segment lastMile = walk(WalkRole.LAST_MILE, lastStop.latitude(), lastStop.longitude(), destination.latitude(), destination.longitude(), plan.egress().walkSeconds(), walking);
        addWalk(segments, overall, lastMile);
        walkingMeters += lastMile.distanceMeters();
        walkingSeconds += lastMile.durationSeconds();
        long arriveAbs = last.alightAbs() + plan.egress().walkSeconds();

        int transfers = (int) segments.stream().filter(s -> s.type() == SegmentType.TRANSFER).count();
        int busLegCount = (int) segments.stream().filter(s -> s.type() == SegmentType.BUS).count();
        String geometrySource = allShape ? "GTFS_SHAPES" : anyShape ? "MIXED" : "STOP_SEQUENCE";
        if (!allShape) {
            notices.add(anyShape
                    ? "Some bus rides are drawn through their stops because the dataset has no shape for them."
                    : "Bus rides are drawn through their ordered stops: the dataset has no route shapes.");
        }
        notices.add("Walking distance and time are estimates from straight-line distance.");
        notices.add("Times are the scheduled timetable, not live arrival predictions.");
        // keep the first mention of each notice only
        List<String> distinct = notices.stream().distinct().toList();

        long totalSeconds = arriveAbs - departAbs;
        BusJourney journey = new BusJourney(
                transfers, busLegCount, journeyStops.size(), stopToStop,
                walkingMeters, walkingSeconds, rideSeconds, waitSeconds,
                iso(dayStart, departAbs), iso(dayStart, arriveAbs),
                null, BusJourney.UNAVAILABLE, BusJourney.STATIC_SCHEDULE, geometrySource,
                segments, markEnds(journeyStops), null, distinct);
        long distance = walkingMeters + busMeters;
        return Optional.of(new Built(journey, overall.size() >= 2 ? overall : List.of(overall.get(0), overall.get(0)), distance, Math.max(0, totalSeconds)));
    }

    // ------------------------------------------------------------------ pieces

    private static boolean matches(TripRun run, BusNetwork network, BusNetwork.Pattern pattern) {
        if (run.stops().size() != pattern.stops().length) {
            return false;
        }
        for (int i = 0; i < pattern.stops().length; i++) {
            if (!run.stops().get(i).stopId().equals(network.stop(pattern.stops()[i]).id())) {
                return false;
            }
        }
        return true;
    }

    private static long walkSeconds(BusNetwork.Stop a, BusNetwork.Stop b, BusJourneyPlanner.Settings walking) {
        return a.id().equals(b.id()) ? 0 : walking.walkSeconds(GeoMath.haversineMeters(a.latitude(), a.longitude(), b.latitude(), b.longitude()));
    }

    private static BusNetwork.Stop stopOf(BusNetwork network, Ride ride, boolean boarding) {
        int pos = boarding ? ride.leg().boardPos() : ride.leg().alightPos();
        return network.stop(ride.pattern().stops()[pos]);
    }

    private static double lengthMeters(List<double[]> points) {
        return GeoMath.lengthMeters(points);
    }

    private static String iso(ZonedDateTime dayStart, long secondsSinceDayStart) {
        OffsetDateTime time = dayStart.plusSeconds(secondsSinceDayStart).toOffsetDateTime();
        return ISO.format(time);
    }

    private static StopRef stopRef(BusNetwork.Stop stop, StopRole role) {
        return new StopRef(stop.id(), stop.externalId(), stop.name(), stop.latitude(), stop.longitude(), role, stop.accessibility());
    }

    private static StopRef withRole(StopRef s, StopRole role) {
        return new StopRef(s.stopId(), s.gtfsId(), s.name(), s.latitude(), s.longitude(), role, s.accessibility());
    }

    private static List<StopRef> markEnds(List<StopRef> stops) {
        List<StopRef> out = new ArrayList<>(stops);
        out.set(0, withRole(out.get(0), StopRole.BOARDING));
        out.set(out.size() - 1, withRole(out.get(out.size() - 1), StopRole.EXIT));
        return out;
    }

    private static RouteRef routeRef(BusNetwork network, BusNetwork.Pattern pattern) {
        BusNetwork.Route r = network.routes().get(pattern.route());
        return new RouteRef(r.id(), r.externalId(), r.displayName(), r.shortName(), r.longName(), r.agencyName());
    }

    private static List<StopRef> rideStops(BusNetwork network, List<TimedStop> called) {
        List<StopRef> stops = new ArrayList<>();
        for (int i = 0; i < called.size(); i++) {
            StopRole role = i == 0 ? StopRole.BOARDING : i == called.size() - 1 ? StopRole.EXIT : StopRole.INTERMEDIATE;
            stops.add(stopRef(network.stop(network.stopIndexOf(called.get(i).stopId())), role));
        }
        return stops;
    }

    private static Segment busSegment(BusNetwork network, Ride ride, RouteRef route, List<StopRef> stops, ZonedDateTime dayStart) {
        String headsign = ride.run().headsign();
        HeadsignSource source = HeadsignSource.GTFS_TRIP;
        if (headsign == null || headsign.isBlank()) {
            headsign = network.stop(ride.pattern().stops()[ride.pattern().stops().length - 1]).name(); // "towards" the pattern's last stop
            source = HeadsignSource.TERMINAL_STOP;
        }
        return new Segment(SegmentType.BUS, null, Math.round(lengthMeters(ride.points())), ride.alightAbs() - ride.boardAbs(), route,
                ride.run().tripId(), ride.run().gtfsId(), headsign, source, ride.run().directionId() != null ? ride.run().directionId() : ride.pattern().directionId(),
                stops.get(0), stops.get(stops.size() - 1), stops, stops.size(), stops.size() - 1,
                iso(dayStart, ride.boardAbs()), iso(dayStart, ride.alightAbs()), ride.waitSeconds(), null, null, null,
                PolylineEncoder.encode(ride.points()), ride.fromShape() ? "GTFS_SHAPES" : "STOP_SEQUENCE", false);
    }

    private static Segment merge(Segment a, Segment b) {
        List<StopRef> stops = new ArrayList<>(a.stops());
        stops.set(stops.size() - 1, withRole(stops.get(stops.size() - 1), StopRole.INTERMEDIATE));
        stops.addAll(b.stops().subList(1, b.stops().size()));
        List<double[]> points = new ArrayList<>(PolylineEncoder.decode(a.geometry()));
        List<double[]> second = PolylineEncoder.decode(b.geometry());
        points.addAll(second.subList(1, second.size()));
        return new Segment(SegmentType.BUS, null, a.distanceMeters() + b.distanceMeters(), a.durationSeconds() + b.durationSeconds() + b.waitSeconds(), a.route(),
                a.tripId(), a.tripGtfsId(), a.headsign(), a.headsignSource(), a.directionId(), a.boarding(), b.exit(), stops, stops.size(), stops.size() - 1,
                a.departureTime(), b.arrivalTime(), a.waitSeconds(), null, null, null, PolylineEncoder.encode(points), a.geometrySource(), false);
    }

    private static Segment walk(WalkRole role, double fromLat, double fromLon, double toLat, double toLon, int seconds, BusJourneyPlanner.Settings walking) {
        double straight = GeoMath.haversineMeters(fromLat, fromLon, toLat, toLon);
        List<double[]> points = List.of(new double[]{fromLat, fromLon}, new double[]{toLat, toLon});
        return new Segment(SegmentType.WALK, role, Math.round(straight * walking.detourFactor()), seconds, null, null, null, null, null, null, null, null,
                List.of(), 0, 0, null, null, 0, null, null, null, PolylineEncoder.encode(points), "ESTIMATED_STRAIGHT_LINE", true);
    }

    private static Segment walkSegment(WalkRole role, long meters, long seconds, List<double[]> points) {
        return new Segment(SegmentType.WALK, role, meters, seconds, null, null, null, null, null, null, null, null,
                List.of(), 0, 0, null, null, 0, null, null, null, PolylineEncoder.encode(points), "ESTIMATED_STRAIGHT_LINE", true);
    }

    private static void addWalk(List<Segment> segments, List<double[]> overall, Segment walk) {
        segments.add(walk);
        append(overall, PolylineEncoder.decode(walk.geometry()));
    }

    /** Appends points to the journey's overall line, dropping a first point that repeats the line's last one. */
    private static void append(List<double[]> overall, List<double[]> points) {
        for (double[] point : points) {
            if (overall.isEmpty() || overall.get(overall.size() - 1)[0] != point[0] || overall.get(overall.size() - 1)[1] != point[1]) {
                overall.add(point);
            }
        }
    }

}
