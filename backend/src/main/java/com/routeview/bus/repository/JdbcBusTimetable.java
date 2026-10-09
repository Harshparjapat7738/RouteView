package com.routeview.bus.repository;

import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.routeview.bus.journey.BusNetwork;
import com.routeview.bus.journey.BusTimetable;

/**
 * The scheduled trips behind the pattern graph, read with indexed queries: a service-day lookup (cached per date), one query
 * for the patterns that run on a day, and for a boarding two small queries (the few next candidate trips at the stop, then the
 * ordered stop list of the chosen trip). Nothing here reads a whole table.
 */
@Repository
public class JdbcBusTimetable implements BusTimetable {

    private static final int DAY = 86_400;
    private static final int CANDIDATES = 6;
    private static final int MAX_CACHED_DAYS = 14;

    private static final String SERVICES = """
            SELECT s.id FROM bus_service s
            WHERE (s.start_date <= ? AND s.end_date >= ?
                   AND (',' || replace(lower(s.operating_days), ' ', '') || ',') LIKE ?
                   AND NOT EXISTS (SELECT 1 FROM bus_service_date d WHERE d.service_id = s.id AND d.service_date = ? AND NOT d.added))
               OR EXISTS (SELECT 1 FROM bus_service_date d WHERE d.service_id = s.id AND d.service_date = ? AND d.added)
            """;

    private static final String ACTIVE_PATTERNS = """
            SELECT DISTINCT pattern_id FROM bus_trip
            WHERE pattern_id IS NOT NULL AND (? OR service_id = ANY(?::uuid[]))
            """;

    private static final String CANDIDATE_TRIPS = """
            SELECT c.trip_id, c.external_id, c.shape_id, c.headsign, c.direction_id, c.day_offset, c.eff FROM (
                SELECT t.id AS trip_id, t.external_id, t.shape_id, t.headsign, t.direction_id, 0 AS day_offset,
                       coalesce(st.departure_seconds, st.arrival_seconds) AS eff
                FROM bus_trip t JOIN bus_stop_time st ON st.trip_id = t.id
                WHERE t.pattern_id = ? AND st.stop_id = ? AND (? OR t.service_id = ANY(?::uuid[]))
                  AND coalesce(st.departure_seconds, st.arrival_seconds) >= ?
                UNION ALL
                SELECT t.id, t.external_id, t.shape_id, t.headsign, t.direction_id, -86400,
                       coalesce(st.departure_seconds, st.arrival_seconds) - 86400
                FROM bus_trip t JOIN bus_stop_time st ON st.trip_id = t.id
                WHERE t.pattern_id = ? AND st.stop_id = ? AND (? OR t.service_id = ANY(?::uuid[]))
                  AND coalesce(st.departure_seconds, st.arrival_seconds) >= ? + 86400
            ) c ORDER BY c.eff LIMIT ?
            """;

    private static final String TRIP_STOPS = """
            SELECT stop_sequence, stop_id, arrival_seconds, departure_seconds FROM bus_stop_time
            WHERE trip_id = ? ORDER BY stop_sequence
            """;

    private static final String SHAPE = """
            SELECT ST_Y(g.geom) AS lat, ST_X(g.geom) AS lon
            FROM bus_shape s, LATERAL ST_DumpPoints(s.geometry) g
            WHERE s.id = ? ORDER BY g.path[1]
            """;

    private final JdbcTemplate jdbc;
    private final Map<LocalDate, ServiceDay> days = new ConcurrentHashMap<>();
    private volatile Boolean hasCalendar;

    public JdbcBusTimetable(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ServiceDay serviceDay(LocalDate date) {
        if (days.size() > MAX_CACHED_DAYS) {
            days.clear();
        }
        return days.computeIfAbsent(date, this::loadDay);
    }

    private ServiceDay loadDay(LocalDate date) {
        if (hasCalendar == null) {
            hasCalendar = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM bus_service)", Boolean.class));
        }
        if (!hasCalendar) {
            return new ServiceDay(date, Set.of(), true);
        }
        DayOfWeek dow = date.getDayOfWeek();
        String pattern = "%," + dow.getDisplayName(TextStyle.FULL, Locale.ENGLISH).toLowerCase(Locale.ROOT) + ",%";
        Date sql = Date.valueOf(date);
        List<UUID> ids = jdbc.query(SERVICES, (rs, row) -> rs.getObject("id", UUID.class), sql, sql, pattern, sql, sql);
        return new ServiceDay(date, new HashSet<>(ids), false);
    }

    @Override
    public BitSet activePatterns(ServiceDay day, BusNetwork network) {
        BitSet active = new BitSet(network.patterns().size());
        List<UUID> ids = jdbc.query(ACTIVE_PATTERNS, (rs, row) -> rs.getObject("pattern_id", UUID.class),
                day.unrestricted(), uuidArray(day.activeServices()));
        for (UUID id : ids) {
            int index = network.patternIndexOf(id);
            if (index >= 0) {
                active.set(index);
            }
        }
        return active;
    }

    private record Candidate(UUID tripId, String gtfsId, UUID shapeId, String headsign, Integer directionId, int dayOffset, int effective) {
    }

    @Override
    public Optional<TripRun> nextTrip(UUID patternId, UUID boardStopId, int boardPosition, ServiceDay today, ServiceDay yesterday, int readySeconds) {
        String todayServices = uuidArray(today.activeServices());
        String yesterdayServices = uuidArray(yesterday.activeServices());
        // Today's trips use today's calendar; trips running past midnight use yesterday's.
        List<Candidate> candidates = new ArrayList<>();
        candidates.addAll(query(patternId, boardStopId, today, todayServices, readySeconds, 0));
        candidates.addAll(query(patternId, boardStopId, yesterday, yesterdayServices, readySeconds, -DAY));
        candidates.sort((a, b) -> Integer.compare(a.effective(), b.effective()));
        for (Candidate c : candidates) {
            List<TimedStop> stops = stops(c.tripId());
            if (boardPosition < 0 || boardPosition >= stops.size() || !stops.get(boardPosition).stopId().equals(boardStopId)) {
                continue; // a repeated stop matched at another position: try the next candidate
            }
            TimedStop at = stops.get(boardPosition);
            Integer departure = at.departureSeconds() != null ? at.departureSeconds() : at.arrivalSeconds();
            if (departure == null || departure + c.dayOffset() < readySeconds) {
                continue;
            }
            return Optional.of(new TripRun(c.tripId(), c.gtfsId(), c.shapeId(), c.headsign(), c.directionId(), c.dayOffset(), stops));
        }
        return Optional.empty();
    }

    private List<Candidate> query(UUID patternId, UUID stopId, ServiceDay day, String services, int ready, int offset) {
        // The query always has a today part and a yesterday part; use the one that matches the day, switch off the other.
        boolean todayPart = offset == 0;
        UUID none = new UUID(0, 0);
        return jdbc.query(CANDIDATE_TRIPS, (rs, row) -> new Candidate(rs.getObject("trip_id", UUID.class), rs.getString("external_id"),
                        rs.getObject("shape_id", UUID.class), rs.getString("headsign"),
                        rs.getObject("direction_id") == null ? null : rs.getInt("direction_id"),
                        rs.getInt("day_offset"), rs.getInt("eff")),
                todayPart ? patternId : none, stopId, day.unrestricted(), services, ready,
                todayPart ? none : patternId, stopId, day.unrestricted(), services, ready, CANDIDATES);
    }

    private List<TimedStop> stops(UUID tripId) {
        List<TimedStop> stops = new ArrayList<>();
        jdbc.query(TRIP_STOPS, rs -> {
            stops.add(new TimedStop(stops.size(), rs.getObject("stop_id", UUID.class), rs.getInt("stop_sequence"),
                    rs.getObject("arrival_seconds") == null ? null : rs.getInt("arrival_seconds"),
                    rs.getObject("departure_seconds") == null ? null : rs.getInt("departure_seconds")));
        }, tripId);
        return stops;
    }

    @Override
    public Optional<List<double[]>> shape(UUID shapeId) {
        if (shapeId == null) {
            return Optional.empty();
        }
        List<double[]> points = jdbc.query(SHAPE, (rs, row) -> new double[] {rs.getDouble("lat"), rs.getDouble("lon")}, shapeId);
        return points.size() < 2 ? Optional.empty() : Optional.of(points);
    }

    private static String uuidArray(Set<UUID> ids) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (UUID id : ids) {
            sb.append(first ? "" : ",").append(id);
            first = false;
        }
        return sb.append('}').toString();
    }
}
