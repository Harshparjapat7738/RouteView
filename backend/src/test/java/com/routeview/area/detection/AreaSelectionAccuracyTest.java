package com.routeview.area.detection;

import static com.routeview.area.detection.CandidateFactory.candidate;
import static com.routeview.area.detection.CandidateFactory.nearOnly;
import static com.routeview.area.detection.CandidateFactory.withEnds;
import static com.routeview.area.detection.CandidateFactory.withInterior;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.routeview.area.model.AreaType;

/** Accuracy rules of the selection policy: relevance per type, duplicates, hierarchy, start/end, explainability. */
class AreaSelectionAccuracyTest {

    private final AreaSelectionPolicy policy = new AreaSelectionPolicy(AreaDetectionProperties.defaults());

    private static List<String> names(List<DetectedArea> areas) {
        return areas.stream().map(DetectedArea::name).toList();
    }

    private static RouteAreaCandidate c(String name, AreaType type, double entry, double inside, double size) {
        return candidate(UUID.nameUUIDFromBytes((name + entry).getBytes()), name, type, entry, entry + inside, inside, size);
    }

    // ---- relevance ---------------------------------------------------------------------------------------

    @Test
    void aTinyIntersectionIsNotAStop() {
        assertTrue(policy.select(List.of(c("Tiny", AreaType.TOWN, 5000, 20, 4000))).isEmpty());
    }

    @Test
    void aMeaningfulIntersectionIsAStop() {
        assertEquals(List.of("Meaningful"), names(policy.select(List.of(c("Meaningful", AreaType.TOWN, 5000, 900, 4000)))));
    }

    @Test
    void theRequirementDependsOnTheAreaType() {
        // 150 m of route: enough for a small sector, not for a city of the same crossing.
        List<DetectedArea> result = policy.select(List.of(
                c("Small Sector", AreaType.SECTOR, 3000, 150, 900),
                c("Big City", AreaType.CITY, 9000, 150, 12000)));
        assertEquals(List.of("Small Sector"), names(result));
    }

    @Test
    void aSmallLocalityAndSectorNeedOnlyAShortCrossing() {
        List<DetectedArea> result = policy.select(List.of(
                c("Little Locality", AreaType.LOCALITY, 3000, 70, 150),
                c("Little Sector", AreaType.SECTOR, 6000, 70, 150)));
        assertEquals(List.of("Little Locality", "Little Sector"), names(result));
    }

    @Test
    void aLargeDistrictIsNotAutomaticallyAStopButAFallbackWhenNothingFinerExists() {
        assertEquals(List.of("Wide District"), names(policy.select(List.of(c("Wide District", AreaType.DISTRICT, 0, 20000, 60000)))));
        // Only 2 km of a district is not a crossing worth showing.
        assertTrue(policy.select(List.of(c("Wide District", AreaType.DISTRICT, 0, 2000, 60000))).isEmpty());
    }

    @Test
    void aNearbyNeighbourTheRouteNeverEntersIsRejected() {
        RouteAreaCandidate neighbour = candidate(UUID.randomUUID(), "Neighbour", AreaType.VILLAGE, 4000, 4000, 0, 1500);
        SelectionResult result = policy.evaluate(List.of(neighbour));
        assertTrue(result.areas().isEmpty());
        assertEquals(SelectionVerdict.NOT_CROSSED, result.decisions().get(0).verdict());
    }

    @Test
    void routeRunningAlongABorderOrOnlyGrazingIsNotACrossing() {
        // 2 km "inside" the area, but all of it within the border band (interior 0) -> boundary hugging.
        RouteAreaCandidate hugging = withInterior(c("Hugged", AreaType.TOWN, 4000, 2000, 4000), 0);
        // 300 m inside, of which only 40 m are genuine interior -> below the town requirement.
        RouteAreaCandidate grazing = withInterior(c("Grazed", AreaType.TOWN, 9000, 300, 4000), 40);
        SelectionResult result = policy.evaluate(List.of(hugging, grazing));
        assertTrue(result.areas().isEmpty());
        assertEquals(SelectionVerdict.NOT_CROSSED, result.decisions().get(0).verdict());
        assertEquals(SelectionVerdict.BELOW_MINIMUM_INTERSECTION, result.decisions().get(1).verdict());
    }

    @Test
    void configuredThresholdsChangeTheResult() {
        AreaDetectionProperties strict = new AreaDetectionProperties(0, 0, 0, 0, null, null, null, 0,
                Map.of(AreaType.TOWN, 2000.0), null, -1);
        assertTrue(new AreaSelectionPolicy(strict).select(List.of(c("Town", AreaType.TOWN, 5000, 900, 9000))).isEmpty());
        assertEquals(1, policy.select(List.of(c("Town", AreaType.TOWN, 5000, 900, 9000))).size());
    }

    // ---- ordering ----------------------------------------------------------------------------------------

    @Test
    void orderFollowsTheRouteForReverseAlphabeticalAndMultipleVisits() {
        UUID visitedTwice = UUID.randomUUID();
        List<RouteAreaCandidate> input = new ArrayList<>(List.of(
                c("Zulu", AreaType.VILLAGE, 1000, 900, 2000),
                c("Yankee", AreaType.TOWN, 6000, 900, 4000),
                candidate(visitedTwice, "Xray", AreaType.VILLAGE, 9000, 9700, 700, 2000),
                candidate(visitedTwice, "Xray", AreaType.VILLAGE, 14000, 14700, 700, 2000),
                c("Alpha", AreaType.CITY, 16000, 3000, 9000)));
        Collections.reverse(input);

        List<DetectedArea> result = policy.select(input);

        assertEquals(List.of("Zulu", "Yankee", "Xray", "Alpha"), names(result));
        assertEquals(9000, result.get(2).distanceFromRouteStartMeters());
    }

    // ---- duplicates --------------------------------------------------------------------------------------

    @Test
    void duplicateRecordsOfOnePlaceAreOneStopAndTheSameAreaIdIsMerged() {
        UUID id = UUID.randomUUID();
        List<DetectedArea> result = policy.select(List.of(
                candidate(id, "Dup", AreaType.TOWN, 5000, 5900, 900, 4000),
                candidate(id, "Dup", AreaType.TOWN, 5000, 5900, 900, 4000),
                c("Dup", AreaType.TOWN, 5100, 800, 4000)));
        assertEquals(1, result.size());
    }

    @Test
    void sameNameDifferentIdsOnDifferentStretchesStayDistinct() {
        List<DetectedArea> result = policy.select(List.of(
                c("Twin", AreaType.VILLAGE, 2000, 600, 2000),
                c("Twin", AreaType.VILLAGE, 12000, 600, 2000)));
        assertEquals(2, result.size());
        assertTrue(result.get(0).areaId() != result.get(1).areaId());
    }

    // ---- hierarchy ---------------------------------------------------------------------------------------

    @Test
    void cityLocalitiesAndSectorsStayVisibleTogether() {
        List<DetectedArea> result = policy.select(List.of(
                c("Metro", AreaType.CITY, 3000, 12000, 30000),
                c("Old Locality", AreaType.LOCALITY, 4000, 800, 1500),
                c("Sector 88", AreaType.SECTOR, 9000, 900, 1200)));
        assertEquals(List.of("Metro", "Old Locality", "Sector 88"), names(result));
    }

    @Test
    void districtAndMunicipalityAreSuppressedByFinerAreasAndTheReasonIsRecorded() {
        SelectionResult result = policy.evaluate(List.of(
                c("Wide District", AreaType.DISTRICT, 0, 20000, 60000),
                c("Wide Municipality", AreaType.MUNICIPALITY, 0, 19000, 30000),
                c("Metro", AreaType.CITY, 2000, 9000, 20000)));
        assertEquals(List.of("Metro"), names(result.areas()));
        assertEquals(2L, result.countsByVerdict().get(SelectionVerdict.COVERED_BY_FINER_AREA));
    }

    @Test
    void hierarchyFilteringCanBeSwitchedOff() {
        AreaDetectionProperties off = new AreaDetectionProperties(0, 0, 0, 0, null, null, null, 0, null, false, -1);
        List<DetectedArea> result = new AreaSelectionPolicy(off).select(List.of(
                c("Wide District", AreaType.DISTRICT, 0, 20000, 60000),
                c("Metro", AreaType.CITY, 2000, 9000, 20000)));
        assertEquals(List.of("Wide District", "Metro"), names(result));
    }

    // ---- start / destination -----------------------------------------------------------------------------

    @Test
    void startAndDestinationInsideTheSameAreaGiveOneStop() {
        UUID id = UUID.randomUUID();
        RouteAreaCandidate both = new RouteAreaCandidate(id, "Home Town", AreaType.TOWN, 0, 19999, 19999, 19999, 5000,
                true, true, true, true, CandidateFactory.ROUTE_LENGTH, 28.4, 77.3);
        List<DetectedArea> result = policy.select(List.of(both));
        assertEquals(1, result.size());
        assertEquals(0.0, result.get(0).positionAlongRoute(), 0);
    }

    @Test
    void anAreaOnlyNearTheEndWithoutTouchingTheRouteIsNotAStop() {
        RouteAreaCandidate beside = nearOnly(candidate(UUID.randomUUID(), "Next Door", AreaType.VILLAGE, 19990, 19990, 0, 1500), false, true);
        assertTrue(policy.select(List.of(beside)).isEmpty());
        // ...but one the route end touches is the destination's area.
        RouteAreaCandidate touching = nearOnly(candidate(UUID.randomUUID(), "End Area", AreaType.VILLAGE, 19950, 19990, 40, 1500), false, true);
        assertEquals(List.of("End Area"), names(policy.select(List.of(touching))));
    }

    @Test
    void startInsideAnAreaIsFirstWithPositionZero() {
        RouteAreaCandidate start = withEnds(c("Start Area", AreaType.VILLAGE, 0, 30, 1500), true, false);
        List<DetectedArea> result = policy.select(List.of(c("Later", AreaType.TOWN, 5000, 900, 3000), start));
        assertEquals(List.of("Start Area", "Later"), names(result));
    }

    // ---- independent routes / counts ---------------------------------------------------------------------

    @Test
    void routesAreEvaluatedIndependentlyAndAnEmptyRouteIsValid() {
        List<DetectedArea> first = policy.select(List.of(c("Only On First", AreaType.TOWN, 5000, 900, 3000)));
        List<DetectedArea> second = policy.select(List.of());
        assertEquals(1, first.size());
        assertTrue(second.isEmpty());
    }

    @Test
    void aRouteWithManyAreasKeepsEveryStopInOrder() {
        List<RouteAreaCandidate> many = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            many.add(c("Place " + i, AreaType.VILLAGE, 400.0 * i, 250, 1500));
        }
        Collections.shuffle(many, new java.util.Random(7));
        List<DetectedArea> result = policy.select(many);
        assertEquals(40, result.size());
        for (int i = 1; i < result.size(); i++) {
            assertTrue(result.get(i).distanceFromRouteStartMeters() > result.get(i - 1).distanceFromRouteStartMeters());
            assertEquals(i + 1, result.get(i).sequence());
        }
    }
}
