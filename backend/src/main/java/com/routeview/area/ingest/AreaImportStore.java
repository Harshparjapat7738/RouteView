package com.routeview.area.ingest;

import java.util.List;

/** Where imported areas are written. The PostGIS implementation is {@code JdbcAreaImportStore}. */
public interface AreaImportStore {

    /**
     * Stores the areas in one transaction: new ones are inserted, changed ones updated, identical ones left alone.
     * The outcomes are in the order of {@code areas}. If any area is refused by the database, nothing is stored
     * and an exception is thrown.
     */
    List<UpsertOutcome> upsertBatch(List<NormalizedArea> areas);

    /** Stores one area in its own transaction; used to find the offending area after a failed batch. */
    UpsertOutcome upsertOne(NormalizedArea area);

    /** Sets {@code parent_area_id} for links whose child and parent both exist; returns how many rows changed. */
    int linkParents(List<ParentLink> links);
}
