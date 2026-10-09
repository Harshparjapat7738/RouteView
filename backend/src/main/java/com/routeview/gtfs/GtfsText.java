package com.routeview.gtfs;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.UUID;

/** Small helpers shared by the GTFS importers (metro, bus): text cleaning and stable ids. */
public final class GtfsText {

    public static final int MAX_NAME_LENGTH = 255;

    private GtfsText() {
    }

    /** NFC, control characters removed, whitespace collapsed and trimmed, length limited. Never changes the wording. */
    public static String display(String raw) {
        if (raw == null) {
            return "";
        }
        String text = Normalizer.normalize(raw, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cc}\\p{Cf}&&[^\\s]]", "")
                .replaceAll("(?U)\\s+", " ")
                .strip();
        return text.length() <= MAX_NAME_LENGTH ? text : text.substring(0, MAX_NAME_LENGTH).strip();
    }

    /** A UUID derived from {@code source:kind:externalId}: the same dataset record always gets the same id. */
    public static UUID stableId(String source, String kind, String externalId) {
        return UUID.nameUUIDFromBytes((source + ":" + kind + ":" + externalId).getBytes(StandardCharsets.UTF_8));
    }
}
