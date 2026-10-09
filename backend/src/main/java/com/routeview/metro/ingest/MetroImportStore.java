package com.routeview.metro.ingest;

/** Where a validated dataset is stored. One call = one transaction: a failed import leaves the old data untouched. */
public interface MetroImportStore {

    /**
     * Makes {@code dataset} the current data of its source: matching stations / lines are updated in place,
     * new ones inserted, ones missing from the dataset marked inactive, and the station-line links of the
     * source replaced.
     */
    StoreResult replace(MetroDataset dataset);

    record StoreResult(int stationsInserted, int stationsUpdated, int stationsDeactivated, int linesInserted, int linesUpdated, int linesDeactivated) {
    }
}
