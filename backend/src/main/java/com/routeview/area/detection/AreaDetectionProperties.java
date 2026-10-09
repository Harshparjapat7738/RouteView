package com.routeview.area.detection;

import java.util.EnumSet;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;

import com.routeview.area.model.AreaType;

/**
 * Tunable rules of the Area Detection Engine, bound from {@code routeview.area-detection.*}.
 *
 * @param toleranceMeters           how far from the route an area may be to count as a candidate; also how close the
 *                                  route start/end must be to an area to be associated with it (absorbs GPS and
 *                                  provider inaccuracy)
 * @param minCrossingMeters         route length an area must contain to count as passed through
 * @param minCrossingFloorMeters    lower bound of that requirement for small areas
 * @param minCrossingFractionOfSize for small areas the requirement is this fraction of the area's size
 * @param selectableTypes           area types that may become journey stops
 * @param containerTypes            broad administrative types that are only shown when no finer area covers the same stretch
 * @param typePriority              when areas of the same name overlap, the type earlier in this list wins
 * @param maxRouteVertices          largest accepted route geometry
 * @param minimumIntersectionByAreaType per-type override of {@code minCrossingMeters} (the most route length an area of
 *                                  that type must contain); a city needs more than a sector. Missing types use the global value
 * @param hierarchyFilteringEnabled hide broad {@code containerTypes} where finer areas exist (default true)
 * @param boundaryBandMeters        route running within this distance of an area's border does not count as being inside it
 *                                  (a road along a shared boundary must not make both neighbours journey stops)
 */
@ConfigurationProperties(prefix = "routeview.area-detection")
public record AreaDetectionProperties(
        double toleranceMeters,
        double minCrossingMeters,
        double minCrossingFloorMeters,
        double minCrossingFractionOfSize,
        List<AreaType> selectableTypes,
        List<AreaType> containerTypes,
        List<AreaType> typePriority,
        int maxRouteVertices,
        Map<AreaType, Double> minimumIntersectionByAreaType,
        Boolean hierarchyFilteringEnabled,
        double boundaryBandMeters) {

    public static final double DEFAULT_TOLERANCE_METERS = 30;
    public static final double DEFAULT_MIN_CROSSING_METERS = 250;
    public static final double DEFAULT_MIN_CROSSING_FLOOR_METERS = 60;
    public static final double DEFAULT_MIN_CROSSING_FRACTION_OF_SIZE = 0.25;
    public static final int DEFAULT_MAX_ROUTE_VERTICES = 100_000;
    public static final double DEFAULT_BOUNDARY_BAND_METERS = 12;
    /** Largest requirement per type (metres of route inside the area). Villages and sectors are small, cities big. */
    static final Map<AreaType, Double> DEFAULT_BY_TYPE = Map.of(
            AreaType.CITY, 500.0, AreaType.TOWN, 350.0, AreaType.VILLAGE, 200.0, AreaType.LOCALITY, 150.0,
            AreaType.SUBURB, 200.0, AreaType.SECTOR, 120.0, AreaType.MUNICIPALITY, 1500.0, AreaType.DISTRICT, 3000.0);
    static final List<AreaType> DEFAULT_SELECTABLE = List.of(
            AreaType.VILLAGE, AreaType.TOWN, AreaType.CITY, AreaType.LOCALITY,
            AreaType.SUBURB, AreaType.SECTOR, AreaType.MUNICIPALITY, AreaType.DISTRICT);
    static final List<AreaType> DEFAULT_CONTAINERS = List.of(AreaType.MUNICIPALITY, AreaType.DISTRICT);
    static final List<AreaType> DEFAULT_PRIORITY = List.of(
            AreaType.CITY, AreaType.TOWN, AreaType.VILLAGE, AreaType.SECTOR,
            AreaType.SUBURB, AreaType.LOCALITY, AreaType.MUNICIPALITY, AreaType.DISTRICT, AreaType.OTHER);

    public AreaDetectionProperties {
        toleranceMeters = positiveOrDefault(toleranceMeters, DEFAULT_TOLERANCE_METERS);
        minCrossingMeters = positiveOrDefault(minCrossingMeters, DEFAULT_MIN_CROSSING_METERS);
        minCrossingFloorMeters = positiveOrDefault(minCrossingFloorMeters, DEFAULT_MIN_CROSSING_FLOOR_METERS);
        if (minCrossingFloorMeters > minCrossingMeters) {
            throw new IllegalArgumentException("min-crossing-floor-meters must not exceed min-crossing-meters.");
        }
        minCrossingFractionOfSize = positiveOrDefault(minCrossingFractionOfSize, DEFAULT_MIN_CROSSING_FRACTION_OF_SIZE);
        selectableTypes = selectableTypes == null || selectableTypes.isEmpty() ? DEFAULT_SELECTABLE : List.copyOf(selectableTypes);
        containerTypes = containerTypes == null ? DEFAULT_CONTAINERS : List.copyOf(containerTypes);
        typePriority = typePriority == null || typePriority.isEmpty() ? DEFAULT_PRIORITY : List.copyOf(typePriority);
        maxRouteVertices = maxRouteVertices <= 0 ? DEFAULT_MAX_ROUTE_VERTICES : maxRouteVertices;
        Map<AreaType, Double> byType = new EnumMap<>(AreaType.class);
        byType.putAll(DEFAULT_BY_TYPE);
        if (minimumIntersectionByAreaType != null) {
            minimumIntersectionByAreaType.forEach((type, meters) -> {
                if (type != null && meters != null && Double.isFinite(meters) && meters > 0) {
                    byType.put(type, meters);
                }
            });
        }
        minimumIntersectionByAreaType = Map.copyOf(byType);
        hierarchyFilteringEnabled = hierarchyFilteringEnabled == null || hierarchyFilteringEnabled;
        boundaryBandMeters = Double.isFinite(boundaryBandMeters) && boundaryBandMeters >= 0
                ? boundaryBandMeters : DEFAULT_BOUNDARY_BAND_METERS;
    }

    public static AreaDetectionProperties defaults() {
        return new AreaDetectionProperties(0, 0, 0, 0, null, null, null, 0, null, null, -1);
    }

    public Set<AreaType> selectableTypeSet() {
        return selectableTypes.isEmpty() ? EnumSet.noneOf(AreaType.class) : EnumSet.copyOf(selectableTypes);
    }

    /** Rank of a type in {@link #typePriority}; lower wins. Types not listed rank last. */
    int priorityOf(AreaType type) {
        int index = typePriority.indexOf(type);
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    /** Route length (metres) an area of this type and size must contain to count as passed through. */
    double requiredIntersectionMeters(AreaType type, double sizeMeters) {
        double cap = minimumIntersectionByAreaType.getOrDefault(type, minCrossingMeters);
        return Math.min(cap, Math.max(minCrossingFloorMeters, sizeMeters * minCrossingFractionOfSize));
    }

    boolean isContainer(AreaType type) {
        return containerTypes.contains(type);
    }

    private static double positiveOrDefault(double value, double fallback) {
        return Double.isFinite(value) && value > 0 ? value : fallback;
    }
}
