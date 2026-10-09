package com.routeview.bus.ingest;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import com.routeview.bus.model.BusAgency;
import com.routeview.bus.model.BusRoute;
import com.routeview.bus.model.BusService;
import com.routeview.bus.model.BusServiceException;
import com.routeview.bus.model.BusShape;
import com.routeview.bus.model.BusStop;
import com.routeview.bus.model.BusStopTime;
import com.routeview.bus.model.BusTrip;

/**
 * Receives the validated records of a bus import in batches (a feed can have millions of stop times, so nothing is kept in
 * memory as a whole). Order: agencies, stops, routes, services, shapes, trips, stop times (many calls), discardTrips, finish.
 * The database implementation runs all of it in ONE transaction: a failed import leaves the previous data untouched.
 */
public interface BusImportSink {

    void agencies(List<BusAgency> agencies);

    void stops(List<BusStop> stops);

    void routes(List<BusRoute> routes);

    void services(List<BusService> services, List<BusServiceException> exceptions);

    void shapes(List<BusShape> shapes);

    void trips(List<BusTrip> trips);

    void stopTimes(List<BusStopTime> stopTimes);

    /** Trips that turned out unusable (fewer than two valid stop times, times going backwards): they are removed again. */
    void discardTrips(Collection<UUID> tripIds);

    /** Called once after everything: records the dataset metadata and statistics and retires records no longer in the dataset. */
    void finish(BusImportStatistics statistics);
}
