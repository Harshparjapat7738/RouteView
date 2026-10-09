package com.routeview.common.error;

import java.io.Serial;

/**
 * Signals a request that is well-formed but cannot be processed (HTTP 400).
 * The message is returned to the client, so it must never contain internal details.
 */
public class BadRequestException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public BadRequestException(String message) {
        super(message);
    }
}
