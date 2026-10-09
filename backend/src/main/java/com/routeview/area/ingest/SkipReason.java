package com.routeview.area.ingest;

/** Why a source record is deliberately not treated as a geographical area (it is not an error). */
public enum SkipReason {
    /** Tagged as a point of interest, building, road or similar: never a geographical area. */
    EXCLUDED_FEATURE,
    /** A place type RouteView does not use (state, island, square, farm, ...). */
    UNMAPPED_PLACE,
    /** An administrative level that is too large or too small to be a useful journey area. */
    UNMAPPED_ADMIN_LEVEL,
    /** None of the tags describe a geographical area. */
    UNMAPPED_TAGS
}
