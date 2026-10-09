package com.routeview.metro.model;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A metro <b>service</b> as the source dataset describes it: one GTFS route. {@code id} / {@code externalId}
 * (the GTFS {@code route_id}) are its identity; the name and colour are only presentation and are NOT unique.
 *
 * <p>Services that are one logical line (a main line and its branch share the name "Blue Line" and its colour and
 * the same trunk of stations) have the same {@code groupId}. A station served by two services of one group is not an
 * interchange; a station served by two groups is. {@code groupName} is what is shown to people ("Blue Line");
 * {@code branchName} keeps the service-specific part ("Vaishali Branch"), when the dataset has one.
 * {@code displayColor} is #RRGGBB or null when not provided.
 */
public record MetroLine(
        UUID id,
        String externalId,
        String name,
        String shortName,
        String displayColor,
        String source,
        boolean active,
        UUID groupId,
        String groupName,
        String branchName) {

    private static final Pattern TRAILING_NOTE = Pattern.compile("^(.*\\S)\\s*\\(([^()]+)\\)\\s*$");

    /** A line without explicit grouping: grouped by the name rule only (see {@link #baseName}). */
    public MetroLine(UUID id, String externalId, String name, String shortName, String displayColor, String source, boolean active) {
        this(id, externalId, name, shortName, displayColor, source, active,
                groupIdOf(source, baseName(name), displayColor), baseName(name), branchOf(name));
    }

    /** "Blue Line (Vaishali Branch)" -> "Blue Line". A name without a trailing bracketed note is its own base name. */
    public static String baseName(String name) {
        Matcher m = TRAILING_NOTE.matcher(name == null ? "" : name);
        return m.matches() ? m.group(1).trim() : (name == null ? "" : name);
    }

    /** "Blue Line (Vaishali Branch)" -> "Vaishali Branch"; null when there is no trailing note. */
    public static String branchOf(String name) {
        Matcher m = TRAILING_NOTE.matcher(name == null ? "" : name);
        return m.matches() ? m.group(2).trim() : null;
    }

    public static UUID groupIdOf(String source, String baseName, String color) {
        String key = baseName.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim() + "|" + (color == null ? "" : color.toUpperCase(Locale.ROOT));
        return UUID.nameUUIDFromBytes((source + ":line-group:" + key).getBytes(StandardCharsets.UTF_8));
    }
}
