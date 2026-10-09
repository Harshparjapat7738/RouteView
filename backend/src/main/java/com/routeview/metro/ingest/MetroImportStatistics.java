package com.routeview.metro.ingest;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Counts of one import, in the terms of the feed: what was read, what was kept and what was rejected.
 * Mutable while the import runs; reported at the end.
 */
public final class MetroImportStatistics {

    public int stopsRead;
    public int stationsImported;
    public int routesRead;
    public int routesImported;
    public int tripsRead;
    public int tripsImported;
    public int stopTimesRead;
    public int stopTimesImported;
    public int stationLinksImported;
    public int interchangeStations;
    public int invalidRecords;
    public int duplicatesSkipped;
    public int nonStationStopsSkipped;
    public int unusedStationsSkipped;
    public int connectionsImported;
    public int lineGroups;
    public int shapesImported;
    public int invalidShapes;
    public int tripsWithoutShape;
    public int tripsWithHeadsign;
    public int tripsWithDirection;
    private final java.util.List<String> warnings = new java.util.ArrayList<>();
    private final Map<String, Integer> rejectionReasons = new LinkedHashMap<>();

    void invalid(String reason) {
        invalidRecords++;
        rejectionReasons.merge(reason, 1, Integer::sum);
    }

    void warn(String message) {
        if (warnings.size() < 200) {
            warnings.add(message);
        }
    }

    public java.util.List<String> warnings() {
        return java.util.List.copyOf(warnings);
    }

    public Map<String, Integer> rejectionReasons() {
        return Map.copyOf(rejectionReasons);
    }

    /** Flat map for logging and for the metro_dataset.statistics column. */
    public Map<String, Object> asMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("stationsImported", stationsImported);
        map.put("routesImported", routesImported);
        map.put("tripsImported", tripsImported);
        map.put("stopTimesImported", stopTimesImported);
        map.put("stationLinksImported", stationLinksImported);
        map.put("interchangeStations", interchangeStations);
        map.put("stopsRead", stopsRead);
        map.put("routesRead", routesRead);
        map.put("tripsRead", tripsRead);
        map.put("stopTimesRead", stopTimesRead);
        map.put("invalidRecords", invalidRecords);
        map.put("duplicatesSkipped", duplicatesSkipped);
        map.put("nonStationStopsSkipped", nonStationStopsSkipped);
        map.put("unusedStationsSkipped", unusedStationsSkipped);
        map.put("connectionsImported", connectionsImported);
        map.put("lineGroups", lineGroups);
        map.put("shapesImported", shapesImported);
        map.put("invalidShapes", invalidShapes);
        map.put("tripsWithoutShape", tripsWithoutShape);
        map.put("tripsWithHeadsign", tripsWithHeadsign);
        map.put("tripsWithDirection", tripsWithDirection);
        map.put("warnings", warnings.size());
        return map;
    }

    @Override
    public String toString() {
        return "Stations imported: " + stationsImported + " (interchanges: " + interchangeStations + ")\n"
                + "Routes imported: " + routesImported + " of " + routesRead + "\n"
                + "Trips imported: " + tripsImported + " of " + tripsRead + "\n"
                + "Stop times imported: " + stopTimesImported + " of " + stopTimesRead + "\n"
                + "Station-line links: " + stationLinksImported + "\n"
                + "Invalid records: " + invalidRecords + " " + rejectionReasons + "\n"
                + "Duplicates skipped: " + duplicatesSkipped + "\n"
                + "Non-station stops skipped: " + nonStationStopsSkipped + "\n"
                + "Stops not used by any trip: " + unusedStationsSkipped + "\n"
                + "Connections: " + connectionsImported + ", logical lines: " + lineGroups + "\n"
                + "Shapes imported: " + shapesImported + " (invalid: " + invalidShapes + ", trips without a shape: " + tripsWithoutShape + ")\n"
                + "Trips with headsign: " + tripsWithHeadsign + ", with direction: " + tripsWithDirection + "\n"
                + "Warnings: " + warnings.size();
    }
}
