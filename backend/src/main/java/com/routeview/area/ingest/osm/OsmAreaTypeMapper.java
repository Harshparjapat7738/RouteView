package com.routeview.area.ingest.osm;

import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.routeview.area.ingest.SkipReason;
import com.routeview.area.model.AreaType;

/**
 * The single place that decides whether an OpenStreetMap object is a geographical area and which
 * {@link AreaType} it becomes. Documented in docs/area-import.md; change the rules here only.
 *
 * <p>Order of the rules:
 * <ol>
 *   <li>Objects tagged as POIs, buildings, roads, railways, ... are never areas.</li>
 *   <li>A {@code place=*} tag decides the type (see {@link #PLACE_TYPES}); unknown places are skipped.</li>
 *   <li>Without {@code place}, {@code boundary=administrative} decides by {@code admin_level}
 *       (see {@link #ADMIN_LEVEL_TYPES}); other levels are skipped.</li>
 *   <li>Anything else is skipped.</li>
 * </ol>
 * A suburb/neighbourhood/locality named "Sector 88" is classified as {@link AreaType#SECTOR}.
 */
public final class OsmAreaTypeMapper {

    /** OSM {@code place} values RouteView imports, and what they become. */
    public static final Map<String, AreaType> PLACE_TYPES = Map.of(
            "city", AreaType.CITY,
            "town", AreaType.TOWN,
            "village", AreaType.VILLAGE,
            "hamlet", AreaType.LOCALITY,
            "suburb", AreaType.SUBURB,
            "quarter", AreaType.SUBURB,
            "borough", AreaType.SUBURB,
            "neighbourhood", AreaType.LOCALITY,
            "locality", AreaType.LOCALITY);

    /**
     * {@code admin_level} values of {@code boundary=administrative} RouteView imports.
     * Levels differ between countries; these follow common usage (6 district, 7-8 municipal/sub-district,
     * 9-10 ward/village level). Levels below 6 (country, state, division) are too large to be journey
     * areas and levels above 10 are too small.
     */
    public static final Map<Integer, AreaType> ADMIN_LEVEL_TYPES = Map.of(
            6, AreaType.DISTRICT,
            7, AreaType.MUNICIPALITY,
            8, AreaType.MUNICIPALITY,
            9, AreaType.LOCALITY,
            10, AreaType.LOCALITY);

    /** Tag keys that mark an object as a point of interest, building, road or similar: never an area. */
    static final Set<String> EXCLUDED_KEYS = Set.of(
            "amenity", "shop", "tourism", "building", "highway", "railway", "public_transport",
            "healthcare", "office", "craft", "leisure", "aeroway", "historic", "man_made", "bridge", "emergency",
            "barrier", "waterway", "military", "power");

    private static final Pattern SECTOR_NAME = Pattern.compile("^sector[\\s-]*\\d+[a-z]?$", Pattern.CASE_INSENSITIVE);

    /** Outcome of classifying one object: exactly one of {@code type} and {@code skipReason} is set. */
    public record Decision(AreaType type, SkipReason skipReason) {

        public boolean isArea() {
            return type != null;
        }
    }

    private OsmAreaTypeMapper() {
    }

    public static Decision classify(Map<String, String> tags) {
        for (String key : EXCLUDED_KEYS) {
            if (tags.containsKey(key)) {
                return skip(SkipReason.EXCLUDED_FEATURE);
            }
        }

        String place = tags.get("place");
        if (place != null) {
            AreaType type = PLACE_TYPES.get(place);
            return type == null ? skip(SkipReason.UNMAPPED_PLACE) : area(refine(type, tags.get("name")));
        }

        if ("administrative".equals(tags.get("boundary"))) {
            Integer level = parseLevel(tags.get("admin_level"));
            AreaType type = level == null ? null : ADMIN_LEVEL_TYPES.get(level);
            return type == null ? skip(SkipReason.UNMAPPED_ADMIN_LEVEL) : area(refine(type, tags.get("name")));
        }

        return skip(SkipReason.UNMAPPED_TAGS);
    }

    private static AreaType refine(AreaType type, String name) {
        boolean small = type == AreaType.SUBURB || type == AreaType.LOCALITY;
        return small && name != null && SECTOR_NAME.matcher(name.trim()).matches() ? AreaType.SECTOR : type;
    }

    private static Integer parseLevel(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Decision area(AreaType type) {
        return new Decision(type, null);
    }

    private static Decision skip(SkipReason reason) {
        return new Decision(null, reason);
    }
}
