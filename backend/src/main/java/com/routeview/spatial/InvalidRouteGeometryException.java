package com.routeview.spatial;

/** A route geometry that cannot be used for spatial analysis. The message is safe to log (it contains no coordinates). */
public class InvalidRouteGeometryException extends IllegalArgumentException {

    public enum Reason { MISSING, UNSUPPORTED_TYPE, WRONG_SRID, COORDINATE_OUT_OF_RANGE, TOO_MANY_VERTICES, NO_LENGTH }

    private final Reason reason;

    public InvalidRouteGeometryException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
