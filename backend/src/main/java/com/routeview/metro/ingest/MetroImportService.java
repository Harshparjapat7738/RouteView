package com.routeview.metro.ingest;

import com.routeview.gtfs.GtfsSource;

import java.nio.file.Files;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Reads a GTFS dataset from disk, validates it and stores it. Only reachable from the import command. */
@Service
public class MetroImportService {

    private static final Logger log = LoggerFactory.getLogger(MetroImportService.class);

    private final MetroImportStore store;

    public MetroImportService(MetroImportStore store) {
        this.store = store;
    }

    public MetroImportStatistics importDataset(Path file, MetroGtfsImporter.Options options) {
        if (!Files.exists(file)) {
            throw new IllegalArgumentException("METRO_IMPORT_SOURCE_FILE does not exist: " + file);
        }
        MetroDataset dataset = MetroGtfsImporter.read(new GtfsSource(resolveSource(file)), options);
        if (dataset.stations().isEmpty() || dataset.lines().isEmpty()) {
            // Never replace working data with an empty or unusable dataset.
            throw new IllegalStateException("The dataset has no usable stations or lines; nothing was imported.\n" + dataset.statistics());
        }
        MetroImportStore.StoreResult result = store.replace(dataset);
        log.info("Metro import finished (source {}, version {}):\n{}\nStored: {}", options.source(), options.sourceVersion(), dataset.statistics(), result);
        return dataset.statistics();
    }

    /**
     * The configured path may be the .zip itself, the folder with the GTFS .txt files, or a folder (such as
     * backend/metro.data) that holds exactly one .zip or exactly one unpacked dataset folder (or, when several datasets share
     * the folder, one named "metro").
     */
    static Path resolveSource(Path path) {
        if (!Files.isDirectory(path) || Files.exists(path.resolve("stops.txt"))) {
            return path;
        }
        try (Stream<Path> entries = Files.list(path)) {
            List<Path> zips = entries.filter(e -> Files.isRegularFile(e) && e.getFileName().toString().toLowerCase().endsWith(".zip")).toList();
            if (zips.size() == 1) {
                return zips.get(0);
            }
            if (zips.size() > 1) {
                throw new IllegalArgumentException("More than one .zip in " + path + ": keep only the dataset to import there.");
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        try (Stream<Path> entries = Files.list(path)) {
            List<Path> folders = entries.filter(e -> Files.isDirectory(e) && Files.exists(e.resolve("stops.txt"))).toList();
            if (folders.size() == 1) {
                return folders.get(0);
            }
            // metro.data also holds other datasets (such as bus/): the metro import takes the folder named "metro".
            List<Path> named = folders.stream().filter(f -> f.getFileName().toString().equalsIgnoreCase("metro")).toList();
            if (named.size() == 1) {
                return named.get(0);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        throw new IllegalArgumentException("No GTFS dataset found in " + path + ": put the dataset .zip (or its unzipped folder containing stops.txt) there.");
    }
}
