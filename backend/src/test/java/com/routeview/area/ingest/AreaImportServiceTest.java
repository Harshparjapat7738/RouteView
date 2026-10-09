package com.routeview.area.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;

import com.routeview.area.model.AreaType;
import com.routeview.spatial.SpatialReference;

class AreaImportServiceTest {

    private static final String SQUARE = "POLYGON((10 10, 10.1 10, 10.1 10.1, 10 10.1, 10 10))";
    private static final String BOW_TIE = "POLYGON((11 11, 11.1 11.1, 11.1 11, 11 11.1, 11 11))";

    private static Geometry wkt(String text) {
        try {
            return new WKTReader(SpatialReference.geometryFactory()).read(text);
        } catch (ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    private static NormalizedArea area(String id, String wkt) {
        return new NormalizedArea("test", id, "Name of " + id, AreaType.VILLAGE, wkt == null ? null : wkt(wkt), null, Map.of());
    }

    /** In-memory store keyed like the database: source + external id. */
    private static final class FakeStore implements AreaImportStore {
        final Map<String, NormalizedArea> rows = new HashMap<>();
        final List<Integer> batchSizes = new ArrayList<>();
        final List<ParentLink> links = new ArrayList<>();
        String refuseId;

        @Override
        public List<UpsertOutcome> upsertBatch(List<NormalizedArea> areas) {
            batchSizes.add(areas.size());
            for (NormalizedArea a : areas) {
                if (a.externalId().equals(refuseId)) {
                    throw new IllegalStateException("constraint");
                }
            }
            return areas.stream().map(this::put).toList();
        }

        @Override
        public UpsertOutcome upsertOne(NormalizedArea area) {
            if (area.externalId().equals(refuseId)) {
                throw new IllegalStateException("constraint");
            }
            return put(area);
        }

        private UpsertOutcome put(NormalizedArea area) {
            NormalizedArea old = rows.put(area.externalId(), area);
            if (old == null) {
                return UpsertOutcome.INSERTED;
            }
            return old.name().equals(area.name()) && old.geometry().equalsExact(area.geometry()) ? UpsertOutcome.UNCHANGED : UpsertOutcome.UPDATED;
        }

        @Override
        public int linkParents(List<ParentLink> toLink) {
            links.addAll(toLink);
            return toLink.size();
        }
    }

    private static AreaImportService service(Consumer<AreaImportSink> script, FakeStore store, int batchSize) {
        AreaDataProvider provider = new AreaDataProvider() {
            @Override
            public String sourceName() {
                return "test";
            }

            @Override
            public void read(ImportRegion region, AreaImportSink sink) throws IOException {
                script.accept(sink);
            }
        };
        return new AreaImportService(provider, store, new AreaImportProperties(true, "", "", "", batchSize, 1, 0, 0));
    }

    @Test
    void importsValidAreasInBatchesAndReportsStatistics() throws IOException {
        FakeStore store = new FakeStore();
        AreaImportStatistics stats = service(sink -> {
            for (int i = 1; i <= 5; i++) {
                sink.accept(area("a" + i, SQUARE));
            }
            sink.skipped(SkipReason.EXCLUDED_FEATURE);
            sink.rejected("x", RejectionReason.NO_NAME, "no name");
        }, store, 2).importAreas(null);

        assertEquals(7, stats.processed());
        assertEquals(5, stats.valid());
        assertEquals(5, stats.inserted());
        assertEquals(1, stats.skippedTotal());
        assertEquals(1, stats.rejectedTotal());
        assertEquals(List.of(2, 2, 1), store.batchSizes);
    }

    @Test
    void invalidGeometriesAreRepairedOrRejectedAndNeverStoredInvalid() throws IOException {
        FakeStore store = new FakeStore();
        AreaImportStatistics stats = service(sink -> {
            sink.accept(area("ok", SQUARE));
            sink.accept(area("bowtie", BOW_TIE));
            sink.accept(area("none", null));
            sink.accept(area("point", "POINT(10 10)"));
            sink.accept(area("flat", "POLYGON((10 10, 11 11, 12 12, 10 10))"));
        }, store, 10).importAreas(null);

        assertEquals(2, stats.valid());
        assertEquals(2, stats.invalidGeometries());
        assertEquals(1, stats.repairedGeometries());
        assertEquals(3, stats.rejectedTotal());
        assertEquals(1, stats.rejectedByReason().get(RejectionReason.NULL_GEOMETRY));
        assertEquals(1, stats.rejectedByReason().get(RejectionReason.UNSUPPORTED_GEOMETRY));
        assertEquals(1, stats.rejectedByReason().get(RejectionReason.INVALID_GEOMETRY));
        store.rows.values().forEach(a -> assertTrue(a.geometry().isValid() && a.geometry().getSRID() == 4326));
    }

    @Test
    void runningTheSameImportAgainChangesNothing() throws IOException {
        FakeStore store = new FakeStore();
        Consumer<AreaImportSink> script = sink -> {
            sink.accept(area("a", SQUARE));
            sink.accept(area("b", SQUARE));
        };
        AreaImportStatistics first = service(script, store, 10).importAreas(null);
        AreaImportStatistics second = service(script, store, 10).importAreas(null);
        assertEquals(2, first.inserted());
        assertEquals(0, second.inserted());
        assertEquals(0, second.updated());
        assertEquals(2, second.unchanged());
        assertEquals(2, store.rows.size());
    }

    @Test
    void sameNameInDifferentRecordsIsNotADuplicateButSameIdIs() throws IOException {
        FakeStore store = new FakeStore();
        AreaImportStatistics stats = service(sink -> {
            sink.accept(new NormalizedArea("test", "a", "Sector 88", AreaType.SECTOR, wkt(SQUARE), null, Map.of()));
            sink.accept(new NormalizedArea("test", "b", "Sector 88", AreaType.SECTOR, wkt(SQUARE), null, Map.of()));
            sink.accept(new NormalizedArea("test", "a", "Sector 88", AreaType.SECTOR, wkt(SQUARE), null, Map.of()));
        }, store, 10).importAreas(null);
        assertEquals(2, store.rows.size());
        assertEquals(1, stats.duplicates());
        assertEquals(2, stats.inserted());
    }

    @Test
    void anAreaTheDatabaseRefusesIsRejectedWithoutStoppingTheImport() throws IOException {
        FakeStore store = new FakeStore();
        store.refuseId = "bad";
        AreaImportStatistics stats = service(sink -> {
            sink.accept(area("a", SQUARE));
            sink.accept(area("bad", SQUARE));
            sink.accept(area("c", SQUARE));
        }, store, 10).importAreas(null);
        assertEquals(2, stats.inserted());
        assertEquals(1, stats.rejectedByReason().get(RejectionReason.DATABASE_REJECTED));
        assertEquals(2, store.rows.size());
    }

    @Test
    void parentsAreLinkedOnlyWhenTheSourceNamesExactlyOneImportedParent() throws IOException {
        FakeStore store = new FakeStore();
        AreaImportStatistics stats = service(sink -> {
            for (String id : new String[] {"p", "q", "child", "shared", "orphan", "loopA", "loopB"}) {
                sink.accept(area(id, SQUARE));
            }
            sink.parentLink("child", "p");
            sink.parentLink("shared", "p");
            sink.parentLink("shared", "q");
            sink.parentLink("orphan", "missing");
            sink.parentLink("loopA", "loopB");
            sink.parentLink("loopB", "loopA");
        }, store, 10).importAreas(null);

        assertEquals(List.of(new ParentLink("test", "child", "p")), store.links);
        assertEquals(1, stats.parentLinksSet());
    }

    @Test
    void aParentThatWasRejectedIsNotLinked() throws IOException {
        FakeStore store = new FakeStore();
        service(sink -> {
            sink.accept(area("parent", "POINT(1 1)"));
            sink.accept(area("child", SQUARE));
            sink.parentLink("child", "parent");
        }, store, 10).importAreas(null);
        assertTrue(store.links.isEmpty());
    }
}
