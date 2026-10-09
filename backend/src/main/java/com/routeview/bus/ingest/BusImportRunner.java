package com.routeview.bus.ingest;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The explicit bus import command. It exists only when {@code routeview.bus-import.run=true} (set by
 * {@code gradlew importBus}); a normal start never imports and there is no HTTP endpoint for it.
 */
@Component
@ConditionalOnProperty(prefix = "routeview.bus-import", name = "run", havingValue = "true")
class BusImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BusImportRunner.class);

    private final BusImportService service;
    private final BusImportProperties properties;

    BusImportRunner(BusImportService service, BusImportProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (properties.sourceFile().isEmpty()) {
            throw new IllegalArgumentException("BUS_IMPORT_SOURCE_FILE is required: the path of the bus GTFS dataset.");
        }
        log.info("Importing bus data from {}", properties.sourceFile());
        service.importDataset(Path.of(properties.sourceFile()), properties.toOptions());
    }
}
