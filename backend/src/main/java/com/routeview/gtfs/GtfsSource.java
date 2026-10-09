package com.routeview.gtfs;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * A GTFS feed on disk: a .zip file or an unpacked directory. Tables are read row by row (stop_times can be large)
 * and never kept as raw text. Rows are maps from header name to value.
 */
public final class GtfsSource {

    private static final int MAX_ROWS_PER_TABLE = 5_000_000;

    private final Path path;

    public GtfsSource(Path path) {
        this.path = path;
    }

    /** Thrown when the feed cannot be used at all (file or required column missing). */
    public static final class InvalidFeedException extends RuntimeException {
        public InvalidFeedException(String message) {
            super(message);
        }
    }

    public boolean hasTable(String name) {
        try {
            if (Files.isDirectory(path)) {
                return Files.isRegularFile(path.resolve(name));
            }
            try (ZipFile zip = new ZipFile(path.toFile())) {
                return zip.getEntry(name) != null;
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Reads one table. Fails with {@link InvalidFeedException} when the table or a required column is missing;
     * returns the number of data rows delivered (blank lines are ignored).
     */
    public int forEachRow(String table, List<String> requiredColumns, Consumer<Map<String, String>> consumer) {
        if (!hasTable(table)) {
            throw new InvalidFeedException("The dataset has no " + table);
        }
        try (ZipFileHolder holder = open(table); BufferedReader reader = new BufferedReader(new InputStreamReader(holder.stream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new InvalidFeedException(table + " is empty");
            }
            if (!headerLine.isEmpty() && headerLine.charAt(0) == '﻿') {
                headerLine = headerLine.substring(1);
            }
            List<String> header = Csv.parseLine(headerLine).stream().map(String::strip).toList();
            for (String column : requiredColumns) {
                if (!header.contains(column)) {
                    throw new InvalidFeedException(table + " has no required column '" + column + "'");
                }
            }
            int rows = 0;
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                if (++rows > MAX_ROWS_PER_TABLE) {
                    throw new InvalidFeedException(table + " has too many rows");
                }
                List<String> values = Csv.parseLine(line);
                Map<String, String> row = new HashMap<>();
                for (int i = 0; i < header.size(); i++) {
                    row.put(header.get(i), i < values.size() ? values.get(i).strip() : "");
                }
                consumer.accept(row);
            }
            return rows;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private interface ZipFileHolder extends AutoCloseable {
        InputStream stream();

        @Override
        void close() throws IOException;
    }

    private ZipFileHolder open(String table) throws IOException {
        if (Files.isDirectory(path)) {
            InputStream in = Files.newInputStream(path.resolve(table));
            return new ZipFileHolder() {
                public InputStream stream() { return in; }
                public void close() throws IOException { in.close(); }
            };
        }
        ZipFile zip = new ZipFile(path.toFile());
        ZipEntry entry = zip.getEntry(table);
        InputStream in = zip.getInputStream(entry);
        return new ZipFileHolder() {
            public InputStream stream() { return in; }
            public void close() throws IOException { in.close(); zip.close(); }
        };
    }
}
