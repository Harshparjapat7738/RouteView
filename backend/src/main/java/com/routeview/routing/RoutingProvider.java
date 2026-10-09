package com.routeview.routing;

import java.util.List;

import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.RoutingRequest;

/**
 * Port to an external routing service. Application code depends on this interface only;
 * provider-specific request and response formats stay inside the adapter.
 */
public interface RoutingProvider {

    /**
     * Calculates driving routes between two points.
     *
     * @return alternatives with the provider's preferred route first; empty when no route exists
     * @throws RoutingException when the provider cannot deliver a usable answer
     */
    List<RouteCandidate> computeRoutes(RoutingRequest request);
}
