package com.routeview.metro.model;

import java.time.LocalDate;
import java.util.List;

/**
 * The period and weekdays the dataset's own timetable covers (from {@code calendar.txt}, only for services that
 * have trips). RouteView does not use the dataset's timetable for journeys; this is kept so that it is never
 * presented as current when it is not.
 */
public record MetroServicePeriod(LocalDate start, LocalDate end, List<String> operatingDays) {
    public MetroServicePeriod {
        operatingDays = List.copyOf(operatingDays);
    }
}
