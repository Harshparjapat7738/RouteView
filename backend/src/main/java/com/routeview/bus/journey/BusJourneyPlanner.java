package com.routeview.bus.journey;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.BitSet;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * Phase one of a bus journey search: a RAPTOR-style round-based search over the pattern graph. Round k finds the best way to reach
 * every stop with at most k bus rides. The search is bounded in three ways: at most {@link Settings#maxLegs()} rides, only
 * patterns that run on the day, and pruning against the best journey found so far. It never reads stop times; ride times come
 * from the patterns' scheduled offsets and the wait for a bus is an estimate from the pattern's typical headway. The result
 * only RANKS journeys: the real trips and times are looked up afterwards for the few journeys that survive.
 *
 * <p>Rules that matter to riders: stop order is the pattern's order (never names or coordinates); a ride may not directly follow
 * a ride of the same route (Bus A to Bus A is not a transfer, it is the same service); changing between nearby stops costs
 * walking time.
 */
public final class BusJourneyPlanner {

    /** A stop reached on foot from the start (or leading on foot to the destination). */
    public record Access(int stop, int walkSeconds) {
    }

    /** One ride: board at position {@code boardPos} of the pattern, get off at {@code alightPos}. */
    public record Leg(int pattern, int boardPos, int alightPos) {
    }

    /** {@code cost} is the weighted ranking cost in seconds, not the travel time. */
    public record Plan(Access access, List<Leg> legs, Access egress, long cost) {
        public Plan {
            legs = List.copyOf(legs);
        }
    }

    /**
     * @param maxLegs              most bus rides in a journey (3 = two transfers)
     * @param boardingPenaltySeconds extra cost per boarding, which makes fewer transfers preferred
     * @param walkWeight           cost of one walking second relative to one riding second
     * @param transferRadiusMeters most straight-line distance walked between two stops to change buses
     */
    public record Settings(int maxLegs, int boardingPenaltySeconds, double walkWeight, double transferRadiusMeters, double walkSpeedMetersPerSecond,
                           double detourFactor, int minimumSavingPerExtraLegSeconds) {
        public static final Settings DEFAULT = new Settings(3, 180, 1.5, 300, 1.25, 1.3, 120);

        public int walkSeconds(double straightLineMeters) {
            return (int) Math.round(straightLineMeters * detourFactor / walkSpeedMetersPerSecond);
        }
    }

    private static final long INF = Long.MAX_VALUE / 4;

    private BusJourneyPlanner() {
    }

    private record Parent(int pattern, int boardPos, int alightPos, int footFrom) {
        static Parent ride(int pattern, int boardPos, int alightPos) {
            return new Parent(pattern, boardPos, alightPos, -1);
        }

        static Parent foot(int from) {
            return new Parent(-1, -1, -1, from);
        }

        boolean isFoot() {
            return footFrom >= 0;
        }
    }

    /**
     * @param active       patterns that run on the day (null = all)
     * @param bannedRoutes route indexes that must not be used (used to find genuinely different alternatives)
     * @return plans with fewer legs first; each later plan is at least {@code minimumSavingPerExtraLegSeconds} cheaper than all before
     */
    public static List<Plan> plan(BusNetwork network, List<Access> access, List<Access> egress, BitSet active, Set<Integer> bannedRoutes, Settings settings) {
        if (network.isEmpty() || access.isEmpty() || egress.isEmpty()) {
            return List.of();
        }
        int stops = network.stops().size();
        int rounds = Math.max(1, settings.maxLegs());
        long[][] tau = new long[rounds + 1][stops];
        Parent[][] parent = new Parent[rounds + 1][stops];
        int[][] arrivedBy = new int[rounds + 1][stops]; // route index used to arrive; -1 = on foot from the start
        for (long[] row : tau) {
            Arrays.fill(row, INF);
        }
        for (int[] row : arrivedBy) {
            Arrays.fill(row, -1);
        }
        long[] best = new long[stops];
        Arrays.fill(best, INF);
        BitSet marked = new BitSet(stops);
        for (Access a : access) {
            long cost = Math.round(a.walkSeconds() * settings.walkWeight());
            if (cost < tau[0][a.stop()]) {
                tau[0][a.stop()] = cost;
                best[a.stop()] = cost;
                marked.set(a.stop());
            }
        }
        long[] egressCost = new long[stops];
        Arrays.fill(egressCost, INF);
        for (Access e : egress) {
            egressCost[e.stop()] = Math.min(egressCost[e.stop()], Math.round(e.walkSeconds() * settings.walkWeight()));
        }
        long bestTotal = INF;
        List<Plan> plans = new ArrayList<>();

        for (int k = 1; k <= rounds; k++) {
            System.arraycopy(tau[k - 1], 0, tau[k], 0, stops);
            System.arraycopy(arrivedBy[k - 1], 0, arrivedBy[k], 0, stops);

            // Earliest marked position of every pattern that serves a marked stop.
            int[] queue = new int[network.patterns().size()];
            Arrays.fill(queue, -1);
            for (int s = marked.nextSetBit(0); s >= 0; s = marked.nextSetBit(s + 1)) {
                int[] pairs = network.patternsAt(s);
                for (int i = 0; i < pairs.length; i += 2) {
                    int p = pairs[i];
                    if ((active != null && !active.get(p)) || bannedRoutes.contains(network.routeIndexOf(p))) {
                        continue;
                    }
                    if (queue[p] < 0 || pairs[i + 1] < queue[p]) {
                        queue[p] = pairs[i + 1];
                    }
                }
            }
            BitSet improved = new BitSet(stops);
            for (int p = 0; p < queue.length; p++) {
                if (queue[p] < 0) {
                    continue;
                }
                BusNetwork.Pattern pattern = network.patterns().get(p);
                int route = pattern.route();
                int wait = pattern.expectedWaitSeconds();
                int boardPos = -1;
                long boardCost = INF; // cost of being on the bus at boardPos
                for (int i = queue[p]; i < pattern.stops().length; i++) {
                    int stop = pattern.stops()[i];
                    if (boardPos >= 0) {
                        long arrival = boardCost + (pattern.offsetSeconds()[i] - pattern.offsetSeconds()[boardPos]);
                        if (arrival < best[stop] && arrival < bestTotal) {
                            tau[k][stop] = arrival;
                            best[stop] = arrival;
                            parent[k][stop] = Parent.ride(p, boardPos, i);
                            arrivedBy[k][stop] = route;
                            improved.set(stop);
                        }
                    }
                    long before = tau[k - 1][stop];
                    if (before < INF && arrivedBy[k - 1][stop] != route) {
                        long candidate = before + wait + settings.boardingPenaltySeconds();
                        long onBoardHere = boardPos < 0 ? INF : boardCost + (pattern.offsetSeconds()[i] - pattern.offsetSeconds()[boardPos]);
                        if (candidate < onBoardHere) {
                            boardPos = i;
                            boardCost = candidate;
                        }
                    }
                }
            }
            // One walk between nearby stops (changing buses at a different stop).
            BitSet viaRide = (BitSet) improved.clone();
            for (int s = viaRide.nextSetBit(0); s >= 0; s = viaRide.nextSetBit(s + 1)) {
                for (int t : network.stopsNear(s, settings.transferRadiusMeters())) {
                    double meters = com.routeview.common.geo.GeoMath.haversineMeters(network.stop(s).latitude(), network.stop(s).longitude(),
                            network.stop(t).latitude(), network.stop(t).longitude());
                    long cost = tau[k][s] + Math.round(settings.walkSeconds(meters) * settings.walkWeight());
                    if (cost < best[t] && cost < bestTotal) {
                        tau[k][t] = cost;
                        best[t] = cost;
                        parent[k][t] = Parent.foot(s);
                        arrivedBy[k][t] = arrivedBy[k][s];
                        improved.set(t);
                    }
                }
            }
            marked = improved;

            // Best way to finish with at most k rides.
            long bestStop = INF;
            int bestAt = -1;
            for (int s = 0; s < stops; s++) {
                // Only stops reached by a ride count: one gets off the bus and walks straight to the destination.
                if (egressCost[s] < INF && tau[k][s] < INF && reachedByRide(parent, k, s)) {
                    long total = tau[k][s] + egressCost[s];
                    if (total < bestStop) {
                        bestStop = total;
                        bestAt = s;
                    }
                }
            }
            if (bestAt >= 0 && bestStop + settings.minimumSavingPerExtraLegSeconds() * (long) Math.min(1, plans.size()) < bestTotal) {
                Plan plan = reconstruct(network, k, bestAt, tau, parent, access, egress, settings, bestStop);
                if (plan != null && !plan.legs().isEmpty()) {
                    if (plans.isEmpty() || plan.legs().size() > plans.get(plans.size() - 1).legs().size()) {
                        plans.add(plan);
                        bestTotal = bestStop;
                    }
                }
            }
            if (marked.isEmpty()) {
                break;
            }
        }
        return plans;
    }

    private static boolean reachedByRide(Parent[][] parent, int round, int stop) {
        for (int k = round; k > 0; k--) {
            Parent rec = parent[k][stop];
            if (rec != null) {
                return !rec.isFoot();
            }
        }
        return false;
    }

    private static Plan reconstruct(BusNetwork network, int round, int destinationStop, long[][] tau, Parent[][] parent, List<Access> access, List<Access> egress,
                                    Settings settings, long cost) {
        List<Leg> legs = new ArrayList<>();
        int k = round;
        int stop = destinationStop;
        int guard = 0;
        while (k > 0 && guard++ < 10_000) {
            Parent rec = parent[k][stop];
            if (rec == null) {
                k--;
                continue;
            }
            if (rec.isFoot()) {
                stop = rec.footFrom();
                continue; // the ride that reached the walked-from stop is in the same round
            }
            legs.add(new Leg(rec.pattern(), rec.boardPos(), rec.alightPos()));
            stop = network.patterns().get(rec.pattern()).stops()[rec.boardPos()];
            k--;
        }
        if (guard >= 10_000 || legs.isEmpty()) {
            return null;
        }
        Collections.reverse(legs);
        Access from = null;
        for (Access a : access) {
            if (a.stop() == stop && (from == null || a.walkSeconds() < from.walkSeconds())) {
                from = a;
            }
        }
        Access to = null;
        for (Access e : egress) {
            if (e.stop() == destinationStop && (to == null || e.walkSeconds() < to.walkSeconds())) {
                to = e;
            }
        }
        if (from == null || to == null) {
            return null;
        }
        return new Plan(from, legs, to, cost);
    }
}
