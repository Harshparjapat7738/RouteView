package com.routeview.common.accessibility;

/**
 * What a dataset says about wheelchair access at one station or stop. Three states that are never merged: a station is
 * {@code ACCESSIBLE} or {@code INACCESSIBLE} only when the source says so explicitly; a missing, empty or unrecognised value is
 * {@code UNKNOWN}, never "accessible". {@code source} and {@code sourceVersion} say where the statement comes from (the dataset
 * it was imported from), so its age can be judged; both are null for {@code UNKNOWN}.
 *
 * <p>The GTFS field is {@code wheelchair_boarding}: 1 = some vehicles at this stop can be boarded in a wheelchair, 2 = not
 * possible, 0 / empty = no information. It says nothing about lifts, step-free connections inside a station or the walk to it.
 */
public record Accessibility(Status status, String source, String sourceVersion) {

    public enum Status { ACCESSIBLE, INACCESSIBLE, UNKNOWN }

    public static final Accessibility UNKNOWN = new Accessibility(Status.UNKNOWN, null, null);

    public Accessibility {
        if (status == null || status == Status.UNKNOWN) {
            status = Status.UNKNOWN;
            source = null;
            sourceVersion = null;
        }
    }

    /** A GTFS {@code wheelchair_boarding} value: only an explicit 1 or 2 is a statement. */
    public static Status fromGtfs(String raw) {
        if (raw == null) {
            return Status.UNKNOWN;
        }
        return switch (raw.trim()) {
            case "1" -> Status.ACCESSIBLE;
            case "2" -> Status.INACCESSIBLE;
            default -> Status.UNKNOWN;
        };
    }

    /**
     * One statement for a station made of several GTFS stops: {@code ACCESSIBLE} only when every stop says so, {@code INACCESSIBLE}
     * only when every stop says so, otherwise {@code UNKNOWN} (a mixed or partly missing answer is not a claim either way).
     */
    public static Status combine(java.util.Collection<Status> statuses) {
        if (statuses.isEmpty()) {
            return Status.UNKNOWN;
        }
        if (statuses.stream().allMatch(s -> s == Status.ACCESSIBLE)) {
            return Status.ACCESSIBLE;
        }
        if (statuses.stream().allMatch(s -> s == Status.INACCESSIBLE)) {
            return Status.INACCESSIBLE;
        }
        return Status.UNKNOWN;
    }

    /** The statement for a stored status name ("ACCESSIBLE", "INACCESSIBLE"); anything else is unknown. */
    public static Accessibility of(String storedStatus, String source, String sourceVersion) {
        if (storedStatus == null) {
            return UNKNOWN;
        }
        return switch (storedStatus) {
            case "ACCESSIBLE" -> new Accessibility(Status.ACCESSIBLE, source, sourceVersion);
            case "INACCESSIBLE" -> new Accessibility(Status.INACCESSIBLE, source, sourceVersion);
            default -> UNKNOWN;
        };
    }
}
