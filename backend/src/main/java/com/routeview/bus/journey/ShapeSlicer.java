package com.routeview.bus.journey;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.routeview.common.geo.GeoMath;

/** Cuts the part of a GTFS shape that a ride follows, from its boarding stop to its exit stop. */
public final class ShapeSlicer {

    /** A shape that passes further than this from a stop does not belong to that stop: it is not trusted. */
    public static final double MAX_STOP_DISTANCE_METERS = 300;

    private ShapeSlicer() {
    }

    /**
     * @param shape {latitude, longitude} points in shape order
     * @param board {latitude, longitude} of the boarding stop
     * @param exit  {latitude, longitude} of the exit stop
     * @return the boarding stop, the shape points between the two stops in shape order, the exit stop; empty when the shape
     *         does not run past both stops in that order (the caller then draws the ordered stops instead of guessing)
     */
    public static Optional<List<double[]>> slice(List<double[]> shape, double[] board, double[] exit) {
        if (shape == null || shape.size() < 2) {
            return Optional.empty();
        }
        int from = nearest(shape, board, 0);
        if (distance(shape.get(from), board) > MAX_STOP_DISTANCE_METERS) {
            return Optional.empty();
        }
        int to = nearest(shape, exit, from);
        if (distance(shape.get(to), exit) > MAX_STOP_DISTANCE_METERS || to <= from) {
            return Optional.empty();
        }
        List<double[]> points = new ArrayList<>();
        points.add(board);
        for (int i = from; i <= to; i++) {
            points.add(shape.get(i));
        }
        points.add(exit);
        return Optional.of(points);
    }

    private static int nearest(List<double[]> shape, double[] point, int start) {
        int best = start;
        double bestMeters = Double.MAX_VALUE;
        for (int i = start; i < shape.size(); i++) {
            double meters = distance(shape.get(i), point);
            if (meters < bestMeters) {
                bestMeters = meters;
                best = i;
            }
        }
        return best;
    }

    private static double distance(double[] a, double[] b) {
        return GeoMath.haversineMeters(a[0], a[1], b[0], b[1]);
    }
}
