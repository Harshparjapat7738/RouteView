package com.routeview.area.ingest;

import java.util.Map;

import org.locationtech.jts.geom.Geometry;

import com.routeview.area.model.AreaType;

/**
 * An area as RouteView understands it, independent of the data source it came from.
 * Providers produce these; nothing downstream sees raw source objects.
 *
 * @param source           name of the data source, e.g. {@code openstreetmap}
 * @param externalId       stable identifier inside {@code source}; {@code source + externalId} identifies the area
 * @param name             the area's name as the source states it
 * @param areaType         RouteView's classification
 * @param geometry         boundary in SRID 4326 as the source delivered it; may be missing or invalid,
 *                         the importer validates it before anything is stored
 * @param parentExternalId the parent area's id when the source states it directly, otherwise null
 * @param sourceMetadata   small amount of descriptive source data (e.g. the original tags), may be empty
 */
public record NormalizedArea(
        String source,
        String externalId,
        String name,
        AreaType areaType,
        Geometry geometry,
        String parentExternalId,
        Map<String, String> sourceMetadata) {

    public NormalizedArea {
        sourceMetadata = sourceMetadata == null ? Map.of() : Map.copyOf(sourceMetadata);
    }

    public NormalizedArea withGeometry(Geometry validated) {
        return new NormalizedArea(source, externalId, name, areaType, validated, parentExternalId, sourceMetadata);
    }
}
