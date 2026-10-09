package com.routeview.bus.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.bus.journey.BusStopLayer;

/** One GiST-indexed bounding-box query; only stops some bus pattern calls at are returned. */
@Repository
public class JdbcBusStopLayer implements BusStopLayer {

    private static final String SQL = """
            SELECT s.id, s.external_id, s.name, ST_Y(s.location) AS lat, ST_X(s.location) AS lon
            FROM bus_stop s
            WHERE s.active AND s.location && ST_MakeEnvelope(?, ?, ?, ?, 4326)
              AND EXISTS (SELECT 1 FROM bus_pattern_stop ps WHERE ps.stop_id = s.id)
            ORDER BY s.name, s.id
            LIMIT ?
            """;

    private final JdbcTemplate jdbc;

    public JdbcBusStopLayer(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Stop> inWindow(double south, double west, double north, double east, int limit) {
        int bounded = Math.max(1, Math.min(limit, 500));
        return jdbc.query(SQL, (rs, row) -> new Stop(rs.getObject("id", UUID.class), rs.getString("external_id"), rs.getString("name"),
                rs.getDouble("lat"), rs.getDouble("lon")), west, south, east, north, bounded + 1);
    }
}
