package com.routeview.area.detection;

import java.util.List;

import com.routeview.route.model.Route;

/** Determines the geographical areas a calculated route passes through. */
public interface AreaDetector {

    /** @return the areas in travel order; empty (never an exception) when none can be determined */
    List<DetectedArea> detectAreas(Route route);
}
