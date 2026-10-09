package com.routeview.area.ingest;

import java.util.ArrayList;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.util.GeometryFixer;
import org.locationtech.jts.geom.util.PolygonExtracter;

import com.routeview.spatial.SpatialReference;

/**
 * Turns a source geometry into what the database accepts: a valid, non-empty {@code MultiPolygon}
 * in SRID 4326, or a rejection with the reason. Independent of the data source.
 *
 * <p>Invalid polygons (self-intersections, bow-ties, ...) are repaired with JTS {@link GeometryFixer};
 * a geometry that is still not a valid polygon afterwards is rejected, never stored.
 */
public final class AreaGeometryNormalizer {

    /** Smallest plausible area (square metres): slivers and digitising artefacts are not areas anyone travels through. */
    public static final double DEFAULT_MIN_AREA_SQUARE_METERS = 500;
    /** Largest area (square metres, 150,000 km2) that can be a journey area; bigger polygons are states/countries or broken data. */
    public static final double DEFAULT_MAX_AREA_SQUARE_METERS = 150_000e6;
    private static final double METERS_PER_DEGREE = 111_320.0;

    private final double minAreaSquareMeters;
    private final double maxAreaSquareMeters;

    public AreaGeometryNormalizer() {
        this(DEFAULT_MIN_AREA_SQUARE_METERS, DEFAULT_MAX_AREA_SQUARE_METERS);
    }

    public AreaGeometryNormalizer(double minAreaSquareMeters, double maxAreaSquareMeters) {
        this.minAreaSquareMeters = minAreaSquareMeters;
        this.maxAreaSquareMeters = maxAreaSquareMeters;
    }

    public enum Outcome { VALID, REPAIRED, REJECTED }

    /**
     * @param geometry set unless {@code outcome} is REJECTED
     * @param reason   set only when REJECTED
     * @param detail   short human-readable explanation when REJECTED
     * @param wasInvalid true if the input failed validation (whether or not it could be repaired)
     */
    public record Result(Outcome outcome, MultiPolygon geometry, RejectionReason reason, String detail, boolean wasInvalid) {

        static Result valid(MultiPolygon geometry) {
            return new Result(Outcome.VALID, geometry, null, null, false);
        }

        static Result repaired(MultiPolygon geometry) {
            return new Result(Outcome.REPAIRED, geometry, null, null, true);
        }

        static Result rejected(RejectionReason reason, String detail, boolean wasInvalid) {
            return new Result(Outcome.REJECTED, null, reason, detail, wasInvalid);
        }
    }

    public Result normalize(Geometry input) {
        if (input == null) {
            return Result.rejected(RejectionReason.NULL_GEOMETRY, "no geometry", false);
        }
        if (input.isEmpty()) {
            return Result.rejected(RejectionReason.EMPTY_GEOMETRY, "empty geometry", false);
        }
        if (!(input instanceof Polygon) && !(input instanceof MultiPolygon)) {
            return Result.rejected(RejectionReason.UNSUPPORTED_GEOMETRY, "geometry type " + input.getGeometryType(), false);
        }
        if (!coordinatesInRange(input)) {
            return Result.rejected(RejectionReason.COORDINATES_OUT_OF_RANGE, "coordinates outside longitude/latitude range", false);
        }

        boolean valid = input.isValid();
        Geometry candidate = valid ? input.copy() : GeometryFixer.fix(input);
        MultiPolygon result = toMultiPolygon(candidate);
        if (result == null || result.isEmpty() || !result.isValid()) {
            return Result.rejected(RejectionReason.INVALID_GEOMETRY, "geometry is invalid and could not be repaired", !valid);
        }

        double squareMeters = approximateAreaSquareMeters(result);
        if (squareMeters < minAreaSquareMeters) {
            return Result.rejected(RejectionReason.AREA_TOO_SMALL, "area is only about " + Math.round(squareMeters) + " m2", !valid);
        }
        if (squareMeters > maxAreaSquareMeters) {
            return Result.rejected(RejectionReason.AREA_TOO_LARGE, "area is about " + Math.round(squareMeters / 1e6) + " km2", !valid);
        }

        result.normalize();
        result.setSRID(SpatialReference.WGS84_SRID);
        return valid ? Result.valid(result) : Result.repaired(result);
    }

    /** Planar area in degrees scaled to metres at the geometry's latitude: accurate enough for a size sanity check. */
    static double approximateAreaSquareMeters(Geometry geometry) {
        double latitude = geometry.getEnvelopeInternal().centre().y;
        double metersPerDegreeLongitude = METERS_PER_DEGREE * Math.cos(Math.toRadians(latitude));
        return geometry.getArea() * METERS_PER_DEGREE * metersPerDegreeLongitude;
    }

    /** Keeps only the polygonal parts; returns null if there are none. */
    private static MultiPolygon toMultiPolygon(Geometry geometry) {
        List<?> found = PolygonExtracter.getPolygons(geometry);
        List<Polygon> polygons = new ArrayList<>();
        for (Object item : found) {
            Polygon polygon = (Polygon) item;
            if (!polygon.isEmpty()) {
                polygons.add(polygon);
            }
        }
        if (polygons.isEmpty()) {
            return null;
        }
        return SpatialReference.geometryFactory().createMultiPolygon(polygons.toArray(new Polygon[0]));
    }

    private static boolean coordinatesInRange(Geometry geometry) {
        for (Coordinate c : geometry.getCoordinates()) {
            if (!Double.isFinite(c.x) || !Double.isFinite(c.y) || c.x < -180 || c.x > 180 || c.y < -90 || c.y > 90) {
                return false;
            }
        }
        return true;
    }
}
