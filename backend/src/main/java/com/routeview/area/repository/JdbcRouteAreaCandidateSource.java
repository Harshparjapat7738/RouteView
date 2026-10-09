package com.routeview.area.repository;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.io.WKBWriter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.area.detection.RouteAreaCandidate;
import com.routeview.area.detection.RouteAreaCandidateSource;
import com.routeview.area.model.AreaType;
import com.routeview.spatial.SpatialReference;

/**
 * PostGIS implementation of {@link RouteAreaCandidateSource}. One query per route; the SQL is in
 * {@code resources/area-detection/route-area-candidates.sql} (documented there and in docs/area-detection.md).
 */
@Repository
public class JdbcRouteAreaCandidateSource implements RouteAreaCandidateSource {

    private static final String CANDIDATES_SQL = load("area-detection/route-area-candidates.sql");
    /** Metres per degree of latitude; longitude degrees are shorter, so the expansion below is on the safe side. */
    private static final double METERS_PER_DEGREE = 111_320.0;

    private final JdbcTemplate jdbc;

    public JdbcRouteAreaCandidateSource(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<RouteAreaCandidate> findCandidates(LineString route, double toleranceMeters, Set<AreaType> types,
            double boundaryBandMeters, double minVisitMeters) {
        if (route == null || route.isEmpty()) {
            throw new IllegalArgumentException("Route geometry is empty.");
        }
        if (route.getSRID() != SpatialReference.WGS84_SRID) {
            throw new IllegalArgumentException("Route geometry must use SRID " + SpatialReference.WGS84_SRID + ".");
        }
        if (types.isEmpty()) {
            return List.of();
        }

        byte[] wkb = new WKBWriter(2).write(route);
        double expandDegrees = expansionDegrees(route.getEnvelopeInternal(), toleranceMeters);
        String typeList = types.stream().map(AreaType::name).sorted().collect(Collectors.joining(","));

        return jdbc.query(
                CANDIDATES_SQL,
                (rs, rowNum) -> new RouteAreaCandidate(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        AreaType.valueOf(rs.getString("area_type")),
                        rs.getDouble("entry_m"),
                        rs.getDouble("exit_m"),
                        rs.getDouble("inside_m"),
                        rs.getDouble("interior_m"),
                        rs.getDouble("size_m"),
                        rs.getBoolean("near_start"),
                        rs.getBoolean("near_end"),
                        rs.getBoolean("contains_start"),
                        rs.getBoolean("contains_end"),
                        rs.getDouble("route_length_m"),
                        rs.getDouble("entry_lat"),
                        rs.getDouble("entry_lon")),
                wkb, toleranceMeters, expandDegrees, typeList, boundaryBandMeters, minVisitMeters);
    }

    /** Degrees by which the route's bounding box is widened so the index pre-filter never misses an area within tolerance. */
    static double expansionDegrees(Envelope envelope, double toleranceMeters) {
        double maxLatitude = Math.max(Math.abs(envelope.getMinY()), Math.abs(envelope.getMaxY()));
        double cosine = Math.max(0.1, Math.cos(Math.toRadians(Math.min(maxLatitude, 89.0))));
        return toleranceMeters / (METERS_PER_DEGREE * cosine);
    }

    private static String load(String path) {
        try (var in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + path, e);
        }
    }
}
