package com.routeview.metro.journey;

import java.util.Optional;

import com.routeview.metro.ingest.MetroNameNormalizer;
import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.model.MetroStation;

/**
 * Finds the dataset station a routing-provider stop refers to. A stop is accepted only when its name matches a
 * station near its position, or when it sits right on top of exactly one station; otherwise nothing is matched
 * (an unmatched stop is shown with the provider's own name and no dataset information).
 */
public final class MetroStationMatcher {

    static final double NAME_MATCH_RADIUS_METERS = 600;
    static final double POSITION_ONLY_RADIUS_METERS = 75;
    private static final int MIN_PARTIAL_KEY_LENGTH = 4;

    private MetroStationMatcher() {
    }

    public static Optional<MetroStation> find(MetroNetwork network, String providerName, Double latitude, Double longitude) {
        String key = MetroNameNormalizer.key(providerName);
        MetroStation best = null;
        double bestDistance = Double.MAX_VALUE;
        int withinPositionRadius = 0;
        MetroStation onlyClose = null;
        for (MetroStation station : network.stations()) {
            double distance = latitude == null || longitude == null ? Double.NaN : meters(latitude, longitude, station.latitude(), station.longitude());
            boolean hasPosition = !Double.isNaN(distance);
            if (hasPosition && distance <= POSITION_ONLY_RADIUS_METERS) {
                withinPositionRadius++;
                onlyClose = station;
            }
            if (!namesMatch(key, MetroNameNormalizer.key(station.name()))) {
                continue;
            }
            if (hasPosition && distance > NAME_MATCH_RADIUS_METERS) {
                continue;
            }
            double rank = hasPosition ? distance : 0;
            if (best == null || rank < bestDistance) {
                best = station;
                bestDistance = rank;
            }
        }
        if (best != null) {
            return Optional.of(best);
        }
        return withinPositionRadius == 1 ? Optional.of(onlyClose) : Optional.empty();
    }

    static boolean namesMatch(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        String shorter = a.length() <= b.length() ? a : b;
        String longer = shorter == a ? b : a;
        return shorter.length() >= MIN_PARTIAL_KEY_LENGTH && (" " + longer + " ").contains(" " + shorter + " ");
    }

    private static double meters(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }
}
