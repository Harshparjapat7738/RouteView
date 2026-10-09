package com.routeview.route.dto;

import com.routeview.area.detection.DetectedArea;

/**
 * A geographical area on a route. Exposes no database or spatial internals: the position is a plain
 * latitude/longitude on the route where the area is first reached.
 */
public record DetectedAreaDto(
        String areaId,
        String name,
        String areaType,
        int sequence,
        double positionAlongRoute,
        long distanceFromStartMeters,
        double latitude,
        double longitude) {

    public static DetectedAreaDto from(DetectedArea area) {
        return new DetectedAreaDto(
                area.areaId().toString(),
                area.name(),
                area.areaType().name(),
                area.sequence(),
                area.positionAlongRoute(),
                area.distanceFromRouteStartMeters(),
                area.location().latitude(),
                area.location().longitude());
    }
}
