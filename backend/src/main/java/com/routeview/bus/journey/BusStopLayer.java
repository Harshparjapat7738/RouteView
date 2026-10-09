package com.routeview.bus.journey;

import java.util.List;
import java.util.UUID;

/**
 * The bus stops inside a small map window, for the map's bus-stop layer. Always bounded: the window must be small and the
 * answer is cut at {@code limit} (the caller is told when it was cut).
 */
public interface BusStopLayer {

    record Stop(UUID id, String gtfsId, String name, double latitude, double longitude) {
    }

    /** At most {@code limit} + 1 stops: one more than asked means "there are more". */
    List<Stop> inWindow(double south, double west, double north, double east, int limit);
}
