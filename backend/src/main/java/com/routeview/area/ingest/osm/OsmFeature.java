package com.routeview.area.ingest.osm;

import java.util.List;
import java.util.Map;

import org.locationtech.jts.geom.Coordinate;

/**
 * One top-level OpenStreetMap element (node, way or relation) read from Overpass XML with inline geometry.
 * Internal to the OSM adapter: nothing outside {@code area.ingest.osm} sees it.
 *
 * @param outerLines coordinate sequences of the outer ways (a way has one, a relation one per outer member)
 * @param innerLines coordinate sequences of the inner (hole) ways of a relation
 * @param subareaRelationIds ids of member relations with role {@code subarea}
 * @param incompleteMembers true when a way member arrived without coordinates
 */
record OsmFeature(
        Kind kind,
        long id,
        Map<String, String> tags,
        List<List<Coordinate>> outerLines,
        List<List<Coordinate>> innerLines,
        List<Long> subareaRelationIds,
        boolean incompleteMembers) {

    enum Kind {
        NODE, WAY, RELATION;

        String prefix() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    /** Stable identifier inside OpenStreetMap, e.g. {@code relation/1234}. Ids are only unique per element type. */
    String externalId() {
        return kind.prefix() + "/" + id;
    }
}
