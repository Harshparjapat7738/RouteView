package com.routeview.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class RequestSizeLimitFilterTest {

    private static final long LIMIT = 16_384;

    @Test
    void smallAndBodylessRequestsPass() {
        assertEquals(0, RequestSizeLimitFilter.rejectionStatus(300, false, LIMIT));
        assertEquals(0, RequestSizeLimitFilter.rejectionStatus(LIMIT, false, LIMIT));
        assertEquals(0, RequestSizeLimitFilter.rejectionStatus(-1, false, LIMIT));
    }

    @Test
    void oversizedBodiesAreRejected() {
        assertEquals(413, RequestSizeLimitFilter.rejectionStatus(LIMIT + 1, false, LIMIT));
        assertEquals(413, RequestSizeLimitFilter.rejectionStatus(10_000_000, true, LIMIT));
    }

    @Test
    void chunkedBodiesWithoutALengthAreRejected() {
        assertEquals(411, RequestSizeLimitFilter.rejectionStatus(-1, true, LIMIT));
    }
}
