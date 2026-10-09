package com.routeview.routing.google;

import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.model.TravelMode;

/** Turns a Google Routes HTTP status into a RouteView failure reason. */
final class GoogleRoutesErrors {

    private static final int HTTP_BAD_REQUEST = 400;
    private static final int HTTP_NOT_FOUND = 404;
    private static final int HTTP_TOO_MANY_REQUESTS = 429;
    private static final int HTTP_SERVER_ERROR = 500;

    private GoogleRoutesErrors() {
    }

    /**
     * A 400 / 404 for a mode other than the default car mode means that Google cannot route that mode for these
     * points (for example two-wheeler outside its supported regions, or no transit coverage). A wrong key, a
     * disabled API or a billing problem answer 401 / 403 and stay REJECTED. The car mode never reports
     * UNSUPPORTED_MODE: a 400 there is a real request problem.
     */
    static Reason reasonFor(int status, TravelMode mode) {
        if (status == HTTP_TOO_MANY_REQUESTS) {
            return Reason.QUOTA;
        }
        if (status >= HTTP_SERVER_ERROR) {
            return Reason.UNAVAILABLE;
        }
        if ((status == HTTP_BAD_REQUEST || status == HTTP_NOT_FOUND) && mode != TravelMode.DEFAULT) {
            return Reason.UNSUPPORTED_MODE;
        }
        return Reason.REJECTED;
    }
}
