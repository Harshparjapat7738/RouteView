package com.routeview.common.error;

import java.io.Serial;

/**
 * Base exception for a requested resource that does not exist.
 * Modules throw it (or a subclass) and the global handler maps it to HTTP 404.
 * The message is returned to the client, so it must never contain internal details.
 */
public class ResourceNotFoundException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
