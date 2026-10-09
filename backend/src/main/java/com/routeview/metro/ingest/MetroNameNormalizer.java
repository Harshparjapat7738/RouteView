package com.routeview.metro.ingest;

import java.text.Normalizer;
import java.util.Locale;

/** Safe normalisation of station and line names. Display names stay as the source wrote them. */
public final class MetroNameNormalizer {

    public static final int MAX_NAME_LENGTH = 255;

    private MetroNameNormalizer() {
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

    /**
     * A comparison key: lower case, accents folded, "metro station" / "station" suffixes, bracketed notes and
     * punctuation removed. Two different stations can still share a key; callers must also compare positions.
     */
    public static String key(String raw) {
        String text = display(raw).toLowerCase(Locale.ROOT);
        text = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        text = text.replaceAll("\\([^)]*\\)", " ").replace("&", " and ");
        text = text.replaceAll("\\bmetro\\s+station\\b", " ").replaceAll("\\bstation\\b", " ").replaceAll("\\bmetro\\b", " ");
        text = text.replaceAll("[^\\p{L}\\p{N}]+", " ").replaceAll("(?U)\\s+", " ").strip();
        return text;
    }
}
