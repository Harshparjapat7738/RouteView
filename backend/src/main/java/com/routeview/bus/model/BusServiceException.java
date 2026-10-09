package com.routeview.bus.model;

import java.time.LocalDate;

/** A calendar_dates.txt entry: {@code added} = service runs that date, otherwise it does not. */
public record BusServiceException(String serviceExternalId, LocalDate date, boolean added) {
}
