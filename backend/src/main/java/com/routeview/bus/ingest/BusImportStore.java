package com.routeview.bus.ingest;

import java.util.function.Function;

/**
 * Where a bus import is stored. One call = one transaction: the producer streams the validated records into the sink it is
 * given; if it (or anything else) throws, nothing is changed and the previous data stays as it was.
 */
public interface BusImportStore {

    /**
     * Opens a transaction, hands a sink to {@code producer}, then retires the records of the source that the dataset no
     * longer contains and records the dataset metadata.
     */
    BusImportStatistics replace(BusGtfsImporter.Options options, Function<BusImportSink, BusImportStatistics> producer);
}
