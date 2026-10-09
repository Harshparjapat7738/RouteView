package com.routeview.area.detection;

/** What the selection policy decided about one candidate area, and why. Used for logging counts and for tests. */
public enum SelectionVerdict {
    /** Became a journey stop because the route runs far enough through it. */
    ACCEPTED,
    /** Became a journey stop because the route starts or ends inside it. */
    ACCEPTED_ROUTE_ENDPOINT,
    /** Missing or impossible values; ignored. */
    UNUSABLE,
    /** Only close by, touches the border or runs along it: the route is not inside the area. */
    NOT_CROSSED,
    /** The route is inside the area, but for less than its type and size require. */
    BELOW_MINIMUM_INTERSECTION,
    /** Same name and an overlapping stretch as a better record of the same place (duplicate or other administrative level). */
    DUPLICATE_PLACE,
    /** A broad administrative area hidden because finer areas cover the same stretch. */
    COVERED_BY_FINER_AREA
}
