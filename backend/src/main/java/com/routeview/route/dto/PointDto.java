package com.routeview.route.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import com.routeview.common.geo.Coordinates;

/** A geographic point in a request body. */
public record PointDto(
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude) {

    public Coordinates toCoordinates() {
        return new Coordinates(latitude, longitude);
    }
}
