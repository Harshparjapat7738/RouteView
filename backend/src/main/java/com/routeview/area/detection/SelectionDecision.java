package com.routeview.area.detection;

import java.util.UUID;

import com.routeview.area.model.AreaType;

/** The outcome for one candidate area. Contains no geometry. */
public record SelectionDecision(UUID areaId, String name, AreaType areaType, SelectionVerdict verdict) {

    public boolean accepted() {
        return verdict == SelectionVerdict.ACCEPTED || verdict == SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT;
    }
}
