package com.routeview.area.detection;

import java.util.List;

import org.locationtech.jts.geom.LineString;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.routeview.route.model.Route;
import com.routeview.spatial.RouteGeometry;
import com.routeview.spatial.RouteGeometryNormalizer;

/**
 * The Area Detection Engine: given a calculated route, finds the geographical areas it passes through,
 * in travel order.
 *
 * <pre>
 * route geometry -> normalise -> 1 PostGIS query (candidates) -> relevance, de-duplication, hierarchy -> ordered stops
 * </pre>
 *
 * <p>Detection never makes route calculation fail: missing or invalid geometry, a database problem or a
 * failed spatial query is logged (class names only) and yields an empty result.
 */
@Service
public class AreaDetectionService implements AreaDetector {

    private static final Logger log = LoggerFactory.getLogger(AreaDetectionService.class);

    private final RouteAreaCandidateSource candidateSource;
    private final AreaDetectionProperties properties;
    private final AreaSelectionPolicy policy;

    public AreaDetectionService(RouteAreaCandidateSource candidateSource, AreaDetectionProperties properties) {
        this.candidateSource = candidateSource;
        this.properties = properties;
        this.policy = new AreaSelectionPolicy(properties);
    }

    @Override
    public List<DetectedArea> detectAreas(Route route) {
        try {
            // Stage 1: a valid SRID 4326 line (x = longitude, y = latitude), or a meaningful InvalidRouteGeometryException.
            LineString geometry = RouteGeometryNormalizer.normalize(
                    RouteGeometry.fromEncodedPolyline(route.encodedPolyline(), properties.maxRouteVertices()),
                    properties.maxRouteVertices());
            // Stage 2: one spatial query for the whole route (never one per area).
            List<RouteAreaCandidate> candidates = candidateSource.findCandidates(
                    geometry, properties.toleranceMeters(), properties.selectableTypeSet(),
                    properties.boundaryBandMeters(), properties.minCrossingFloorMeters());
            // Stages 3-6: relevance, duplicates, hierarchy, order (plain Java, explainable per candidate).
            SelectionResult selection = policy.evaluate(candidates);
            List<DetectedArea> detected = selection.areas();
            if (log.isDebugEnabled()) {
                log.debug("Route {}: {} candidates, {} journey areas, verdicts {}",
                        route.index(), candidates.size(), detected.size(), selection.countsByVerdict());
            }
            return detected;
        } catch (IllegalArgumentException invalid) {
            log.warn("Area detection skipped for route {}: invalid route geometry ({})", route.index(), invalid.getMessage());
        } catch (RuntimeException failure) {
            // Database or spatial-query failure: the route itself is still valid and is returned without areas.
            log.warn("Area detection failed for route {}: {}", route.index(), failure.getClass().getSimpleName());
        }
        return List.of();
    }
}
