package com.routeview.area.ingest;

/** Why a record that looked like an area was not imported. */
public enum RejectionReason {
    NO_NAME,
    NAME_TOO_LONG,
    INCOMPLETE_BOUNDARY,
    NULL_GEOMETRY,
    EMPTY_GEOMETRY,
    UNSUPPORTED_GEOMETRY,
    COORDINATES_OUT_OF_RANGE,
    INVALID_GEOMETRY,
    /** Smaller than any real village or sector: a sliver or digitising artefact. */
    AREA_TOO_SMALL,
    /** Larger than any area RouteView journeys are made of: almost certainly a country, state or broken polygon. */
    AREA_TOO_LARGE,
    DATABASE_REJECTED
}
