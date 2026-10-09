package com.routeview.area.quality;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The developer command {@code gradlew areaQuality}: logs the {@link AreaQualityReport} and stops. It exists only when
 * {@code routeview.area-quality.run=true}; a normal start never creates it and no HTTP endpoint exposes it.
 */
@Component
@ConditionalOnProperty(prefix = "routeview.area-quality", name = "run", havingValue = "true")
class AreaQualityRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AreaQualityRunner.class);

    private final AreaQualityService service;

    AreaQualityRunner(AreaQualityService service) {
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        AreaQualityReport report = service.inspect();
        if (report.clean()) {
            log.info("\n{}", report.format());
        } else {
            log.warn("\n{}", report.format());
        }
    }
}
