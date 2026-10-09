package com.routeview.area.detection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.routeview.route.model.Route;
import com.routeview.spatial.TestPolylines;

/**
 * Runs the whole Area Detection Engine, including the PostGIS query, against a real PostgreSQL/PostGIS.
 * Skipped unless ROUTEVIEW_DB_TESTS=true (see backend/docker-compose.yml). Every test rolls back.
 *
 * <p>The rectangles below are geometry placed around a straight west-to-east route on the equator in the open
 * Atlantic (0.001 degrees is roughly 111 m), so they can never meet imported real areas. They exist only inside
 * the rolled-back transaction.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@EnabledIfEnvironmentVariable(named = "ROUTEVIEW_DB_TESTS", matches = "true")
class AreaDetectionDatabaseTest {

    private static final String ROUTE = TestPolylines.encode(0.0, -30.00, 0.0, -29.90, 0.0, -29.80);

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AreaDetector detector;

    private void area(String name, String type, double west, double south, double east, double north) {
        jdbc.update(
                "insert into area (name, area_type, geometry, source, source_id) values (?, ?, "
                        + "ST_Multi(ST_MakeEnvelope(?, ?, ?, ?, 4326)), 'detection-test', gen_random_uuid()::text)",
                name, type, west, south, east, north);
    }

    @Test
    void detectsRelevantAreasInTravelOrderOnRealPostgis() {
        // Inserted in an order that is neither route order nor alphabetical.
        area("Area East", "CITY", -29.83, -0.01, -29.79, 0.01);
        area("Area West", "VILLAGE", -30.01, -0.01, -29.97, 0.01);
        area("Area Middle", "TOWN", -29.92, -0.01, -29.88, 0.01);
        // about 22 m north of the route: inside the 30 m tolerance, but the route never enters it.
        area("Area Beside", "LOCALITY", -29.95, 0.0002, -29.94, 0.01);
        // Far away from the route.
        area("Area Far", "LOCALITY", -29.95, 0.02, -29.94, 0.03);
        // Covers the whole route, but is a broad container while finer areas exist.
        area("Area Wide", "DISTRICT", -30.1, -0.1, -29.7, 0.1);
        // Not a selectable area type.
        area("Area Other", "OTHER", -29.96, -0.01, -29.93, 0.01);

        List<DetectedArea> areas = detector.detectAreas(new Route("r", 0, 22_000, 1800, ROUTE, ""));

        assertEquals(List.of("Area West", "Area Middle", "Area East"), areas.stream().map(DetectedArea::name).toList());
        assertEquals(List.of(1, 2, 3), areas.stream().map(DetectedArea::sequence).toList());
        assertTrue(areas.get(0).positionAlongRoute() < areas.get(1).positionAlongRoute());
        assertTrue(areas.get(1).positionAlongRoute() < areas.get(2).positionAlongRoute());
        assertEquals(0, areas.get(0).distanceFromRouteStartMeters());
    }

    private void multiArea(String name, String type, String wkt) {
        jdbc.update(
                "insert into area (name, area_type, geometry, source, source_id) values (?, ?, "
                        + "ST_Multi(ST_GeomFromText(?, 4326)), 'detection-test', gen_random_uuid()::text)",
                name, type, wkt);
    }

    private List<DetectedArea> detect() {
        return detector.detectAreas(new Route("r", 0, 22_000, 1800, ROUTE, ""));
    }

    @Test
    void anAreaEnteredTwiceIsReportedOnceAtItsFirstVisit() {
        // One area made of two separate parts: the route visits it twice.
        multiArea("Area Split", "VILLAGE",
                "MULTIPOLYGON(((-29.88 -0.01, -29.86 -0.01, -29.86 0.01, -29.88 0.01, -29.88 -0.01)),"
                        + "((-29.98 -0.01, -29.96 -0.01, -29.96 0.01, -29.98 0.01, -29.98 -0.01)))");

        List<DetectedArea> areas = detect();

        assertEquals(1, areas.size());
        assertEquals("Area Split", areas.get(0).name());
        // First visit starts about 0.02 degrees (2.2 km) after the route start.
        assertTrue(areas.get(0).distanceFromRouteStartMeters() > 1900 && areas.get(0).distanceFromRouteStartMeters() < 2500);
    }

    @Test
    void twoDifferentAreasWithTheSameNameAreTwoStops() {
        area("Area Twin", "VILLAGE", -29.98, -0.01, -29.96, 0.01);
        area("Area Twin", "VILLAGE", -29.88, -0.01, -29.86, 0.01);

        assertEquals(List.of("Area Twin", "Area Twin"), detect().stream().map(DetectedArea::name).toList());
    }

    @Test
    void aRoadAlongASharedBorderDoesNotMakeEitherNeighbourAStop() {
        // The border of both rectangles is the route itself (y = 0).
        area("Area Above", "TOWN", -29.95, 0.0, -29.90, 0.01);
        area("Area Below", "TOWN", -29.95, -0.01, -29.90, 0.0);
        area("Area Real", "TOWN", -29.85, -0.01, -29.82, 0.01);

        assertEquals(List.of("Area Real"), detect().stream().map(DetectedArea::name).toList());
    }

    @Test
    void aCornerGrazeAndAnAreaMerelyTouchingTheRouteAreNotStops() {
        // Clips only the south-west corner: a 9 m high sliver of the route inside.
        area("Area Corner", "TOWN", -29.95, -0.0002, -29.9499, 0.01);
        // Touches the route at a single boundary point.
        multiArea("Area Touch", "TOWN", "POLYGON((-29.93 0, -29.92 0.01, -29.94 0.01, -29.93 0))");

        assertTrue(detect().isEmpty());
    }

    @Test
    void anAreaContainingTheRouteStartIsStopOneEvenIfTheRouteLeavesQuickly() {
        area("Area Start", "VILLAGE", -30.0005, -0.01, -29.9996, 0.01);
        area("Area Next", "TOWN", -29.92, -0.01, -29.88, 0.01);

        List<DetectedArea> areas = detect();

        assertEquals(List.of("Area Start", "Area Next"), areas.stream().map(DetectedArea::name).toList());
        assertEquals(0.0, areas.get(0).positionAlongRoute(), 1e-9);
    }

    @Test
    void aRouteWithNoAreasIsValid() {
        assertTrue(detector.detectAreas(new Route("r", 0, 22_000, 1800, ROUTE, "")).isEmpty());
    }
}
