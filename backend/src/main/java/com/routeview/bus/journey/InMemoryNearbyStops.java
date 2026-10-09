package com.routeview.bus.journey;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.routeview.common.geo.Coordinates;
import com.routeview.common.geo.GeoMath;

/** Nearest stops by scanning the in-memory network: for tests and as a fallback; production uses the PostGIS query. */
public final class InMemoryNearbyStops implements NearbyStopSource {

    private final BusNetwork network;

    public InMemoryNearbyStops(BusNetwork network) {
        this.network = network;
    }

    @Override
    public List<Candidate> nearest(Coordinates point, double radiusMeters, int limit) {
        List<Candidate> found = new ArrayList<>();
        for (BusNetwork.Stop stop : network.stops()) {
            double meters = GeoMath.haversineMeters(point.latitude(), point.longitude(), stop.latitude(), stop.longitude());
            if (meters <= radiusMeters) {
                found.add(new Candidate(stop.id(), meters));
            }
        }
        found.sort(Comparator.comparingDouble(Candidate::meters).thenComparing(c -> c.stopId().toString()));
        return found.subList(0, Math.min(limit, found.size()));
    }
}
