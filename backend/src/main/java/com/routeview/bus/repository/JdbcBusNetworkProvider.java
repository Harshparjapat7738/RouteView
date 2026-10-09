package com.routeview.bus.repository;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.bus.journey.BusNetwork;
import com.routeview.bus.journey.BusNetworkProvider;
import com.routeview.common.accessibility.Accessibility;

/**
 * Loads the bus pattern graph (stops, routes, patterns - never stop times) once and keeps it for a few minutes, so a request does
 * not read the dataset; a newly imported dataset is picked up when the cache expires. Four plain queries, no per-row queries.
 */
@Repository
public class JdbcBusNetworkProvider implements BusNetworkProvider {

    private static final Logger log = LoggerFactory.getLogger(JdbcBusNetworkProvider.class);
    private static final Duration TTL = Duration.ofMinutes(10);

    private final JdbcTemplate jdbc;
    private volatile BusNetwork cached;
    private volatile Instant loadedAt = Instant.MIN;

    public JdbcBusNetworkProvider(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public BusNetwork current() {
        BusNetwork network = cached;
        if (network != null && Instant.now().isBefore(loadedAt.plus(TTL))) {
            return network;
        }
        synchronized (this) {
            if (cached != null && Instant.now().isBefore(loadedAt.plus(TTL))) {
                return cached;
            }
            try {
                cached = load();
            } catch (RuntimeException e) {
                log.warn("Bus network could not be loaded: {}", e.getClass().getSimpleName());
                cached = cached == null ? BusNetwork.EMPTY : cached;
            }
            loadedAt = Instant.now();
            return cached;
        }
    }

    private static Integer nullableInt(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        Number value = (Number) rs.getObject(column);
        return value == null ? null : value.intValue();
    }

    /** Only an explicit 1 / 2 stored at import is a statement; null (or anything else) is unknown. */
    static Accessibility accessibility(Integer wheelchairBoarding, String source, String sourceVersion) {
        if (wheelchairBoarding == null) {
            return Accessibility.UNKNOWN;
        }
        return Accessibility.of(wheelchairBoarding == 1 ? "ACCESSIBLE" : wheelchairBoarding == 2 ? "INACCESSIBLE" : null, source, sourceVersion);
    }

    private BusNetwork load() {
        List<BusNetwork.DatasetInfo> datasets = jdbc.query(
                "SELECT source, source_version, source_updated_at, imported_at, service_period_start, service_period_end, operating_days FROM bus_dataset ORDER BY imported_at DESC LIMIT 1",
                (rs, row) -> new BusNetwork.DatasetInfo(rs.getString("source"), rs.getString("source_version"),
                        rs.getDate("source_updated_at") == null ? null : rs.getDate("source_updated_at").toLocalDate(),
                        rs.getTimestamp("imported_at") == null ? null : rs.getTimestamp("imported_at").toInstant(),
                        rs.getDate("service_period_start") == null ? null : rs.getDate("service_period_start").toLocalDate(),
                        rs.getDate("service_period_end") == null ? null : rs.getDate("service_period_end").toLocalDate(),
                        rs.getString("operating_days") == null || rs.getString("operating_days").isBlank() ? List.of() : List.of(rs.getString("operating_days").split(","))));
        if (datasets.isEmpty()) {
            return BusNetwork.EMPTY;
        }
        BusNetwork.DatasetInfo dataset = datasets.get(0);

        // Only stops that some pattern serves are part of the graph.
        List<BusNetwork.Stop> stops = jdbc.query("""
                SELECT s.id, s.external_id, s.name, ST_Y(s.location) AS lat, ST_X(s.location) AS lon, s.wheelchair_boarding, s.source_version
                FROM bus_stop s
                WHERE s.active AND s.source = ? AND EXISTS (SELECT 1 FROM bus_pattern_stop ps WHERE ps.stop_id = s.id)
                ORDER BY s.id
                """, (rs, row) -> new BusNetwork.Stop(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("name"),
                rs.getDouble("lat"), rs.getDouble("lon"), accessibility(nullableInt(rs, "wheelchair_boarding"), dataset.source(), rs.getString("source_version"))),
                dataset.source());
        Map<UUID, Integer> stopIndex = new HashMap<>();
        for (int i = 0; i < stops.size(); i++) {
            stopIndex.put(stops.get(i).id(), i);
        }

        List<BusNetwork.Route> routes = jdbc.query("""
                SELECT r.id, r.external_id, r.short_name, r.long_name, r.active, a.external_id AS agency_external_id, a.name AS agency_name
                FROM bus_route r LEFT JOIN bus_agency a ON a.id = r.agency_id
                WHERE r.source = ? AND r.active AND EXISTS (SELECT 1 FROM bus_pattern p WHERE p.route_id = r.id)
                ORDER BY r.id
                """, (rs, row) -> new BusNetwork.Route(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("short_name"),
                rs.getString("long_name"), rs.getString("agency_external_id"), rs.getString("agency_name")), dataset.source());
        Map<UUID, Integer> routeIndex = new HashMap<>();
        for (int i = 0; i < routes.size(); i++) {
            routeIndex.put(routes.get(i).id(), i);
        }

        record PatternRow(UUID id, UUID routeId, int tripCount, Integer firstDeparture, Integer lastDeparture, Integer directionId, String headsign) {
        }
        List<PatternRow> patternRows = jdbc.query("""
                SELECT id, route_id, trip_count, first_departure, last_departure, direction_id, headsign
                FROM bus_pattern WHERE source = ? ORDER BY id
                """, (rs, row) -> new PatternRow(rs.getObject("id", UUID.class), rs.getObject("route_id", UUID.class), rs.getInt("trip_count"),
                nullableInt(rs, "first_departure"), nullableInt(rs, "last_departure"),
                rs.getObject("direction_id") == null ? null : rs.getInt("direction_id"), rs.getString("headsign")), dataset.source());

        // All pattern stops in one pass, in pattern order.
        Map<UUID, List<int[]>> stopsOfPattern = new HashMap<>();
        jdbc.query("""
                SELECT ps.pattern_id, ps.stop_id, ps.offset_seconds
                FROM bus_pattern_stop ps JOIN bus_pattern p ON p.id = ps.pattern_id
                WHERE p.source = ? ORDER BY ps.pattern_id, ps.idx
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
            Integer stop = stopIndex.get(rs.getObject("stop_id", UUID.class));
            stopsOfPattern.computeIfAbsent(rs.getObject("pattern_id", UUID.class), k -> new ArrayList<>())
                    .add(new int[]{stop == null ? -1 : stop, rs.getInt("offset_seconds")});
        }, dataset.source());

        List<BusNetwork.Pattern> patterns = new ArrayList<>();
        for (PatternRow row : patternRows) {
            Integer route = routeIndex.get(row.routeId());
            List<int[]> list = stopsOfPattern.get(row.id());
            if (route == null || list == null || list.size() < 2 || list.stream().anyMatch(e -> e[0] < 0)) {
                continue; // a pattern that is not fully part of the active graph is left out whole, never half-used
            }
            patterns.add(new BusNetwork.Pattern(row.id(), route, list.stream().mapToInt(e -> e[0]).toArray(), list.stream().mapToInt(e -> e[1]).toArray(),
                    row.tripCount(), row.firstDeparture(), row.lastDeparture(), row.directionId(), row.headsign()));
        }
        log.info("Bus network loaded: {} stops, {} routes, {} patterns", stops.size(), routes.size(), patterns.size());
        return new BusNetwork(dataset, stops, routes, patterns);
    }
}
