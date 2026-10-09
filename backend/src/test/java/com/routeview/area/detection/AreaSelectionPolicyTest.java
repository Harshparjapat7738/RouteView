package com.routeview.area.detection;

import static com.routeview.area.detection.CandidateFactory.candidate;
import static com.routeview.area.detection.CandidateFactory.withEnds;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.routeview.area.model.AreaType;

class AreaSelectionPolicyTest {

    private final AreaSelectionPolicy policy = new AreaSelectionPolicy(AreaDetectionProperties.defaults());

    private static List<String> names(List<DetectedArea> areas) {
        return areas.stream().map(DetectedArea::name).toList();
    }

    @Test
    void simpleRouteReturnsAreasInTravelOrderWithSequenceAndPosition() {
        List<DetectedArea> result = policy.select(List.of(
                candidate("Area A", AreaType.VILLAGE, 0, 1200),
                candidate("Area B", AreaType.TOWN, 6000, 3000),
                candidate("Area C", AreaType.CITY, 14000, 5000)));

        assertEquals(List.of("Area A", "Area B", "Area C"), names(result));
        assertEquals(List.of(1, 2, 3), result.stream().map(DetectedArea::sequence).toList());
        assertEquals(0.0, result.get(0).positionAlongRoute(), 1e-9);
        assertEquals(0.3, result.get(1).positionAlongRoute(), 1e-9);
        assertEquals(0.7, result.get(2).positionAlongRoute(), 1e-9);
        assertEquals(6000, result.get(1).distanceFromRouteStartMeters());
    }

    @Test
    void orderFollowsTheRouteNotTheOrderTheDatabaseReturned() {
        List<RouteAreaCandidate> shuffled = new ArrayList<>(List.of(
                candidate("Zeta", AreaType.VILLAGE, 1000, 900),
                candidate("Alpha", AreaType.TOWN, 12000, 900),
                candidate("Mid", AreaType.LOCALITY, 7000, 900),
                candidate("Beta", AreaType.SECTOR, 16000, 900)));
        Collections.reverse(shuffled);

        List<DetectedArea> result = policy.select(shuffled);

        // Neither alphabetical (Alpha first) nor input order: strictly by distance along the route.
        assertEquals(List.of("Zeta", "Mid", "Alpha", "Beta"), names(result));
        for (int i = 1; i < result.size(); i++) {
            assertTrue(result.get(i).positionAlongRoute() > result.get(i - 1).positionAlongRoute());
        }
    }

    @Test
    void anAreaTheRouteLeavesAndReEntersAppearsOnceAtItsFirstEntry() {
        UUID tigaon = UUID.randomUUID();
        List<DetectedArea> result = policy.select(List.of(
                candidate(tigaon, "Area T", AreaType.VILLAGE, 8000, 8600, 600, 1500),
                candidate(tigaon, "Area T", AreaType.VILLAGE, 3000, 3500, 500, 1500),
                candidate("Area N", AreaType.TOWN, 5000, 1000)));

        assertEquals(List.of("Area T", "Area N"), names(result));
        assertEquals(3000, result.get(0).distanceFromRouteStartMeters());
        assertEquals(1100, result.get(0).distanceInsideAreaMeters());
    }

    @Test
    void sameNameAndTypeOnTheSameStretchIsOneStopButOnDifferentStretchesTwo() {
        // Overlapping stretches: the same place recorded twice (duplicate import) -> one stop.
        List<DetectedArea> duplicate = policy.select(List.of(
                candidate("Area T", AreaType.VILLAGE, 3000, 500),
                candidate("area  t", AreaType.VILLAGE, 3200, 500)));
        assertEquals(1, duplicate.size());

        // Far apart: two different villages that happen to share a name stay separate.
        List<DetectedArea> twoPlaces = policy.select(List.of(
                candidate("Area T", AreaType.VILLAGE, 3000, 500),
                candidate("Area T", AreaType.VILLAGE, 12000, 500)));
        assertEquals(2, twoPlaces.size());
        assertEquals(3000, twoPlaces.get(0).distanceFromRouteStartMeters());
    }

    @Test
    void sameNameInSeveralAdministrativeTypesIsOneCityStop() {
        List<DetectedArea> result = policy.select(List.of(
                candidate("Area F", AreaType.DISTRICT, 2000, 15000),
                candidate("Area F", AreaType.MUNICIPALITY, 3000, 12000),
                candidate("Area F", AreaType.CITY, 4000, 10000)));

        assertEquals(1, result.size());
        assertEquals(AreaType.CITY, result.get(0).areaType());
        assertEquals(4000, result.get(0).distanceFromRouteStartMeters());
    }

    @Test
    void broadContainersAreHiddenWhereFinerAreasExistButKeptAsFallback() {
        List<DetectedArea> covered = policy.select(List.of(
                candidate("Wide District", AreaType.DISTRICT, 0, 20000),
                candidate("Wide Municipality", AreaType.MUNICIPALITY, 0, 20000),
                candidate("Area V", AreaType.VILLAGE, 1000, 800),
                candidate("Area S", AreaType.SECTOR, 9000, 800)));
        assertEquals(List.of("Area V", "Area S"), names(covered));

        List<DetectedArea> fallback = policy.select(List.of(candidate("Wide District", AreaType.DISTRICT, 0, 20000)));
        assertEquals(List.of("Wide District"), names(fallback));
    }

    @Test
    void anAreaThatIsOnlyCloseByIsExcluded() {
        RouteAreaCandidate grazed = candidate(UUID.randomUUID(), "Grazed", AreaType.TOWN, 5000, 5000, 0, 4000);
        RouteAreaCandidate clipped = candidate(UUID.randomUUID(), "Clipped", AreaType.TOWN, 7000, 7100, 100, 5000);
        RouteAreaCandidate crossed = candidate(UUID.randomUUID(), "Crossed", AreaType.TOWN, 9000, 9900, 900, 5000);

        assertEquals(List.of("Crossed"), names(policy.select(List.of(grazed, clipped, crossed))));
    }

    @Test
    void theCrossingRequirementShrinksForSmallAreas() {
        RouteAreaCandidate smallHamlet = candidate(UUID.randomUUID(), "Small Hamlet", AreaType.VILLAGE, 5000, 5080, 80, 200);
        RouteAreaCandidate bigTownSameCrossing = candidate(UUID.randomUUID(), "Big Town", AreaType.TOWN, 7000, 7080, 80, 6000);

        assertEquals(List.of("Small Hamlet"), names(policy.select(List.of(smallHamlet, bigTownSameCrossing))));
    }

    @Test
    void noCandidatesGiveAnEmptyResult() {
        assertTrue(policy.select(List.of()).isEmpty());
        assertTrue(policy.select(null).isEmpty());
    }

    @Test
    void startAndDestinationAreasAreIncludedOnceEach() {
        // The start area is only 40 m long along the route and the destination is just inside tolerance:
        // both count because the route start/end is associated with them.
        RouteAreaCandidate start = withEnds(candidate(UUID.randomUUID(), "Start Area", AreaType.VILLAGE, 0, 40, 40, 1500), true, false);
        RouteAreaCandidate end = withEnds(candidate(UUID.randomUUID(), "End Area", AreaType.CITY, 19990, 19990, 0, 9000), false, true);
        RouteAreaCandidate middle = candidate("Middle", AreaType.TOWN, 9000, 2000);
        // The same start area reported again (e.g. a second polygon fragment) must not duplicate it.
        RouteAreaCandidate startAgain = withEnds(candidate(UUID.randomUUID(), "start area", AreaType.VILLAGE, 0, 30, 30, 1500), true, false);

        List<DetectedArea> result = policy.select(List.of(end, middle, start, startAgain));

        assertEquals(List.of("Start Area", "Middle", "End Area"), names(result));
        assertEquals(0, result.get(0).distanceFromRouteStartMeters());
    }

    @Test
    void impossibleCandidatesAreIgnoredWithoutFailing() {
        UUID id = UUID.randomUUID();
        List<RouteAreaCandidate> candidates = new ArrayList<>();
        candidates.add(null);
        candidates.add(candidate(id, "Not A Number", AreaType.VILLAGE, Double.NaN, 100, 900, 1500));
        candidates.add(candidate(id, "Backwards", AreaType.VILLAGE, 5000, 100, 900, 1500));
        candidates.add(candidate(id, "Beyond Route", AreaType.VILLAGE, 25000, 26000, 900, 1500));
        candidates.add(candidate(id, "  ", AreaType.VILLAGE, 1000, 2000, 900, 1500));
        candidates.add(candidate(id, "Negative", AreaType.VILLAGE, 1000, 2000, -5, 1500));
        candidates.add(candidate("Unselectable", AreaType.OTHER, 3000, 900));
        candidates.add(candidate("Valid", AreaType.VILLAGE, 4000, 900));

        assertEquals(List.of("Valid"), names(policy.select(candidates)));
    }
}
