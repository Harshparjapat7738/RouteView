package com.routeview.area.detection;

import java.util.UUID;

import com.routeview.area.model.AreaType;

/** Builds synthetic candidates for unit tests. The names are plain labels; none of this is area data. */
final class CandidateFactory {

    static final double ROUTE_LENGTH = 20_000;

    private CandidateFactory() {
    }

    /** An area the route is inside for {@code inside} metres, first reached {@code entry} metres from the start. */
    static RouteAreaCandidate candidate(String name, AreaType type, double entry, double inside) {
        return candidate(UUID.nameUUIDFromBytes((name + type + entry).getBytes()), name, type, entry, entry + inside, inside, 1500);
    }

    static RouteAreaCandidate candidate(
            UUID id, String name, AreaType type, double entry, double exit, double inside, double size) {
        return new RouteAreaCandidate(id, name, type, entry, exit, inside, inside, size, false, false, false, false,
                ROUTE_LENGTH, 28.4, 77.3);
    }

    static RouteAreaCandidate withEnds(RouteAreaCandidate c, boolean nearStart, boolean nearEnd) {
        return new RouteAreaCandidate(c.areaId(), c.name(), c.areaType(), c.entryDistanceMeters(), c.exitDistanceMeters(),
                c.insideMeters(), c.interiorMeters(), c.sizeMeters(), nearStart, nearEnd, nearStart, nearEnd,
                c.routeLengthMeters(), c.entryLatitude(), c.entryLongitude());
    }

    /** Same candidate, but only {@code interior} metres of its {@code inside} metres are genuine crossing. */
    static RouteAreaCandidate withInterior(RouteAreaCandidate c, double interior) {
        return new RouteAreaCandidate(c.areaId(), c.name(), c.areaType(), c.entryDistanceMeters(), c.exitDistanceMeters(),
                c.insideMeters(), interior, c.sizeMeters(), c.nearStart(), c.nearEnd(), c.containsStart(), c.containsEnd(),
                c.routeLengthMeters(), c.entryLatitude(), c.entryLongitude());
    }

    /** The route start/end pin is only near the area (outside it) while the route touches it. */
    static RouteAreaCandidate nearOnly(RouteAreaCandidate c, boolean nearStart, boolean nearEnd) {
        return new RouteAreaCandidate(c.areaId(), c.name(), c.areaType(), c.entryDistanceMeters(), c.exitDistanceMeters(),
                c.insideMeters(), c.interiorMeters(), c.sizeMeters(), nearStart, nearEnd, false, false,
                c.routeLengthMeters(), c.entryLatitude(), c.entryLongitude());
    }
}
