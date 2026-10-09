package com.routeview.route.model;

import java.util.List;

import com.routeview.bus.journey.BusJourney;
import com.routeview.metro.journey.MetroJourney;

import com.routeview.routing.model.TransitInfo;

/**
 * A calculated route in RouteView's own terms. The geometry is kept as an encoded polyline
 * (precision 5) because it is both what the map draws and what area detection will consume.
 *
 * @param id              unique identifier of this calculation result
 * @param index           position among the alternatives, 0 = the provider's preferred route
 * @param distanceMeters  total length in meters
 * @param durationSeconds expected travel time in seconds
 * @param encodedPolyline route geometry
 * @param summary         short description such as "via NH19"; empty if unknown
 * @param transit         public-transit details (steps, transfers, times) or null for other modes
 * @param warnings        provider warnings to display with the route (never null)
 * @param metro           the metro journey view of a transit route (stations, lines, transfers, fare), or null
 * @param bus             the bus journey (walking, rides with real ordered stops, transfers, schedule), or null
 */
public record Route(
        String id,
        int index,
        long distanceMeters,
        long durationSeconds,
        String encodedPolyline,
        String summary,
        TransitInfo transit,
        List<String> warnings,
        MetroJourney metro,
        BusJourney bus) {

    public Route {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    public Route(String id, int index, long distanceMeters, long durationSeconds, String encodedPolyline, String summary,
            TransitInfo transit, List<String> warnings, MetroJourney metro) {
        this(id, index, distanceMeters, durationSeconds, encodedPolyline, summary, transit, warnings, metro, null);
    }

    public Route(String id, int index, long distanceMeters, long durationSeconds, String encodedPolyline, String summary,
            TransitInfo transit, List<String> warnings) {
        this(id, index, distanceMeters, durationSeconds, encodedPolyline, summary, transit, warnings, null, null);
    }

    /** A route without transit details or warnings (road routes in the default mode). */
    public Route(String id, int index, long distanceMeters, long durationSeconds, String encodedPolyline, String summary) {
        this(id, index, distanceMeters, durationSeconds, encodedPolyline, summary, null, List.of());
    }
}
