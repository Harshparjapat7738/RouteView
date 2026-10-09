package com.routeview.area.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;

import org.junit.jupiter.api.Test;

class JdbcAreaImportStoreTest {

    @Test
    void metadataIsWrittenAsSortedEscapedJson() {
        assertEquals("{}", JdbcAreaImportStore.toJson(Map.of()));
        assertEquals("{\"a\":\"1\",\"b\":\"x\"}", JdbcAreaImportStore.toJson(Map.of("b", "x", "a", "1")));
        assertEquals("{\"k\":\"q\\\"u\\\\o\\u000a\"}", JdbcAreaImportStore.toJson(Map.of("k", "q\"u\\o\n")));
    }
}
