package com.routeview.metro.repository;

import java.util.Map;
import java.util.TreeMap;

/** Tiny JSON writer for flat maps (no extra dependency): strings and numbers only, keys sorted. */
final class MetroJson {

    private MetroJson() {
    }

    static String toJson(Map<String, String> map) {
        return toJsonObject(new TreeMap<String, Object>(map));
    }

    static String toJsonObject(Map<String, ?> map) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, ?> entry : new TreeMap<String, Object>(map).entrySet()) {
            if (!first) {
                json.append(',');
            }
            first = false;
            appendString(json, entry.getKey());
            json.append(':');
            if (entry.getValue() instanceof Number number) {
                json.append(number);
            } else {
                appendString(json, String.valueOf(entry.getValue()));
            }
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
                default -> json.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
            }
        }
        json.append('"');
    }
}
