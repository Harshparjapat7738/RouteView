package com.routeview.routing.model;

/**
 * How the user travels. This is RouteView's own vocabulary (the user's intention); the mapping to a
 * provider's travel modes lives inside the provider adapter, for Google in {@code GoogleTravelModeMapping}.
 */
public enum TravelMode {
    /** Motorcycles, scooters and other motorised two-wheelers. */
    TWO_WHEELER,
    /** An ordinary passenger car. The default. */
    FOUR_WHEELER,
    WALKING,
    CYCLING,
    /** Public transit, preferring trains. The provider may still add other transit types. */
    TRAIN,
    /** Public transit, preferring metro / subway. The provider may still add other transit types. */
    METRO,
    /**
     * Public buses, planned by RouteView itself from the imported bus GTFS data (the routing provider is not asked). Not a
     * {@link #isTransit() transit} mode in the provider sense: its journeys come from {@code BusJourneyService}.
     */
    BUS;

    /** The mode used when a request does not name one, so existing behaviour does not change. */
    public static final TravelMode DEFAULT = FOUR_WHEELER;

    /** Public transit calculated by the routing provider (Train, Metro). */
    public boolean isTransit() {
        return this == TRAIN || this == METRO;
    }

    /** Modes whose journeys leave at a chosen time: provider transit and RouteView's own bus planner. */
    public boolean acceptsTimeOptions() {
        return isTransit() || this == BUS;
    }
}
