package com.routeview.area.ingest;

/** What storing one area did. */
public enum UpsertOutcome {
    INSERTED,
    UPDATED,
    /** The stored area was already identical; nothing was written. */
    UNCHANGED
}
