package com.routeview.bus.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.routeview.bus.BusTestData;

class BusImportServiceTest {

    @Test
    void resolvesTheBusFolderNextToTheMetroFolder() throws IOException {
        Path root = Files.createTempDirectory("metro-data");
        BusTestData.write(root.resolve("metro"), java.util.Map.of("stops.txt", "stop_id"));
        BusTestData.write(root.resolve("bus"), java.util.Map.of("stops.txt", "stop_id"));
        assertEquals(root.resolve("bus"), BusImportService.resolveSource(root));
        assertEquals(root.resolve("bus"), BusImportService.resolveSource(root.resolve("bus")));
    }

    @Test
    void resolvesASingleDatasetFolderAndRefusesAnEmptyOne() throws IOException {
        Path single = Files.createTempDirectory("single");
        BusTestData.write(single.resolve("anything"), java.util.Map.of("stops.txt", "stop_id"));
        assertEquals(single.resolve("anything"), BusImportService.resolveSource(single));
        Path empty = Files.createTempDirectory("empty");
        assertThrows(IllegalArgumentException.class, () -> BusImportService.resolveSource(empty));
        Path two = Files.createTempDirectory("two");
        BusTestData.write(two.resolve("a"), java.util.Map.of("stops.txt", "stop_id"));
        BusTestData.write(two.resolve("b"), java.util.Map.of("stops.txt", "stop_id"));
        assertThrows(IllegalArgumentException.class, () -> BusImportService.resolveSource(two));
    }

    @Test
    void aMissingSourceIsReported() {
        BusImportService service = new BusImportService((options, producer) -> null);
        assertThrows(IllegalArgumentException.class, () -> service.importDataset(Path.of("/does/not/exist"), BusTestData.options()));
    }
}
