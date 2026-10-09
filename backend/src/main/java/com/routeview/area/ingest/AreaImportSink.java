package com.routeview.area.ingest;

/** Receives what a provider found while reading a region. Implemented by the import service. */
public interface AreaImportSink {

    /** A record that is a geographical area according to the provider's rules. */
    void accept(NormalizedArea area);

    /** A record that was deliberately ignored because it is not a geographical area. */
    void skipped(SkipReason reason);

    /** A record that looked like an area but could not be turned into one. */
    void rejected(String externalId, RejectionReason reason, String detail);

    /** The source states that {@code parentExternalId} contains {@code childExternalId}. */
    void parentLink(String childExternalId, String parentExternalId);
}
