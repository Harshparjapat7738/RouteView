package com.routeview.area.ingest;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Runs an area import: reads a region from the {@link AreaDataProvider}, validates each geometry, stores the
 * areas in batches through the {@link AreaImportStore}, links parents and reports statistics.
 *
 * <p>It is only ever called by the explicit import command ({@link AreaImportRunner}); application startup does
 * not import anything. Running it again with the same data changes nothing: areas are matched by
 * {@code source + externalId}, never by name.
 */
@Service
public class AreaImportService {

    private static final Logger log = LoggerFactory.getLogger(AreaImportService.class);
    private static final int MAX_PARENT_CHAIN = 64;

    private final AreaDataProvider provider;
    private final AreaImportStore store;
    private final AreaImportProperties properties;
    private final AreaGeometryNormalizer normalizer;

    public AreaImportService(AreaDataProvider provider, AreaImportStore store, AreaImportProperties properties) {
        this.provider = provider;
        this.store = store;
        this.properties = properties;
        this.normalizer = new AreaGeometryNormalizer(properties.minAreaSquareMeters(), properties.maxAreaSquareKilometers() * 1e6);
    }

    public AreaImportStatistics importAreas(ImportRegion region) throws IOException {
        Run run = new Run();
        provider.read(region, run);
        run.flush();
        run.linkParents();
        log.info("{}", run.statistics.summary());
        return run.statistics;
    }

    /** State of one import run; also the sink the provider reports to. */
    private final class Run implements AreaImportSink {

        final AreaImportStatistics statistics = new AreaImportStatistics();
        private final List<NormalizedArea> batch = new ArrayList<>(properties.batchSize());
        private final Set<String> seen = new HashSet<>();
        private final Set<String> storedIds = new HashSet<>();
        private final Map<String, Set<String>> parentClaims = new HashMap<>();

        @Override
        public void accept(NormalizedArea area) {
            statistics.recordProcessed();
            if (!seen.add(area.externalId())) {
                statistics.duplicate();
                return;
            }
            if (area.parentExternalId() != null) {
                parentLink(area.externalId(), area.parentExternalId());
            }

            AreaGeometryNormalizer.Result result = normalizer.normalize(area.geometry());
            if (result.wasInvalid()) {
                statistics.invalidGeometry(result.outcome() == AreaGeometryNormalizer.Outcome.REPAIRED);
            }
            if (result.outcome() == AreaGeometryNormalizer.Outcome.REJECTED) {
                reject(area.externalId(), result.reason(), result.detail());
                return;
            }

            batch.add(area.withGeometry(result.geometry()));
            if (batch.size() >= properties.batchSize()) {
                flush();
            }
        }

        @Override
        public void skipped(SkipReason reason) {
            statistics.recordProcessed();
            statistics.skipped(reason);
        }

        @Override
        public void rejected(String externalId, RejectionReason reason, String detail) {
            statistics.recordProcessed();
            reject(externalId, reason, detail);
        }

        @Override
        public void parentLink(String childExternalId, String parentExternalId) {
            parentClaims.computeIfAbsent(childExternalId, key -> new LinkedHashSet<>()).add(parentExternalId);
        }

        private void reject(String externalId, RejectionReason reason, String detail) {
            statistics.rejected(reason);
            log.warn("Rejected {} ({}): {}", externalId, reason, detail);
        }

        /** Stores the pending batch in one transaction; if the database refuses it, finds the offending area(s). */
        void flush() {
            if (batch.isEmpty()) {
                return;
            }
            List<NormalizedArea> pending = List.copyOf(batch);
            batch.clear();
            try {
                List<UpsertOutcome> outcomes = store.upsertBatch(pending);
                for (int i = 0; i < pending.size(); i++) {
                    stored(pending.get(i), outcomes.get(i));
                }
            } catch (RuntimeException batchFailure) {
                log.warn("Storing a batch of {} areas failed ({}); retrying one by one", pending.size(), describe(batchFailure));
                for (NormalizedArea area : pending) {
                    try {
                        stored(area, store.upsertOne(area));
                    } catch (RuntimeException failure) {
                        reject(area.externalId(), RejectionReason.DATABASE_REJECTED, describe(failure));
                    }
                }
            }
        }

        private void stored(NormalizedArea area, UpsertOutcome outcome) {
            statistics.stored(outcome, area.areaType());
            storedIds.add(area.externalId());
        }

        /** Links an area to its parent only where the source names exactly one parent and both areas were imported. */
        void linkParents() {
            List<ParentLink> links = new ArrayList<>();
            long ambiguous = 0;
            long notImported = 0;

            Map<String, String> parentOf = new HashMap<>();
            for (Map.Entry<String, Set<String>> claim : parentClaims.entrySet()) {
                if (!storedIds.contains(claim.getKey())) {
                    continue;
                }
                if (claim.getValue().size() != 1) {
                    ambiguous++;
                    continue;
                }
                String parent = claim.getValue().iterator().next();
                if (!storedIds.contains(parent)) {
                    notImported++;
                    continue;
                }
                parentOf.put(claim.getKey(), parent);
            }
            for (Map.Entry<String, String> entry : parentOf.entrySet()) {
                if (isInCycle(entry.getKey(), parentOf)) {
                    ambiguous++;
                } else {
                    links.add(new ParentLink(provider.sourceName(), entry.getKey(), entry.getValue()));
                }
            }

            int set = links.isEmpty() ? 0 : store.linkParents(links);
            statistics.parentLinks(set, ambiguous, notImported);
        }

        private boolean isInCycle(String start, Map<String, String> parentOf) {
            String current = parentOf.get(start);
            for (int steps = 0; current != null && steps < MAX_PARENT_CHAIN; steps++) {
                if (current.equals(start)) {
                    return true;
                }
                current = parentOf.get(current);
            }
            return current != null;
        }

        /** Exception class names only: database messages can contain row data. */
        private String describe(RuntimeException e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) {
                root = root.getCause();
            }
            return e.getClass().getSimpleName() + (root == e ? "" : " caused by " + root.getClass().getSimpleName());
        }
    }
}
