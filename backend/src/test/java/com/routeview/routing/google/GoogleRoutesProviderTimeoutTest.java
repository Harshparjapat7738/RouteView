package com.routeview.routing.google;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;

import org.junit.jupiter.api.Test;

class GoogleRoutesProviderTimeoutTest {

    @Test
    void recognisesTimeoutsAnywhereInTheCauseChain() {
        assertTrue(GoogleRoutesProvider.isTimeout(new HttpTimeoutException("request timed out")));
        assertTrue(GoogleRoutesProvider.isTimeout(new RuntimeException("wrapped", new SocketTimeoutException("read"))));
        assertTrue(GoogleRoutesProvider.isTimeout(
                new IllegalStateException("outer", new RuntimeException("mid", new HttpTimeoutException("x")))));
    }

    @Test
    void otherFailuresAreNotTimeouts() {
        assertFalse(GoogleRoutesProvider.isTimeout(new IOException("connection reset")));
        assertFalse(GoogleRoutesProvider.isTimeout(new RuntimeException("boom")));
    }
}
