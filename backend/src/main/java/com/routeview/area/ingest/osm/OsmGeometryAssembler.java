package com.routeview.area.ingest.osm;

import java.util.ArrayList;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.operation.linemerge.LineMerger;

import com.routeview.spatial.SpatialReference;

/**
 * Builds area geometry from OSM ways: joins the way fragments of a relation into closed rings, makes
 * the outer rings polygons and puts each inner ring (hole) into the smallest outer ring that contains it.
 * The result may still be invalid (self-intersections, ...); validity is checked by the importer.
 */
final class OsmGeometryAssembler {

    /** Either a geometry or the reason the boundary could not be built. */
    record Assembly(Geometry geometry, String problem) {

        static Assembly of(Geometry geometry) {
            return new Assembly(geometry, null);
        }

        static Assembly incomplete(String problem) {
            return new Assembly(null, problem);
        }
    }

    private static final int MIN_RING_POINTS = 4;
    private final GeometryFactory factory = SpatialReference.geometryFactory();

    Assembly assemble(OsmFeature feature) {
        if (feature.incompleteMembers()) {
            return Assembly.incomplete("some boundary members have no geometry");
        }
        if (feature.outerLines().isEmpty()) {
            return Assembly.incomplete("no boundary ways");
        }

        List<LinearRing> shells = rings(feature.outerLines());
        if (shells == null) {
            return Assembly.incomplete("the outer boundary is not a closed ring");
        }
        List<LinearRing> holes = rings(feature.innerLines());
        if (holes == null) {
            return Assembly.incomplete("an inner boundary is not a closed ring");
        }

        List<Polygon> shellPolygons = new ArrayList<>();
        for (LinearRing shell : shells) {
            shellPolygons.add(factory.createPolygon(shell));
        }
        List<List<LinearRing>> holesPerShell = new ArrayList<>();
        for (int i = 0; i < shellPolygons.size(); i++) {
            holesPerShell.add(new ArrayList<>());
        }
        for (LinearRing hole : holes) {
            int owner = smallestContaining(shellPolygons, hole);
            if (owner >= 0) {
                holesPerShell.get(owner).add(hole);
            }
        }

        Polygon[] polygons = new Polygon[shells.size()];
        for (int i = 0; i < polygons.length; i++) {
            polygons[i] = factory.createPolygon(shells.get(i), holesPerShell.get(i).toArray(new LinearRing[0]));
        }
        return Assembly.of(factory.createMultiPolygon(polygons));
    }

    /** Joins the lines end to end into closed rings; null if any resulting line is not a closed ring. */
    private List<LinearRing> rings(List<List<Coordinate>> lines) {
        List<LinearRing> rings = new ArrayList<>();
        if (lines.isEmpty()) {
            return rings;
        }
        LineMerger merger = new LineMerger();
        for (List<Coordinate> line : lines) {
            if (line.size() < 2) {
                return null;
            }
            merger.add(factory.createLineString(line.toArray(new Coordinate[0])));
        }
        for (Object merged : merger.getMergedLineStrings()) {
            LineString line = (LineString) merged;
            if (!line.isClosed() || line.getNumPoints() < MIN_RING_POINTS) {
                return null;
            }
            rings.add(factory.createLinearRing(line.getCoordinates()));
        }
        return rings;
    }

    private int smallestContaining(List<Polygon> shells, LinearRing hole) {
        Polygon holeArea = factory.createPolygon(hole);
        int best = -1;
        double bestArea = Double.MAX_VALUE;
        for (int i = 0; i < shells.size(); i++) {
            Polygon shell = shells.get(i);
            if (shell.getArea() < bestArea && shell.contains(holeArea)) {
                best = i;
                bestArea = shell.getArea();
            }
        }
        return best;
    }
}
