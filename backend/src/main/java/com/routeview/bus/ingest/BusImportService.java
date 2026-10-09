package com.routeview.bus.ingest;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.routeview.gtfs.GtfsSource;

/** Reads a bus GTFS dataset from disk, validates it and stores it. Only reachable from the import command. */
@Service
public class BusImportService {

    private static final Logger log = LoggerFactory.getLogger(BusImportService.class);

    private final BusImportStore store;

    public BusImportService(BusImportStore store) {
        this.store = store;
    }

    public BusImportStatistics importDataset(Path file, BusGtfsImporter.Options options) {
        if (!Files.exists(file)) {
            throw new IllegalArgumentException("BUS_IMPORT_SOURCE_FILE does not exist: " + file);
        }
        GtfsSource feed = new GtfsSource(resolveSource(file));
        BusImportStatistics stats = store.replace(options, sink -> BusGtfsImporter.read(feed, options, sink));
        log.info("Bus import finished (source {}, version {}):\n{}", options.source(), options.sourceVersion(), stats);
        return stats;
    }

    /**
     * The configured path may be the .zip itself, the folder with the GTFS .txt files, or a folder (such as
     * backend/metro.data) that holds exactly one .zip or one unpacked dataset folder, or, when several datasets share the
     * folder, one named "bus".
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
                throw new IllegalArgumentException("More than one .zip in " + path + ": point BUS_IMPORT_SOURCE_FILE at the bus dataset.");
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        try (Stream<Path> entries = Files.list(path)) {
            List<Path> folders = entries.filter(e -> Files.isDirectory(e) && Files.exists(e.resolve("stops.txt"))).toList();
            List<Path> named = folders.stream().filter(f -> f.getFileName().toString().equalsIgnoreCase("bus")).toList();
            if (named.size() == 1) {
                return named.get(0);
            }
            if (folders.size() == 1) {
                return folders.get(0);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        throw new IllegalArgumentException("No GTFS dataset found in " + path + ": put the bus dataset (a .zip or a folder containing stops.txt) there.");
    }
}
