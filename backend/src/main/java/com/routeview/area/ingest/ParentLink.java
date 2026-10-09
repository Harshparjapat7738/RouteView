package com.routeview.area.ingest;

/** A parent relationship between two areas of the same source, identified by their external ids. */
public record ParentLink(String source, String childExternalId, String parentExternalId) {
}
