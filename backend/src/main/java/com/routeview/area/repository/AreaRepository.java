package com.routeview.area.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.routeview.area.model.Area;

/**
 * The only place that reads and writes geographical areas.
 *
 * <p>Entity access only. The spatial query that finds the areas near a route is a separate repository,
 * {@link JdbcRouteAreaCandidateSource}, because it returns summaries rather than entities; SQL never
 * spreads into services or controllers.
 */
public interface AreaRepository extends JpaRepository<Area, UUID> {

    /** Finds an area by its identifier in the data source it was imported from. */
    Optional<Area> findBySourceAndSourceId(String source, String sourceId);
}
