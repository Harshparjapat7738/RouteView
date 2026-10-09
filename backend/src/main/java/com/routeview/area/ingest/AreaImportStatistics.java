package com.routeview.area.ingest;

import java.util.EnumMap;
import com.routeview.area.model.AreaType;
import java.util.Map;

/** Counters of one import run, reported at the end. */
public final class AreaImportStatistics {

    private long processed;
    private long inserted;
    private long updated;
    private long unchanged;
    private long duplicates;
    private long invalidGeometries;
    private long repairedGeometries;
    private long parentLinksSet;
    private long parentLinksAmbiguous;
    private long parentLinksNotImported;
    private final Map<AreaType, Long> acceptedByType = new EnumMap<>(AreaType.class);
    private final Map<SkipReason, Long> skipped = new EnumMap<>(SkipReason.class);
    private final Map<RejectionReason, Long> rejected = new EnumMap<>(RejectionReason.class);

    void recordProcessed() {
        processed++;
    }

    void duplicate() {
        duplicates++;
    }

    void invalidGeometry(boolean repaired) {
        invalidGeometries++;
        if (repaired) {
            repairedGeometries++;
        }
    }

    void skipped(SkipReason reason) {
        skipped.merge(reason, 1L, Long::sum);
    }

    void rejected(RejectionReason reason) {
        rejected.merge(reason, 1L, Long::sum);
    }

    void stored(UpsertOutcome outcome, AreaType type) {
        acceptedByType.merge(type, 1L, Long::sum);
        switch (outcome) {
            case INSERTED -> inserted++;
            case UPDATED -> updated++;
            case UNCHANGED -> unchanged++;
        }
    }

    void parentLinks(long set, long ambiguous, long notImported) {
        parentLinksSet += set;
        parentLinksAmbiguous += ambiguous;
        parentLinksNotImported += notImported;
    }

    public long processed() {
        return processed;
    }

    /** Areas that passed validation and are in the database (inserted, updated or already identical). */
    public long valid() {
        return inserted + updated + unchanged;
    }

    public long inserted() {
        return inserted;
    }

    public long updated() {
        return updated;
    }

    public long unchanged() {
        return unchanged;
    }

    public long duplicates() {
        return duplicates;
    }

    public long invalidGeometries() {
        return invalidGeometries;
    }

    public long repairedGeometries() {
        return repairedGeometries;
    }

    public long parentLinksSet() {
        return parentLinksSet;
    }

    public long skippedTotal() {
        return skipped.values().stream().mapToLong(Long::longValue).sum();
    }

    public long rejectedTotal() {
        return rejected.values().stream().mapToLong(Long::longValue).sum();
    }

    /** Valid areas of this run by RouteView type (inserted, updated or already identical). */
    public Map<AreaType, Long> acceptedByType() {
        return Map.copyOf(acceptedByType);
    }

    public Map<RejectionReason, Long> rejectedByReason() {
        return Map.copyOf(rejected);
    }

    public Map<SkipReason, Long> skippedByReason() {
        return Map.copyOf(skipped);
    }

    /** Multi-line report for the log. */
    public String summary() {
        return String.join("\n",
                "Area import finished",
                "  Total records processed : " + processed,
                "  Valid geographical areas: " + valid(),
                "    inserted              : " + inserted,
                "    updated               : " + updated,
                "    unchanged             : " + unchanged,
                "    by type               : " + new java.util.TreeMap<>(acceptedByType),
                "  Skipped (not an area)   : " + skippedTotal() + " " + skipped,
                "  Rejected                : " + rejectedTotal() + " " + rejected,
                "  Invalid geometries      : " + invalidGeometries + " (repaired: " + repairedGeometries + ")",
                "  Duplicates in source    : " + duplicates,
                "  Parent links            : set " + parentLinksSet + ", ambiguous " + parentLinksAmbiguous
                        + ", parent not imported " + parentLinksNotImported);
    }
}
