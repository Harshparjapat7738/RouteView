package com.routeview.spatial;

import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;

/**
 * The coordinate reference system used for every geometry in RouteView.
 *
 * <p>SRID 4326 is WGS 84 longitude/latitude in degrees. It is the system of Google Routes polylines,
 * GPS and OpenStreetMap, so route geometry and area boundaries can be compared directly without
 * reprojection. Using a different SRID in some table would make intersection queries wrong or fail.
 * Distances and areas are not measured in degrees: when needed, cast to {@code geography} in the query.
 */
public final class SpatialReference {

    /** WGS 84 (longitude/latitude). Must match the SRID of the geometry columns created by the migrations. */
    public static final int WGS84_SRID = 4326;

    private static final GeometryFactory GEOMETRY_FACTORY = new GeometryFactory(new PrecisionModel(), WGS84_SRID);

    private SpatialReference() {
    }

    /** A thread-safe factory that stamps every geometry it creates with SRID 4326. */
    public static GeometryFactory geometryFactory() {
        return GEOMETRY_FACTORY;
    }
}
