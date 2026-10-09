package com.routeview.common.error;

/** One invalid input field in a 400 response. */
public record FieldValidationError(String field, String message) {
}
