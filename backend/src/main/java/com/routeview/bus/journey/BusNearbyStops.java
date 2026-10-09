package com.routeview.bus.journey;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Comparator;
import java.util.List;

import com.routeview.common.geo.Coordinates;

/**
 * Chooses the stops a journey may start from (or end at). Distance alone is not enough: a stop 100 m away that no bus serves
 * today is useless, and a stop with one rare route is worse than one a little further with many. So candidates must be served
 * by at least one pattern that runs on the day, and the ranking adds a small penalty for stops with few services.
 * The result is always bounded: at most {@link Options#candidateLimit()} stops are read and at most {@link Options#maxStops()}
 * are returned. The search widens the radius step by step only while nothing suitable was found.
 */
public final class BusNearbyStops {

    /** @param radiiMeters search radii, tried in order until a suitable stop exists */
    public record Options(double[] radiiMeters, int candidateLimit, int maxStops) {
        public static final Options DEFAULT = new Options(new double[]{600, 1_500}, 60, 8);
    }

    /** {@code score} is the ranking value in seconds (lower is better); {@code servingPatterns} counts active patterns. */
    public record Selected(int stop, double meters, int walkSeconds, int servingPatterns, double score) {
    }

    private BusNearbyStops() {
    }

    public static List<Selected> select(BusNetwork network, NearbyStopSource source, Coordinates point, BitSet activePatterns,
                                        BusJourneyPlanner.Settings walking, Options options) {
        for (double radius : options.radiiMeters()) {
            List<Selected> chosen = new ArrayList<>();
            for (NearbyStopSource.Candidate candidate : source.nearest(point, radius, options.candidateLimit())) {
                if (candidate.meters() > radius) {
                    continue;
                }
                int stop = network.stopIndexOf(candidate.stopId());
                if (stop < 0) {
                    continue; // not part of the bus graph
                }
                int serving = network.servingPatternCount(stop, activePatterns);
                if (serving == 0) {
                    continue; // nothing runs here today
                }
                int walk = walking.walkSeconds(candidate.meters());
                double score = walk + Math.max(0, 300 - 60.0 * Math.min(serving, 5));
                chosen.add(new Selected(stop, candidate.meters(), walk, serving, score));
            }
            if (!chosen.isEmpty()) {
                chosen.sort(Comparator.comparingDouble(Selected::score).thenComparingDouble(Selected::meters).thenComparingInt(Selected::stop));
                return List.copyOf(chosen.subList(0, Math.min(options.maxStops(), chosen.size())));
            }
        }
        return List.of();
    }
}
