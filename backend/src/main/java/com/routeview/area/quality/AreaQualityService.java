package com.routeview.area.quality;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Read-only inspection of the area table: coverage by type and source, and counts of rows that break the data
 * rules (invalid or unexpected geometry, wrong SRID, missing names or external ids, duplicate identities,
 * broken parent references, probable duplicate records). It changes nothing and is only reachable through the
 * developer command, never over HTTP. The same checks exist as plain SQL in {@code backend/db-tools}.
 */
@Service
public class AreaQualityService {

    private static final Map<String, String> CHECKS = new LinkedHashMap<>();

    static {
        CHECKS.put("invalid geometry", "SELECT count(*) FROM area WHERE NOT ST_IsValid(geometry)");
        CHECKS.put("empty geometry", "SELECT count(*) FROM area WHERE ST_IsEmpty(geometry)");
        CHECKS.put("srid not 4326", "SELECT count(*) FROM area WHERE ST_SRID(geometry) <> 4326");
        CHECKS.put("geometry type not MultiPolygon", "SELECT count(*) FROM area WHERE GeometryType(geometry) <> 'MULTIPOLYGON'");
        CHECKS.put("missing name", "SELECT count(*) FROM area WHERE btrim(name) = ''");
        CHECKS.put("name with stray whitespace", "SELECT count(*) FROM area WHERE name <> btrim(name) OR name ~ '\\s{2,}'");
        CHECKS.put("missing external id", "SELECT count(*) FROM area WHERE source_id IS NULL OR btrim(source_id) = ''");
        CHECKS.put("duplicate source + external id",
                "SELECT count(*) FROM (SELECT 1 FROM area WHERE source_id IS NOT NULL GROUP BY source, source_id HAVING count(*) > 1) d");
        CHECKS.put("parent reference missing",
                "SELECT count(*) FROM area c WHERE c.parent_area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM area p WHERE p.id = c.parent_area_id)");
        CHECKS.put("area is its own parent", "SELECT count(*) FROM area WHERE parent_area_id = id");
        CHECKS.put("parent cycle",
                "WITH RECURSIVE chain(start_id, current_id, depth) AS ("
                        + " SELECT id, parent_area_id, 1 FROM area WHERE parent_area_id IS NOT NULL"
                        + " UNION ALL"
                        + " SELECT c.start_id, a.parent_area_id, c.depth + 1 FROM chain c JOIN area a ON a.id = c.current_id"
                        + " WHERE a.parent_area_id IS NOT NULL AND c.depth < 64)"
                        + " SELECT count(DISTINCT start_id) FROM chain WHERE current_id = start_id");
        CHECKS.put("probable duplicate records",
                "SELECT count(*) FROM area a JOIN area b ON a.id < b.id"
                        + " AND lower(btrim(a.name)) = lower(btrim(b.name)) AND a.area_type = b.area_type"
                        + " AND a.geometry && b.geometry"
                        + " AND ST_Area(ST_Intersection(a.geometry, b.geometry)) > 0.5 * LEAST(ST_Area(a.geometry), ST_Area(b.geometry))");
    }

    private final JdbcTemplate jdbc;

    public AreaQualityService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public AreaQualityReport inspect() {
        Long total = jdbc.queryForObject("SELECT count(*) FROM area", Long.class);
        Map<String, Long> problems = new LinkedHashMap<>();
        CHECKS.forEach((name, sql) -> {
            Long count = jdbc.queryForObject(sql, Long.class);
            problems.put(name, count == null ? 0 : count);
        });
        Long index = jdbc.queryForObject(
                "SELECT count(*) FROM pg_indexes WHERE tablename = 'area' AND indexdef ILIKE '%USING gist (geometry)%'", Long.class);
        return new AreaQualityReport(
                total == null ? 0 : total,
                counts("SELECT area_type AS label, count(*) AS n FROM area GROUP BY area_type ORDER BY area_type"),
                counts("SELECT source AS label, count(*) AS n FROM area GROUP BY source ORDER BY source"),
                problems,
                index != null && index > 0);
    }

    private Map<String, Long> counts(String sql) {
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.query(sql, rs -> {
            result.put(rs.getString("label"), rs.getLong("n"));
        });
        return result;
    }
}
