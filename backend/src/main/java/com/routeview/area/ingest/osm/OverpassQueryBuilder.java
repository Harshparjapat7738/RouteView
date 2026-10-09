package com.routeview.area.ingest.osm;

import java.util.Locale;
import java.util.TreeSet;
import java.util.stream.Collectors;

import com.routeview.area.ingest.ImportRegion;

/**
 * Builds the Overpass QL query for a region. The place values and admin levels come from
 * {@link OsmAreaTypeMapper}, so the query never asks for more than the mapper can use.
 * Only named places and boundaries are requested: never POIs, buildings or roads.
 */
final class OverpassQueryBuilder {

    private static final int TIMEOUT_SECONDS = 180;

    private OverpassQueryBuilder() {
    }

    static String build(ImportRegion region) {
        String bbox = String.format(Locale.ROOT, "(%.6f,%.6f,%.6f,%.6f)", region.south(), region.west(), region.north(), region.east());
        String places = alternation(OsmAreaTypeMapper.PLACE_TYPES.keySet());
        String levels = alternation(OsmAreaTypeMapper.ADMIN_LEVEL_TYPES.keySet().stream().map(String::valueOf).collect(Collectors.toSet()));
        return "[out:xml][timeout:" + TIMEOUT_SECONDS + "];\n"
                + "(\n"
                + "  relation[\"boundary\"=\"administrative\"][\"admin_level\"~\"^(" + levels + ")$\"][\"name\"]" + bbox + ";\n"
                + "  relation[\"place\"~\"^(" + places + ")$\"][\"name\"]" + bbox + ";\n"
                + "  way[\"place\"~\"^(" + places + ")$\"][\"name\"]" + bbox + ";\n"
                + ");\n"
                + "out geom;\n";
    }

    private static String alternation(java.util.Set<String> values) {
        return String.join("|", new TreeSet<>(values));
    }
}
