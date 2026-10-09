package com.routeview.bus.repository;

import java.sql.Date;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.routeview.bus.ingest.BusGtfsImporter;
import com.routeview.bus.ingest.BusImportSink;
import com.routeview.bus.ingest.BusImportStatistics;
import com.routeview.bus.ingest.BusImportStore;
import com.routeview.bus.model.BusAgency;
import com.routeview.bus.model.BusRoute;
import com.routeview.bus.model.BusService;
import com.routeview.bus.model.BusServiceException;
import com.routeview.bus.model.BusShape;
import com.routeview.bus.model.BusStop;
import com.routeview.bus.model.BusStopTime;
import com.routeview.bus.model.BusTrip;
import com.routeview.gtfs.GtfsText;

/**
 * PostGIS implementation of {@link BusImportStore}. The whole import (millions of stop times, in batches) runs in ONE
 * transaction: a failure rolls everything back and the previous data stays. Every write is an upsert on (source, external_id)
 * - or, for stop times, delete-and-reinsert per trip - so importing the same dataset again changes nothing but timestamps.
 * Records of the source that the new dataset no longer contains are retired at the end: stops, routes and agencies are
 * marked inactive, trips (with their stop times), services and shapes are removed.
 */
@Repository
public class JdbcBusImportStore implements BusImportStore {

    // ---- SQL (also run directly against PostgreSQL by the verification harness)
    static final String UPSERT_AGENCY = """
            INSERT INTO bus_agency (id, external_id, name, url, timezone, source, source_version, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, true)
            ON CONFLICT (source, external_id) DO UPDATE
               SET name = EXCLUDED.name, url = EXCLUDED.url, timezone = EXCLUDED.timezone,
                   source_version = EXCLUDED.source_version, active = true, updated_at = now()
            """;
    static final String UPSERT_STOP = """
            INSERT INTO bus_stop (id, external_id, code, name, location, zone_id, source, source_version, active, wheelchair_boarding)
            VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, true, ?)
            ON CONFLICT (source, external_id) DO UPDATE
               SET code = EXCLUDED.code, name = EXCLUDED.name, location = EXCLUDED.location, zone_id = EXCLUDED.zone_id,
                   wheelchair_boarding = EXCLUDED.wheelchair_boarding,
                   source_version = EXCLUDED.source_version, active = true, updated_at = now()
            """;
    static final String UPSERT_ROUTE = """
            INSERT INTO bus_route (id, external_id, agency_id, long_name, short_name, route_type, display_color, source, source_version, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)
            ON CONFLICT (source, external_id) DO UPDATE
               SET agency_id = EXCLUDED.agency_id, long_name = EXCLUDED.long_name, short_name = EXCLUDED.short_name,
                   route_type = EXCLUDED.route_type, display_color = EXCLUDED.display_color,
                   source_version = EXCLUDED.source_version, active = true, updated_at = now()
            """;
    static final String UPSERT_SERVICE = """
            INSERT INTO bus_service (id, external_id, operating_days, start_date, end_date, source, source_version)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (source, external_id) DO UPDATE
               SET operating_days = EXCLUDED.operating_days, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
                   source_version = EXCLUDED.source_version, updated_at = now()
            """;
    static final String DELETE_SERVICE_DATES = "DELETE FROM bus_service_date WHERE service_id = ?";
    static final String INSERT_SERVICE_DATE = """
            INSERT INTO bus_service_date (service_id, service_date, added) VALUES (?, ?, ?)
            ON CONFLICT (service_id, service_date) DO UPDATE SET added = EXCLUDED.added
            """;
    static final String UPSERT_SHAPE = """
            INSERT INTO bus_shape (id, external_id, geometry, source, source_version)
            VALUES (?, ?, ST_GeomFromText(?, 4326), ?, ?)
            ON CONFLICT (source, external_id) DO UPDATE
               SET geometry = EXCLUDED.geometry, source_version = EXCLUDED.source_version, updated_at = now()
            """;
    static final String UPSERT_TRIP = """
            INSERT INTO bus_trip (id, external_id, route_id, service_external_id, service_id, shape_id, headsign, direction_id, source, source_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (source, external_id) DO UPDATE
               SET route_id = EXCLUDED.route_id, service_external_id = EXCLUDED.service_external_id, service_id = EXCLUDED.service_id,
                   shape_id = EXCLUDED.shape_id, headsign = EXCLUDED.headsign, direction_id = EXCLUDED.direction_id,
                   source_version = EXCLUDED.source_version, updated_at = now()
            """;
    static final String DELETE_STOP_TIMES = "DELETE FROM bus_stop_time WHERE trip_id = ANY (?::uuid[])";
    static final String INSERT_STOP_TIME = """
            INSERT INTO bus_stop_time (trip_id, stop_sequence, stop_id, arrival_seconds, departure_seconds) VALUES (?, ?, ?, ?, ?)
            """;
    static final String DELETE_TRIPS = "DELETE FROM bus_trip WHERE id = ANY (?::uuid[])";
    // now() is constant inside a transaction: every row written by this import carries it, older rows are the unseen ones.
    static final String RETIRE_TRIPS = "DELETE FROM bus_trip WHERE source = ? AND updated_at < now()";
    static final String RETIRE_SHAPES = "DELETE FROM bus_shape WHERE source = ? AND updated_at < now()";
    static final String RETIRE_SERVICES = "DELETE FROM bus_service WHERE source = ? AND updated_at < now()";
    static final String[] RETIRE_ACTIVE = {
            "UPDATE bus_stop SET active = false, updated_at = now() WHERE source = ? AND updated_at < now() AND active",
            "UPDATE bus_route SET active = false, updated_at = now() WHERE source = ? AND updated_at < now() AND active",
            "UPDATE bus_agency SET active = false, updated_at = now() WHERE source = ? AND updated_at < now() AND active"};
    static final String UPSERT_DATASET = """
            INSERT INTO bus_dataset (source, source_version, source_updated_at, imported_at, statistics,
                                     service_period_start, service_period_end, operating_days)
            VALUES (?, ?, ?, now(), ?::jsonb, ?, ?, ?)
            ON CONFLICT (source) DO UPDATE
               SET source_version = EXCLUDED.source_version, source_updated_at = EXCLUDED.source_updated_at,
                   imported_at = now(), statistics = EXCLUDED.statistics,
                   service_period_start = EXCLUDED.service_period_start, service_period_end = EXCLUDED.service_period_end,
                   operating_days = EXCLUDED.operating_days
            """;

    private static final int ID_CHUNK = 2_000;


    // Derived pattern layer: trips of one route with the same ordered stop list share a pattern (rebuilt from the stored stop
    // times at the end of every import, in the same transaction). Signature = md5 of the stop ids in stop_sequence order.
    private static final String PATTERN_TEMP_TABLE = """
            CREATE TEMP TABLE bus_tmp_trip_signature (
                trip_id uuid NOT NULL, signature char(32) NOT NULL, stops integer NOT NULL, first_departure integer NOT NULL
            ) ON COMMIT DROP
            """;
    private static final String PATTERN_SIGNATURES = """
            INSERT INTO bus_tmp_trip_signature (trip_id, signature, stops, first_departure)
            SELECT st.trip_id,
                   md5(string_agg(st.stop_id::text, ',' ORDER BY st.stop_sequence)) AS signature,
                   count(*) AS stops,
                   (array_agg(coalesce(st.departure_seconds, st.arrival_seconds) ORDER BY st.stop_sequence))[1] AS first_departure
            FROM bus_stop_time st JOIN bus_trip t ON t.id = st.trip_id
            WHERE t.source = ?
            GROUP BY st.trip_id
            HAVING bool_and(coalesce(st.arrival_seconds, st.departure_seconds) IS NOT NULL) AND count(*) >= 2
            """;
    private static final String PATTERN_SIGNATURE_INDEX = "CREATE INDEX ON bus_tmp_trip_signature (trip_id)";
    private static final String PATTERN_DROP_TEMP = "DROP TABLE IF EXISTS bus_tmp_trip_signature";
    private static final String PATTERN_DELETE = "DELETE FROM bus_pattern WHERE source = ?";
    private static final String PATTERN_INSERT = """
            INSERT INTO bus_pattern (id, route_id, source, signature, stop_count, trip_count, first_departure, last_departure, direction_id, headsign)
            SELECT md5(?::text || ':bus-pattern:' || r.external_id || ':' || s.signature)::uuid, t.route_id, ?, s.signature,
                   max(s.stops), count(*), min(s.first_departure), max(s.first_departure),
                   CASE WHEN bool_and(t.direction_id IS NOT NULL) AND count(DISTINCT t.direction_id) = 1 THEN min(t.direction_id) END,
                   CASE WHEN bool_and(t.headsign IS NOT NULL) AND count(DISTINCT t.headsign) = 1 THEN min(t.headsign) END
            FROM bus_tmp_trip_signature s JOIN bus_trip t ON t.id = s.trip_id JOIN bus_route r ON r.id = t.route_id
            GROUP BY t.route_id, r.external_id, s.signature
            """;
    private static final String PATTERN_STOPS_INSERT = """
            INSERT INTO bus_pattern_stop (pattern_id, idx, stop_id, stop_sequence, offset_seconds)
            SELECT p.id, x.idx, x.stop_id, min(x.stop_sequence), greatest(0, round(avg(x.off)))::int
            FROM (SELECT t.route_id, s.signature, st.stop_id, st.stop_sequence,
                         (row_number() OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) - 1)::int AS idx,
                         coalesce(st.arrival_seconds, st.departure_seconds) - s.first_departure AS off
                  FROM bus_stop_time st JOIN bus_tmp_trip_signature s ON s.trip_id = st.trip_id JOIN bus_trip t ON t.id = st.trip_id) x
            JOIN bus_pattern p ON p.route_id = x.route_id AND p.signature = x.signature
            GROUP BY p.id, x.idx, x.stop_id
            """;
    private static final String PATTERN_TRIPS_UPDATE = """
            UPDATE bus_trip t SET pattern_id = p.id
            FROM bus_tmp_trip_signature s, bus_pattern p
            WHERE t.id = s.trip_id AND p.route_id = t.route_id AND p.signature = s.signature
            """;

    private void buildPatterns(String source) {
        jdbc.execute(PATTERN_DROP_TEMP);
        jdbc.execute(PATTERN_TEMP_TABLE);
        jdbc.update(PATTERN_SIGNATURES, source);
        jdbc.execute(PATTERN_SIGNATURE_INDEX);
        jdbc.update(PATTERN_DELETE, source);
        jdbc.update(PATTERN_INSERT, source, source);
        jdbc.update(PATTERN_STOPS_INSERT);
        jdbc.update(PATTERN_TRIPS_UPDATE);
        jdbc.execute(PATTERN_DROP_TEMP);
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public JdbcBusImportStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Override
    public BusImportStatistics replace(BusGtfsImporter.Options options, Function<BusImportSink, BusImportStatistics> producer) {
        return transaction.execute(status -> producer.apply(new Sink(options)));
    }

    private final class Sink implements BusImportSink {

        private final String source;
        private final String version;
        private final int batch;
        private final java.time.LocalDate updatedAt;
        private final Set<UUID> agencyIds = new HashSet<>();
        private final Set<UUID> serviceIds = new HashSet<>();

        Sink(BusGtfsImporter.Options options) {
            this.source = options.source();
            this.version = options.sourceVersion();
            this.batch = Math.max(1, options.batchSize());
            this.updatedAt = options.sourceUpdatedAt();
        }

        @Override
        public void agencies(List<BusAgency> agencies) {
            for (BusAgency a : agencies) {
                agencyIds.add(a.id());
            }
            jdbc.batchUpdate(UPSERT_AGENCY, agencies, batch, (ps, a) -> {
                ps.setObject(1, a.id());
                ps.setString(2, a.externalId());
                ps.setString(3, a.name());
                ps.setString(4, a.url());
                ps.setString(5, a.timezone());
                ps.setString(6, source);
                ps.setString(7, version);
            });
        }

        @Override
        public void stops(List<BusStop> stops) {
            jdbc.batchUpdate(UPSERT_STOP, stops, batch, (ps, s) -> {
                ps.setObject(1, s.id());
                ps.setString(2, s.externalId());
                ps.setString(3, s.code());
                ps.setString(4, s.name());
                ps.setDouble(5, s.longitude());
                ps.setDouble(6, s.latitude());
                ps.setString(7, s.zoneId());
                ps.setString(8, source);
                ps.setString(9, version);
                ps.setObject(10, s.wheelchairBoardingValue(), java.sql.Types.SMALLINT);
            });
        }

        @Override
        public void routes(List<BusRoute> routes) {
            jdbc.batchUpdate(UPSERT_ROUTE, routes, batch, (ps, r) -> {
                UUID agency = r.agencyExternalId() == null ? null : GtfsText.stableId(source, "bus-agency", r.agencyExternalId());
                ps.setObject(1, r.id());
                ps.setString(2, r.externalId());
                ps.setObject(3, agency != null && agencyIds.contains(agency) ? agency : null);
                ps.setString(4, r.longName());
                ps.setString(5, r.shortName());
                ps.setInt(6, r.routeType());
                ps.setString(7, r.color());
                ps.setString(8, source);
                ps.setString(9, version);
            });
        }

        @Override
        public void services(List<BusService> services, List<BusServiceException> exceptions) {
            jdbc.batchUpdate(UPSERT_SERVICE, services, batch, (ps, s) -> {
                UUID id = GtfsText.stableId(source, "bus-service", s.externalId());
                serviceIds.add(id);
                ps.setObject(1, id);
                ps.setString(2, s.externalId());
                ps.setString(3, String.join(",", s.operatingDays()));
                ps.setDate(4, Date.valueOf(s.start()));
                ps.setDate(5, Date.valueOf(s.end()));
                ps.setString(6, source);
                ps.setString(7, version);
            });
            // calendar_dates entries belong to a calendar row; those of a service without one are kept out (nothing to attach to).
            List<BusServiceException> attachable = exceptions.stream()
                    .filter(e -> serviceIds.contains(GtfsText.stableId(source, "bus-service", e.serviceExternalId()))).toList();
            for (UUID id : serviceIds) {
                jdbc.update(DELETE_SERVICE_DATES, id);
            }
            jdbc.batchUpdate(INSERT_SERVICE_DATE, attachable, batch, (ps, e) -> {
                ps.setObject(1, GtfsText.stableId(source, "bus-service", e.serviceExternalId()));
                ps.setDate(2, Date.valueOf(e.date()));
                ps.setBoolean(3, e.added());
            });
        }

        @Override
        public void shapes(List<BusShape> shapes) {
            jdbc.batchUpdate(UPSERT_SHAPE, shapes, batch, (ps, s) -> {
                ps.setObject(1, s.id());
                ps.setString(2, s.externalId());
                ps.setString(3, wkt(s));
                ps.setString(4, source);
                ps.setString(5, version);
            });
        }

        @Override
        public void trips(List<BusTrip> trips) {
            jdbc.batchUpdate(UPSERT_TRIP, trips, batch, (ps, t) -> {
                UUID service = t.serviceExternalId() == null ? null : GtfsText.stableId(source, "bus-service", t.serviceExternalId());
                ps.setObject(1, t.id());
                ps.setString(2, t.externalId());
                ps.setObject(3, t.routeId());
                ps.setString(4, t.serviceExternalId());
                ps.setObject(5, service != null && serviceIds.contains(service) ? service : null);
                ps.setObject(6, t.shapeExternalId() == null ? null : GtfsText.stableId(source, "bus-shape", t.shapeExternalId()));
                ps.setString(7, t.headsign());
                ps.setObject(8, t.directionId());
                ps.setString(9, source);
                ps.setString(10, version);
            });
        }

        @Override
        public void stopTimes(List<BusStopTime> stopTimes) {
            if (stopTimes.isEmpty()) {
                return;
            }
            // A trip is never split over two batches; its previous stop times are replaced as a whole.
            Set<UUID> trips = new HashSet<>();
            for (BusStopTime st : stopTimes) {
                trips.add(st.tripId());
            }
            deleteByIds(DELETE_STOP_TIMES, trips);
            jdbc.batchUpdate(INSERT_STOP_TIME, stopTimes, batch, (ps, st) -> {
                ps.setObject(1, st.tripId());
                ps.setInt(2, st.stopSequence());
                ps.setObject(3, st.stopId());
                ps.setObject(4, st.arrivalSeconds());
                ps.setObject(5, st.departureSeconds());
            });
        }

        @Override
        public void discardTrips(Collection<UUID> tripIds) {
            deleteByIds(DELETE_TRIPS, tripIds);
        }

        @Override
        public void finish(BusImportStatistics statistics) {
            jdbc.update(RETIRE_TRIPS, source);
            jdbc.update(RETIRE_SHAPES, source);
            jdbc.update(RETIRE_SERVICES, source);
            for (String sql : RETIRE_ACTIVE) {
                jdbc.update(sql, source);
            }
            buildPatterns(source);
            Map<String, Object> json = new LinkedHashMap<>(statistics.asMap());
            json.put("rejectionReasons", statistics.rejectionReasons());
            json.put("warningMessages", statistics.warnings());
            jdbc.update(UPSERT_DATASET, source, version, updatedAt == null ? null : Date.valueOf(updatedAt), BusJson.toJson(json),
                    statistics.servicePeriodStart == null ? null : Date.valueOf(statistics.servicePeriodStart),
                    statistics.servicePeriodEnd == null ? null : Date.valueOf(statistics.servicePeriodEnd),
                    statistics.operatingDays.isEmpty() ? null : String.join(",", statistics.operatingDays));
        }
    }

    private void deleteByIds(String sql, Collection<UUID> ids) {
        StringBuilder list = new StringBuilder("{");
        int n = 0;
        for (UUID id : ids) {
            list.append(n == 0 ? "" : ",").append(id);
            if (++n == ID_CHUNK) {
                jdbc.update(sql, list.append('}').toString());
                list.setLength(0);
                list.append('{');
                n = 0;
            }
        }
        if (n > 0) {
            jdbc.update(sql, list.append('}').toString());
        }
    }

    /** WKT is longitude first; points are {latitude, longitude}. */
    static String wkt(BusShape shape) {
        StringBuilder text = new StringBuilder("LINESTRING(");
        for (int i = 0; i < shape.points().size(); i++) {
            double[] p = shape.points().get(i);
            text.append(i == 0 ? "" : ",").append(p[1]).append(' ').append(p[0]);
        }
        return text.append(')').toString();
    }
}
