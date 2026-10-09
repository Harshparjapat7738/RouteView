package com.routeview.metro.repository;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.metro.model.MetroDatasetInfo;
import com.routeview.metro.model.MetroConnection;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroServicePeriod;
import com.routeview.metro.model.MetroShape;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;
import com.routeview.metro.model.MetroStationLine;

/**
 * Reads the active metro network from PostgreSQL and keeps it in memory for a few minutes: it is static, not
 * user-specific data (a few hundred stations), so serving it from memory is safe and saves a database round trip
 * per request. A newly imported dataset is picked up when the cache expires.
 */
@Repository
public class JdbcMetroNetworkProvider implements MetroNetworkProvider {

    private static final Logger log = LoggerFactory.getLogger(JdbcMetroNetworkProvider.class);
    static final Duration TTL = Duration.ofMinutes(10);

    private final JdbcTemplate jdbc;
    private volatile MetroNetwork cached;
    private volatile Instant loadedAt = Instant.MIN;

    public JdbcMetroNetworkProvider(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public MetroNetwork current() {
        MetroNetwork network = cached;
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
                // The network is an enhancement: journeys still work from the routing provider's data alone.
                log.warn("Metro network could not be loaded: {}", e.getClass().getSimpleName());
                cached = cached == null ? MetroNetwork.EMPTY : cached;
            }
            loadedAt = Instant.now();
            return cached;
        }
    }

    private MetroNetwork load() {
        List<MetroDatasetInfo> datasets = jdbc.query(
                "SELECT source, source_version, source_updated_at, imported_at, service_period_start, service_period_end, operating_days FROM metro_dataset ORDER BY imported_at DESC LIMIT 1",
                (rs, row) -> new MetroDatasetInfo(rs.getString("source"), rs.getString("source_version"),
                        rs.getDate("source_updated_at") == null ? null : rs.getDate("source_updated_at").toLocalDate(),
                        rs.getTimestamp("imported_at").toInstant(), period(rs)));
        if (datasets.isEmpty()) {
            return MetroNetwork.EMPTY;
        }
        String source = datasets.get(0).source();
        List<MetroStation> stations = jdbc.query(
                "SELECT id, external_id, name, ST_Y(location) AS lat, ST_X(location) AS lon, source, source_version, metadata ->> 'wheelchairBoarding' AS wheelchair FROM metro_station WHERE active AND source = ?",
                (rs, row) -> new MetroStation(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("name"),
                        rs.getDouble("lat"), rs.getDouble("lon"), rs.getString("source"), rs.getString("source_version"), true,
                        rs.getString("wheelchair") == null ? null : Map.of(MetroStation.WHEELCHAIR_KEY, rs.getString("wheelchair"))),
                source);
        List<MetroLine> lines = jdbc.query(
                "SELECT id, external_id, name, short_name, display_color, source, group_id, group_name, branch_name FROM metro_line WHERE active AND source = ?",
                (rs, row) -> line(rs),
                source);
        List<MetroStationLine> links = jdbc.query(
                "SELECT sl.station_id, sl.line_id, sl.pattern, sl.sequence, sl.toward FROM metro_station_line sl JOIN metro_line l ON l.id = sl.line_id WHERE l.active AND l.source = ?",
                (rs, row) -> new MetroStationLine(rs.getObject("station_id", UUID.class), rs.getObject("line_id", UUID.class),
                        rs.getString("pattern"), rs.getInt("sequence"), rs.getString("toward")),
                source);
        List<MetroConnection> connections = jdbc.query(
                "SELECT c.line_id, c.from_station_id, c.to_station_id, c.trip_count FROM metro_connection c JOIN metro_line l ON l.id = c.line_id WHERE l.active AND l.source = ?",
                (rs, row) -> new MetroConnection(rs.getObject("from_station_id", UUID.class), rs.getObject("to_station_id", UUID.class),
                        rs.getObject("line_id", UUID.class), rs.getInt("trip_count")),
                source);
        return new MetroNetwork(datasets.get(0), stations, lines, links, connections, shapes(source));
    }

    private List<MetroShape> shapes(String source) {
        // One row per point, in shape order; assembled here so no geometry library is needed.
        Map<UUID, MetroShape> heads = new LinkedHashMap<>();
        Map<UUID, List<double[]>> points = new LinkedHashMap<>();
        jdbc.query("""
                SELECT s.id, s.line_id, s.external_id, s.trip_count, dp.path[1] AS idx, ST_Y(dp.geom) AS lat, ST_X(dp.geom) AS lon
                FROM metro_shape s JOIN metro_line l ON l.id = s.line_id,
                     LATERAL ST_DumpPoints(s.geometry) AS dp
                WHERE l.active AND l.source = ?
                ORDER BY s.id, dp.path[1]
                """,
                rs -> {
                    UUID id = rs.getObject("id", UUID.class);
                    heads.computeIfAbsent(id, k -> {
                        try {
                            return new MetroShape(id, rs.getObject("line_id", UUID.class), rs.getString("external_id"), List.of(), rs.getInt("trip_count"));
                        } catch (java.sql.SQLException e) {
                            throw new IllegalStateException(e);
                        }
                    });
                    points.computeIfAbsent(id, k -> new ArrayList<>()).add(new double[]{rs.getDouble("lat"), rs.getDouble("lon")});
                },
                source);
        List<MetroShape> out = new ArrayList<>();
        heads.forEach((id, head) -> out.add(new MetroShape(id, head.lineId(), head.externalId(), points.get(id), head.tripCount())));
        return out;
    }

    private static MetroLine line(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID groupId = rs.getObject("group_id", UUID.class);
        if (groupId == null) { // a row imported before services were grouped: derive the group from the name until re-imported
            return new MetroLine(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("name"),
                    rs.getString("short_name"), rs.getString("display_color"), rs.getString("source"), true);
        }
        return new MetroLine(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("name"),
                rs.getString("short_name"), rs.getString("display_color"), rs.getString("source"), true,
                groupId, rs.getString("group_name"), rs.getString("branch_name"));
    }

    private static MetroServicePeriod period(java.sql.ResultSet rs) throws java.sql.SQLException {
        java.sql.Date start = rs.getDate("service_period_start");
        java.sql.Date end = rs.getDate("service_period_end");
        if (start == null || end == null) {
            return null;
        }
        String days = rs.getString("operating_days");
        return new MetroServicePeriod(start.toLocalDate(), end.toLocalDate(),
                days == null || days.isBlank() ? List.of() : List.of(days.split(",")));
    }
}
