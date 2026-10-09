package com.routeview.metro.ingest;

import java.time.LocalDate;
import java.util.List;

import com.routeview.metro.model.MetroConnection;
import com.routeview.metro.model.MetroLine;
import com.routeview.metro.model.MetroServicePeriod;
import com.routeview.metro.model.MetroShape;
import com.routeview.metro.model.MetroStation;
import com.routeview.metro.model.MetroStationLine;

/** The validated, normalised result of reading a feed, ready to be stored in one transaction. */
public record MetroDataset(
        String source,
        String sourceVersion,
        LocalDate sourceUpdatedAt,
        List<MetroStation> stations,
        List<MetroLine> lines,
        List<MetroStationLine> stationLines,
        List<MetroConnection> connections,
        List<MetroShape> shapes,
        MetroServicePeriod servicePeriod,
        MetroImportStatistics statistics) {
}
