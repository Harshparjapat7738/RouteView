package com.routeview.area.repository;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.locationtech.jts.io.WKBWriter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.routeview.area.ingest.AreaImportStore;
import com.routeview.area.ingest.NormalizedArea;
import com.routeview.area.ingest.ParentLink;
import com.routeview.area.ingest.UpsertOutcome;

/**
 * PostGIS implementation of {@link AreaImportStore}. The SQL lives in {@code resources/area-import/*.sql}.
 * Matching is by {@code (source, source_id)}: the unique index created by migration V2.
 */
@Repository
public class JdbcAreaImportStore implements AreaImportStore {

    private static final String UPSERT_SQL = load("area-import/upsert-area.sql");
    private static final String LINK_PARENT_SQL = load("area-import/link-parent.sql");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public JdbcAreaImportStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Override
    public List<UpsertOutcome> upsertBatch(List<NormalizedArea> areas) {
        return transaction.execute(status -> areas.stream().map(this::upsert).toList());
    }

    @Override
    public UpsertOutcome upsertOne(NormalizedArea area) {
        return transaction.execute(status -> upsert(area));
    }

    @Override
    public int linkParents(List<ParentLink> links) {
        Integer changed = transaction.execute(status -> {
            int total = 0;
            for (ParentLink link : links) {
                total += jdbc.update(LINK_PARENT_SQL, link.source(), link.childExternalId(), link.source(), link.parentExternalId());
            }
            return total;
        });
        return changed == null ? 0 : changed;
    }

    private UpsertOutcome upsert(NormalizedArea area) {
        // Plain 2D WKB; the SQL applies SRID 4326.
        byte[] wkb = new WKBWriter(2).write(area.geometry());
        List<Map<String, Object>> rows = jdbc.queryForList(
                UPSERT_SQL,
                area.name(),
                area.areaType().name(),
                wkb,
                area.source(),
                area.externalId(),
                toJson(area.sourceMetadata()));
        if (rows.isEmpty()) {
            return UpsertOutcome.UNCHANGED;
        }
        return Boolean.TRUE.equals(rows.get(0).get("inserted")) ? UpsertOutcome.INSERTED : UpsertOutcome.UPDATED;
    }

    /** A flat string map as a JSON object, keys in sorted order so equal metadata always produces equal JSON. */
    static String toJson(Map<String, String> map) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : new java.util.TreeMap<>(map).entrySet()) {
            if (!first) {
                json.append(',');
            }
            first = false;
            appendString(json, entry.getKey());
            json.append(':');
            appendString(json, entry.getValue());
        }
        return json.append('}').toString();
    }

    private static void appendString(StringBuilder json, String value) {
        json.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> json.append("\\\"");
                case '\\' -> json.append("\\\\");
                default -> {
                    if (c < 0x20) {
                        json.append(String.format("\\u%04x", (int) c));
                    } else {
                        json.append(c);
                    }
                }
            }
        }
        json.append('"');
    }

    private static String load(String path) {
        try {
            return new String(new ClassPathResource(path).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + path, e);
        }
    }
}
