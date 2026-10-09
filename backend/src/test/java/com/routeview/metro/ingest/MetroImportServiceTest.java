package com.routeview.metro.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

class MetroImportServiceTest {

    private static void dataset(Path folder) throws IOException {
        Files.createDirectories(folder);
        Files.writeString(folder.resolve("stops.txt"), "stop_id\n");
    }

    @Test
    void metroImportTakesTheMetroFolderWhenOtherDatasetsShareTheDataFolder() throws IOException {
        Path root = Files.createTempDirectory("metro-data");
        dataset(root.resolve("metro"));
        dataset(root.resolve("bus"));
        assertEquals(root.resolve("metro"), MetroImportService.resolveSource(root));
    }

    @Test
    void aSingleDatasetFolderIsStillFoundWhateverItIsCalled() throws IOException {
        Path root = Files.createTempDirectory("metro-data");
        dataset(root.resolve("dmrc"));
        assertEquals(root.resolve("dmrc"), MetroImportService.resolveSource(root));
    }

    @Test
    void severalUnnamedDatasetsAreRefusedInsteadOfGuessing() throws IOException {
        Path root = Files.createTempDirectory("metro-data");
        dataset(root.resolve("a"));
        dataset(root.resolve("b"));
        assertThrows(IllegalArgumentException.class, () -> MetroImportService.resolveSource(root));
    }
}
