package com.routeview.bus.model;

import java.time.LocalDate;
import java.util.List;

/** A service calendar (GTFS calendar.txt): the weekdays it runs on, between two dates. */
public record BusService(String externalId, List<String> operatingDays, LocalDate start, LocalDate end) {
}
