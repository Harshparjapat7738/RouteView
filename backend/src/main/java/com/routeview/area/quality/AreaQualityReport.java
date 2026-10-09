package com.routeview.area.quality;

import java.util.Map;

/**
 * Result of the area data-quality inspection (developer command {@code gradlew areaQuality}).
 *
 * @param total         number of stored areas
 * @param byType        areas per RouteView area type
 * @param bySource      areas per data source
 * @param problems      name of each check -> number of offending rows; 0 means the check is clean
 * @param spatialIndex  a GiST index on {@code area.geometry} exists
 */
public record AreaQualityReport(
        long total,
        Map<String, Long> byType,
        Map<String, Long> bySource,
        Map<String, Long> problems,
        boolean spatialIndex) {

    public long problemCount() {
        return problems.values().stream().mapToLong(Long::longValue).sum() + (spatialIndex ? 0 : 1);
    }

    public boolean clean() {
        return problemCount() == 0;
    }

    /** Plain-text report: counts only, no geometry and no area names. */
    public String format() {
        StringBuilder out = new StringBuilder("Area data quality\n");
        out.append("  Total areas        : ").append(total).append('\n');
        out.append("  By type            :\n");
        byType.forEach((type, count) -> out.append(String.format("    %-14s %d%n", type, count)));
        out.append("  By source          :\n");
        bySource.forEach((source, count) -> out.append(String.format("    %-14s %d%n", source, count)));
        out.append("  Spatial index      : ").append(spatialIndex ? "present (GiST on geometry)" : "MISSING").append('\n');
        out.append("  Checks (0 = clean) :\n");
        problems.forEach((check, count) -> out.append(String.format("    %-40s %d%s%n", check, count, count == 0 ? "" : "   <--")));
        out.append(clean() ? "  Result             : clean" : "  Result             : " + problemCount() + " problem(s) found");
        return out.toString();
    }
}
