package com.routeview.metro.repository;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.routeview.metro.ingest.MetroDataset;
import com.routeview.metro.ingest.MetroImportStore;
import com.routeview.metro.model.MetroConnection;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroShape;
import com.routeview.metro.model.MetroStation;
import com.routeview.metro.model.MetroStationLine;

/** PostGIS implementation of {@link MetroImportStore}: the whole dataset is replaced in ONE transaction. */
@Repository
public class JdbcMetroImportStore implements MetroImportStore {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public JdbcMetroImportStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Override
    public StoreResult replace(MetroDataset dataset) {
        return transaction.execute(status -> {
            String source = dataset.source();
            Set<UUID> knownStations = new HashSet<>(jdbc.queryForList("SELECT id FROM metro_station WHERE source = ?", UUID.class, source));
            Set<UUID> knownLines = new HashSet<>(jdbc.queryForList("SELECT id FROM metro_line WHERE source = ?", UUID.class, source));

            int stationsInserted = 0;
            int stationsUpdated = 0;
            for (MetroStation station : dataset.stations()) {
                jdbc.update("""
                        INSERT INTO metro_station (id, external_id, name, location, source, source_version, active, metadata)
                        VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, true, ?::jsonb)
                        ON CONFLICT (source, external_id) DO UPDATE
                           SET name = EXCLUDED.name, location = EXCLUDED.location, source_version = EXCLUDED.source_version,
                               active = true, metadata = EXCLUDED.metadata, updated_at = now()
                        """,
                        station.id(), station.externalId(), station.name(), station.longitude(), station.latitude(),
                        station.source(), station.sourceVersion(), MetroJson.toJson(station.metadata()));
                if (knownStations.remove(station.id())) {
                    stationsUpdated++;
                } else {
                    stationsInserted++;
                }
            }
            int stationsDeactivated = deactivate("metro_station", knownStations);

            int linesInserted = 0;
            int linesUpdated = 0;
            for (MetroLine line : dataset.lines()) {
                jdbc.update("""
                        INSERT INTO metro_line (id, external_id, name, short_name, display_color, source, source_version, active,
                                                group_id, group_name, branch_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, true, ?, ?, ?)
                        ON CONFLICT (source, external_id) DO UPDATE
                           SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, display_color = EXCLUDED.display_color,
                               source_version = EXCLUDED.source_version, active = true, updated_at = now(),
                               group_id = EXCLUDED.group_id, group_name = EXCLUDED.group_name, branch_name = EXCLUDED.branch_name
                        """,
                        line.id(), line.externalId(), line.name(), line.shortName(), line.displayColor(), line.source(), dataset.sourceVersion(),
                        line.groupId(), line.groupName(), line.branchName());
                if (knownLines.remove(line.id())) {
                    linesUpdated++;
                } else {
                    linesInserted++;
                }
            }
            int linesDeactivated = deactivate("metro_line", knownLines);

            // The links of this source are replaced as a whole (they are derived data); same transaction.
            jdbc.update("DELETE FROM metro_station_line WHERE line_id IN (SELECT id FROM metro_line WHERE source = ?)", source);
            jdbc.batchUpdate("INSERT INTO metro_station_line (line_id, pattern, sequence, station_id, toward) VALUES (?, ?, ?, ?, ?)",
                    dataset.stationLines(), 500, (ps, link) -> bind(ps, link));

            // The graph and the shapes are derived data too: replaced as a whole, in the same transaction.
            jdbc.update("DELETE FROM metro_connection WHERE line_id IN (SELECT id FROM metro_line WHERE source = ?)", source);
            jdbc.batchUpdate("INSERT INTO metro_connection (line_id, from_station_id, to_station_id, trip_count) VALUES (?, ?, ?, ?)",
                    dataset.connections(), 500, (ps, c) -> bindConnection(ps, c));
            jdbc.update("DELETE FROM metro_shape WHERE line_id IN (SELECT id FROM metro_line WHERE source = ?)", source);
            for (MetroShape shape : dataset.shapes()) {
                jdbc.update("INSERT INTO metro_shape (id, line_id, external_id, geometry, trip_count) VALUES (?, ?, ?, ST_GeomFromText(?, 4326), ?)",
                        shape.id(), shape.lineId(), shape.externalId(), wkt(shape), shape.tripCount());
            }

            var period = dataset.servicePeriod();
            jdbc.update("""
                    INSERT INTO metro_dataset (source, source_version, source_updated_at, imported_at, statistics,
                                               service_period_start, service_period_end, operating_days)
                    VALUES (?, ?, ?, now(), ?::jsonb, ?, ?, ?)
                    ON CONFLICT (source) DO UPDATE
                       SET source_version = EXCLUDED.source_version, source_updated_at = EXCLUDED.source_updated_at,
                           imported_at = now(), statistics = EXCLUDED.statistics,
                           service_period_start = EXCLUDED.service_period_start, service_period_end = EXCLUDED.service_period_end,
                           operating_days = EXCLUDED.operating_days
                    """,
                    source, dataset.sourceVersion(), dataset.sourceUpdatedAt() == null ? null : java.sql.Date.valueOf(dataset.sourceUpdatedAt()),
                    MetroJson.toJsonObject(dataset.statistics().asMap()),
                    period == null ? null : java.sql.Date.valueOf(period.start()), period == null ? null : java.sql.Date.valueOf(period.end()),
                    period == null ? null : String.join(",", period.operatingDays()));
            return new StoreResult(stationsInserted, stationsUpdated, stationsDeactivated, linesInserted, linesUpdated, linesDeactivated);
        });
    }

    private static void bind(java.sql.PreparedStatement ps, MetroStationLine link) throws java.sql.SQLException {
        ps.setObject(1, link.lineId());
        ps.setString(2, link.pattern());
        ps.setInt(3, link.sequence());
        ps.setObject(4, link.stationId());
        ps.setString(5, link.toward());
    }

    private static void bindConnection(java.sql.PreparedStatement ps, MetroConnection c) throws java.sql.SQLException {
        ps.setObject(1, c.lineId());
        ps.setObject(2, c.fromStationId());
        ps.setObject(3, c.toStationId());
        ps.setInt(4, c.tripCount());
    }

    /** WKT is longitude first. */
    static String wkt(MetroShape shape) {
        StringBuilder text = new StringBuilder("LINESTRING(");
        for (int i = 0; i < shape.points().size(); i++) {
            double[] p = shape.points().get(i);
            text.append(i == 0 ? "" : ",").append(p[1]).append(' ').append(p[0]);
        }
        return text.append(')').toString();
    }

    private int deactivate(String table, Set<UUID> ids) {
        int count = 0;
        for (UUID id : ids) {
            count += jdbc.update("UPDATE " + table + " SET active = false, updated_at = now() WHERE id = ? AND active", id);
        }
        return count;
    }
}
