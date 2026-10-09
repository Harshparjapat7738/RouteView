package com.routeview.area;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.routeview.area.model.Area;
import com.routeview.area.model.AreaType;
import com.routeview.area.repository.AreaRepository;
import com.routeview.spatial.SpatialReference;

/**
 * Checks the database foundation against a real PostgreSQL/PostGIS (see backend/docker-compose.yml).
 * Skipped unless ROUTEVIEW_DB_TESTS=true, so {@code gradlew build} works without a database.
 * Run: start the database, set POSTGRES_PASSWORD (and ROUTEVIEW_DB_TESTS=true) and run {@code gradlew test}.
 * Every test rolls back, so no data is left behind.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@EnabledIfEnvironmentVariable(named = "ROUTEVIEW_DB_TESTS", matches = "true")
class AreaDatabaseFoundationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AreaRepository areaRepository;

    @Test
    void postgisExtensionIsInstalled() {
        Integer installed = jdbc.queryForObject("select count(*) from pg_extension where extname = 'postgis'", Integer.class);
        assertEquals(1, installed);
        assertNotNull(jdbc.queryForObject("select postgis_version()", String.class));
    }

    @Test
    void migrationsRanSuccessfully() {
        Integer failed = jdbc.queryForObject("select count(*) from flyway_schema_history where not success", Integer.class);
        Integer applied = jdbc.queryForObject("select count(*) from flyway_schema_history where success", Integer.class);
        assertEquals(0, failed);
        assertTrue(applied >= 2);
    }

    @Test
    void areaGeometryColumnsUseSrid4326() {
        Integer srid = jdbc.queryForObject(
                "select srid from geometry_columns where f_table_name = 'area' and f_geometry_column = 'geometry'",
                Integer.class);
        assertEquals(SpatialReference.WGS84_SRID, srid);
    }

    @Test
    void areaCanBeSavedAndReadBackWithItsGeometry() throws ParseException {
        MultiPolygon boundary = (MultiPolygon) new WKTReader(SpatialReference.geometryFactory())
                .read("MULTIPOLYGON(((77 28, 77.1 28, 77.1 28.1, 77 28.1, 77 28)))");
        boundary.setSRID(SpatialReference.WGS84_SRID);

        Area saved = areaRepository.saveAndFlush(new Area("Test Sector", AreaType.SECTOR, boundary, "test"));

        Area found = areaRepository.findById(saved.getId()).orElseThrow();
        assertEquals(AreaType.SECTOR, found.getAreaType());
        assertEquals(SpatialReference.WGS84_SRID, found.getGeometry().getSRID());
        assertTrue(found.getGeometry().equalsExact(boundary));
    }
}
