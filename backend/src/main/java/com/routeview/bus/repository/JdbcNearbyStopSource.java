package com.routeview.bus.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.bus.journey.NearbyStopSource;
import com.routeview.common.geo.Coordinates;

/**
 * PostGIS nearest-stop search. The candidate set comes from the GiST index ({@code ST_DWithin} on the geometry column in
 * degrees, ordered by the KNN operator {@code <->}); only that bounded set is measured in meters. The {@code ::geography} cast
 * is applied to the selected rows only, never in the filter, so the spatial index is used.
 */
@Repository
public class JdbcNearbyStopSource implements NearbyStopSource {

    private static final double METERS_PER_DEGREE = 111_320.0;
    private static final int MAX_LIMIT = 200;

    private static final String SQL = """
            SELECT s.id, ST_Distance(s.location::geography, p.pt::geography) AS meters
            FROM (SELECT ST_SetSRID(ST_MakePoint(?, ?), 4326) AS pt) p
            JOIN LATERAL (
                SELECT b.id, b.location FROM bus_stop b
                WHERE b.active AND ST_DWithin(b.location, p.pt, ?)
                ORDER BY b.location <-> p.pt
                LIMIT ?
            ) s ON true
            ORDER BY meters
            """;

    private final JdbcTemplate jdbc;

    public JdbcNearbyStopSource(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Candidate> nearest(Coordinates point, double radiusMeters, int limit) {
        int bounded = Math.max(1, Math.min(limit, MAX_LIMIT));
        // One degree of longitude is shorter than one of latitude: use the larger span so the box never cuts the circle.
        double cos = Math.max(0.2, Math.cos(Math.toRadians(point.latitude())));
        double degrees = radiusMeters / (METERS_PER_DEGREE * cos);
        return jdbc.query(SQL, (rs, row) -> new Candidate(rs.getObject("id", UUID.class), rs.getDouble("meters")),
                point.longitude(), point.latitude(), degrees, bounded).stream()
                .filter(c -> c.meters() <= radiusMeters)
                .toList();
    }
}
