package com.routeview.configuration;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * HTTP API configuration shared by all modules.
 * All application endpoints live under {@value #API_PATH_PATTERN}.
 */
@Configuration
public class WebConfiguration implements WebMvcConfigurer {

    public static final String API_PATH_PATTERN = "/api/**";

    private static final long CORS_PREFLIGHT_MAX_AGE_SECONDS = 3600;

    private final CorsProperties corsProperties;

    public WebConfiguration(CorsProperties corsProperties) {
        this.corsProperties = corsProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (corsProperties.allowedOrigins().isEmpty()) {
            return;
        }
        registry.addMapping(API_PATH_PATTERN)
                .allowedOrigins(corsProperties.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .allowCredentials(false)
                .maxAge(CORS_PREFLIGHT_MAX_AGE_SECONDS);
    }
}
