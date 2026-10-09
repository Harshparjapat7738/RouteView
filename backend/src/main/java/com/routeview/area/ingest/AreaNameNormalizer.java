package com.routeview.area.ingest;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * Safe clean-up of an area name taken from a data source. It only fixes what can never change the meaning of a name:
 * Unicode composition (NFC), invisible and control characters, and surrounding or repeated whitespace.
 * Case, spelling, abbreviations, scripts and punctuation are kept exactly as the source states them; names are never
 * translated, expanded or merged. Two different places with the same name stay two records (identity is
 * {@code source + externalId}, never the name).
 */
public final class AreaNameNormalizer {

    /** Control characters and zero-width / byte-order-mark characters that are invisible but make equal names differ. */
    private static final Pattern INVISIBLE = Pattern.compile("[\\p{Cc}\\u200B-\\u200D\\u2060\\uFEFF]");
    private static final Pattern WHITESPACE = Pattern.compile("[\\s\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]+");

    private AreaNameNormalizer() {
    }

    /** @return the cleaned name, or an empty string for null / blank input */
    public static String normalize(String name) {
        if (name == null) {
            return "";
        }
        String composed = Normalizer.normalize(name, Normalizer.Form.NFC);
        // Line breaks and tabs are control characters: turn them into spaces before invisible characters are dropped.
        String spaced = composed.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ');
        String visible = INVISIBLE.matcher(spaced).replaceAll("");
        return WHITESPACE.matcher(visible).replaceAll(" ").strip();
    }
}
