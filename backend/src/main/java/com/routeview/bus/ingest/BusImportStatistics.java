package com.routeview.bus.ingest;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Counts of one bus import, in the terms of the feed: what was read, what was kept and what was rejected. */
public final class BusImportStatistics {

    public int agenciesRead;
    public int agenciesImported;
    public int stopsRead;
    public int stopsImported;
    public int nonStopLocationsSkipped;
    public int routesRead;
    public int routesImported;
    public int servicesImported;
    public int calendarDatesImported;
    public int shapePointsRead;
    public int shapesImported;
    public int tripsRead;
    public int tripsImported;
    public int tripsRejected;
    public int invalidShapeReferences;
    public int tripsWithoutShape;
    public int stopTimesRead;
    public int stopTimesImported;
    public int unusedStops;
    public int routesWithoutTrips;
    public int invalidRecords;
    public int duplicatesSkipped;
    public int tripsWithHeadsign;
    public int tripsWithDirection;
    public LocalDate servicePeriodStart;
    public LocalDate servicePeriodEnd;
    public List<String> operatingDays = List.of();
    private final Map<String, Integer> rejectionReasons = new LinkedHashMap<>();
    private final List<String> warnings = new ArrayList<>();

    void invalid(String reason) {
        invalidRecords++;
        rejectionReasons.merge(reason, 1, Integer::sum);
    }

    void warn(String message) {
        if (warnings.size() < 200) {
            warnings.add(message);
        }
    }

    public Map<String, Integer> rejectionReasons() {
        return Map.copyOf(rejectionReasons);
    }

    public List<String> warnings() {
        return List.copyOf(warnings);
    }

    /** Flat map for logging and for the bus_dataset.statistics column. */
    public Map<String, Object> asMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("agenciesImported", agenciesImported);
        map.put("stopsRead", stopsRead);
        map.put("stopsImported", stopsImported);
        map.put("nonStopLocationsSkipped", nonStopLocationsSkipped);
        map.put("routesRead", routesRead);
        map.put("routesImported", routesImported);
        map.put("servicesImported", servicesImported);
        map.put("calendarDatesImported", calendarDatesImported);
        map.put("shapePointsRead", shapePointsRead);
        map.put("shapesImported", shapesImported);
        map.put("tripsRead", tripsRead);
        map.put("tripsImported", tripsImported);
        map.put("tripsRejected", tripsRejected);
        map.put("invalidShapeReferences", invalidShapeReferences);
        map.put("tripsWithoutShape", tripsWithoutShape);
        map.put("stopTimesRead", stopTimesRead);
        map.put("stopTimesImported", stopTimesImported);
        map.put("unusedStops", unusedStops);
        map.put("routesWithoutTrips", routesWithoutTrips);
        map.put("invalidRecords", invalidRecords);
        map.put("duplicatesSkipped", duplicatesSkipped);
        map.put("tripsWithHeadsign", tripsWithHeadsign);
        map.put("tripsWithDirection", tripsWithDirection);
        map.put("warnings", warnings.size());
        return map;
    }

    @Override
    public String toString() {
        return "Agencies: " + agenciesImported + "\n"
                + "Stops imported: " + stopsImported + " of " + stopsRead + " (non-stop locations skipped: " + nonStopLocationsSkipped + ", unused: " + unusedStops + ")\n"
                + "Routes imported: " + routesImported + " of " + routesRead + " (without trips: " + routesWithoutTrips + ")\n"
                + "Services: " + servicesImported + ", calendar dates: " + calendarDatesImported + "\n"
                + "Trips imported: " + tripsImported + " of " + tripsRead + " (rejected: " + tripsRejected + ")\n"
                + "Stop times imported: " + stopTimesImported + " of " + stopTimesRead + "\n"
                + "Shapes imported: " + shapesImported + " (points " + shapePointsRead + ", invalid shape references: " + invalidShapeReferences
                + ", trips without a shape: " + tripsWithoutShape + ")\n"
                + "Invalid records: " + invalidRecords + " " + rejectionReasons + "\n"
                + "Duplicates skipped: " + duplicatesSkipped + "\n"
                + "Trips with headsign: " + tripsWithHeadsign + ", with direction: " + tripsWithDirection + "\n"
                + "Service period: " + servicePeriodStart + " to " + servicePeriodEnd + " " + operatingDays + "\n"
                + "Warnings: " + warnings.size();
    }
}
