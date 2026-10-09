package com.routeview.bus.model;

import java.util.UUID;

/** A transit agency of the bus dataset (for example DTC, DIMTS). Identity is the GTFS agency_id. */
public record BusAgency(UUID id, String externalId, String name, String url, String timezone) {
}
