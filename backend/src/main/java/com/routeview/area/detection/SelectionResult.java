package com.routeview.area.detection;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The journey areas of a route plus the reason every candidate was kept or dropped.
 *
 * @param areas     the ordered journey areas
 * @param decisions one entry per candidate considered (accepted ones appear with an accepted verdict only if they
 *                  survived every stage; later stages can still turn an accepted candidate into a rejection)
 */
public record SelectionResult(List<DetectedArea> areas, List<SelectionDecision> decisions) {

    public static SelectionResult empty() {
        return new SelectionResult(List.of(), List.of());
    }

    public Map<SelectionVerdict, Long> countsByVerdict() {
        Map<SelectionVerdict, Long> counts = new EnumMap<>(SelectionVerdict.class);
        for (SelectionDecision decision : decisions) {
            counts.merge(decision.verdict(), 1L, Long::sum);
        }
        return counts;
    }
}
