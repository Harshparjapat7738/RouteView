package com.routeview.metro.ingest;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The explicit metro import command. It exists only when {@code routeview.metro-import.run=true} (set by
 * {@code gradlew importMetro}); a normal start never imports and there is no HTTP endpoint for it.
 */
@Component
@ConditionalOnProperty(prefix = "routeview.metro-import", name = "run", havingValue = "true")
class MetroImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MetroImportRunner.class);

    private final MetroImportService service;
    private final MetroImportProperties properties;

    MetroImportRunner(MetroImportService service, MetroImportProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (properties.sourceFile().isEmpty()) {
            throw new IllegalArgumentException("METRO_IMPORT_SOURCE_FILE is required: the path of the downloaded DMRC GTFS .zip.");
        }
        log.info("Importing metro data from {}", properties.sourceFile());
        service.importDataset(Path.of(properties.sourceFile()), properties.toOptions());
    }
}
