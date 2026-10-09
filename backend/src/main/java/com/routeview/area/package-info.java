/**
 * Geographical areas (village, locality, sector, town, city, district, ...) stored in PostgreSQL/PostGIS.
 * Never POIs or businesses. Layout: {@code model} (entity, area types), {@code repository} (the only
 * place for queries, including future PostGIS ones), {@code service} (boundary for other modules).
 * Which areas a route passes through is not decided here yet.
 */
package com.routeview.area;
