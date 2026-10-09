package com.routeview.routing;

import java.io.Serial;

/**
 * A routing provider could not deliver routes. The message is for server-side logs only
 * and never contains credentials; clients receive a generic message instead.
 */
public class RoutingException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    /** Why the provider failed. */
    public enum Reason {
        /** The provider has no credentials configured. */
        NOT_CONFIGURED,
        /** Network failure or provider outage. */
        UNAVAILABLE,
        /** The provider did not answer within the configured time. */
        TIMEOUT,
        /** The provider refused the request because a rate limit or quota was reached. */
        QUOTA,
        /** The provider refused the request (invalid key, API disabled, bad request). */
        REJECTED,
        /** The provider answered, but not in the expected format. */
        INVALID_RESPONSE,
        /** The provider cannot route the requested travel mode for these points (for example two-wheeler outside its regions). */
        UNSUPPORTED_MODE
    }

    private final Reason reason;

    public RoutingException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public RoutingException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    public Reason getReason() {
        return reason;
    }
}
