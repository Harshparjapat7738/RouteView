package com.routeview.area.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The explicit import command. It exists only when {@code routeview.area-import.run=true}, which is set by
 * {@code gradlew importAreas}; a normal {@code bootRun} or deployment never creates it, so nothing is imported
 * at startup. It is not exposed through any HTTP endpoint.
 */
@Component
@ConditionalOnProperty(prefix = "routeview.area-import", name = "run", havingValue = "true")
class AreaImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AreaImportRunner.class);

    private final AreaImportService importService;
    private final AreaImportProperties properties;

    AreaImportRunner(AreaImportService importService, AreaImportProperties properties) {
        this.importService = importService;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        ImportRegion region = null;
        if (properties.usesSourceFile()) {
            log.info("Importing areas from the saved file {}", properties.sourceFile());
        } else {
            region = ImportRegion.parse(properties.region());
            if (region.maxSpanDegrees() > properties.maxSpanDegrees()) {
                throw new IllegalArgumentException("AREA_IMPORT_REGION is larger than " + properties.maxSpanDegrees()
                        + " degrees. Import a smaller region or raise AREA_IMPORT_MAX_SPAN_DEGREES deliberately.");
            }
            log.info("Importing areas of region {}", region);
        }
        importService.importAreas(region);
    }
}
