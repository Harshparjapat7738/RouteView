package com.routeview.area.quality;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class AreaQualityReportTest {

    private static AreaQualityReport report(long brokenParents, boolean index) {
        Map<String, Long> problems = new LinkedHashMap<>();
        problems.put("invalid geometry", 0L);
        problems.put("parent reference missing", brokenParents);
        return new AreaQualityReport(5, new LinkedHashMap<>(Map.of("VILLAGE", 3L)), new LinkedHashMap<>(Map.of("openstreetmap", 5L)), problems, index);
    }

    @Test
    void aCleanReportIsClean() {
        AreaQualityReport report = report(0, true);
        assertTrue(report.clean());
        assertEquals(0, report.problemCount());
        assertTrue(report.format().contains("Result             : clean"));
    }

    @Test
    void problemsAndAMissingIndexAreCountedAndMarked() {
        AreaQualityReport report = report(2, false);
        assertFalse(report.clean());
        assertEquals(3, report.problemCount());
        String text = report.format();
        assertTrue(text.contains("MISSING"));
        assertTrue(text.contains("parent reference missing") && text.contains("<--"));
    }

    @Test
    void theReportShowsCoverageByTypeAndSource() {
        String text = report(0, true).format();
        assertTrue(text.contains("VILLAGE") && text.contains("openstreetmap") && text.contains("Total areas        : 5"));
    }
}
