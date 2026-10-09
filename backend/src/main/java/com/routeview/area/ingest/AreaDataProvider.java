package com.routeview.area.ingest;

import java.io.IOException;

/**
 * A source of geographical areas. The importer only knows this interface and {@link NormalizedArea};
 * adding another source means adding another implementation, not changing the importer.
 *
 * <p>Implementations read records one at a time and report them to the sink, so a large region is
 * never held in memory as a whole.
 */
public interface AreaDataProvider {

    /** Stable name stored in {@code area.source} (e.g. {@code openstreetmap}). Never change it once data exists. */
    String sourceName();

    /**
     * Reads the areas of a region.
     *
     * @param region the region to read; may be null only for providers that read a prepared file
     *               (they must say so; others reject null)
     */
    void read(ImportRegion region, AreaImportSink sink) throws IOException;
}
