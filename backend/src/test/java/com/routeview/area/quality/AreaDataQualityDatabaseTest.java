package com.routeview.area.quality;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Database rules of the area table against real PostgreSQL/PostGIS (ROUTEVIEW_DB_TESTS=true; every test rolls back).
 * Geometry lies in the open Atlantic, so it can never meet imported areas. Each test ends with its one failing
 * statement, because PostgreSQL aborts a transaction after an error.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@EnabledIfEnvironmentVariable(named = "ROUTEVIEW_DB_TESTS", matches = "true")
class AreaDataQualityDatabaseTest {

    private static final String SQUARE = "ST_Multi(ST_MakeEnvelope(-30, 0, -29.99, 0.01, 4326))";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AreaQualityService quality;

    private UUID insert(String name, String sourceId, String geometrySql) {
        return jdbc.queryForObject(
                "insert into area (name, area_type, geometry, source, source_id) values (?, 'VILLAGE', " + geometrySql
                        + ", 'quality-test', ?) returning id",
                UUID.class, name, sourceId);
    }

    @Test
    void sameNameForDifferentExternalIdsIsAllowed() {
        insert("Model Town", "1", SQUARE);
        insert("Model Town", "2", SQUARE);
        assertEquals(2, jdbc.queryForObject("select count(*) from area where source = 'quality-test'", Long.class));
    }

    @Test
    void theSameSourceAndExternalIdIsRejected() {
        insert("Model Town", "1", SQUARE);
        assertThrows(DataAccessException.class, () -> insert("Another Name", "1", SQUARE));
    }

    @Test
    void aBlankExternalIdIsRejected() {
        assertThrows(DataAccessException.class, () -> insert("Model Town", "  ", SQUARE));
    }

    @Test
    void aNameWithSurroundingWhitespaceIsRejected() {
        assertThrows(DataAccessException.class, () -> insert(" Model Town ", "1", SQUARE));
    }

    @Test
    void invalidGeometryAndTheWrongSridAreRejected() {
        assertThrows(DataAccessException.class,
                () -> insert("Bow Tie", "1", "ST_Multi(ST_GeomFromText('POLYGON((0 0,1 1,1 0,0 1,0 0))', 4326))"));
    }

    @Test
    void aGeometryInAnotherSridIsRejected() {
        assertThrows(DataAccessException.class, () -> insert("Wrong Srid", "1", "ST_Multi(ST_MakeEnvelope(-30, 0, -29.99, 0.01, 3857))"));
    }

    @Test
    void aParentCycleIsRejectedAndAMissingParentIsFine() {
        UUID a = insert("A", "1", SQUARE);
        UUID b = insert("B", "2", SQUARE);
        jdbc.update("update area set parent_area_id = ? where id = ?", a, b);
        assertEquals(a, jdbc.queryForObject("select parent_area_id from area where id = ?", UUID.class, b));
        assertTrue(jdbc.queryForObject("select parent_area_id is null from area where id = ?", Boolean.class, a));
        assertThrows(DataAccessException.class, () -> jdbc.update("update area set parent_area_id = ? where id = ?", b, a));
    }

    @Test
    void theQualityReportIsCleanForValidDataAndSeesTheSpatialIndex() {
        insert("Model Town", "1", SQUARE);
        AreaQualityReport report = quality.inspect();
        assertTrue(report.spatialIndex());
        assertEquals(0, report.problems().get("invalid geometry"));
        assertEquals(0, report.problems().get("duplicate source + external id"));
        assertEquals(0, report.problems().get("parent cycle"));
    }

    @Test
    void theSpatialIndexIsUsedForCandidateLookups() {
        insert("Model Town", "1", SQUARE);
        jdbc.execute("set local enable_seqscan = off");
        String plan = String.join("\n", jdbc.queryForList(
                "explain select id from area where geometry && ST_MakeEnvelope(-30, 0, -29.99, 0.01, 4326)", String.class));
        assertTrue(plan.contains("area_geometry_gist"), plan);
    }
}
