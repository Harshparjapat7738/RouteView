package com.routeview.bus.repository;

import java.util.Collection;
import java.util.Map;
import java.util.TreeMap;

/** Tiny JSON writer for the import statistics (no extra dependency): numbers, strings, nested maps and lists. */
final class BusJson {

    private BusJson() {
    }

    static String toJson(Map<String, ?> map) {
        StringBuilder json = new StringBuilder();
        append(json, map);
        return json.toString();
    }

    private static void append(StringBuilder json, Object value) {
        if (value == null) {
            json.append("null");
        } else if (value instanceof Number || value instanceof Boolean) {
            json.append(value);
        } else if (value instanceof Map<?, ?> map) {
            json.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : new TreeMap<Object, Object>(map).entrySet()) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                string(json, String.valueOf(entry.getKey()));
                json.append(':');
                append(json, entry.getValue());
            }
            json.append('}');
        } else if (value instanceof Collection<?> list) {
            json.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                append(json, item);
            }
            json.append(']');
        } else {
            string(json, String.valueOf(value));
        }
    }

    private static void string(StringBuilder json, String value) {
        json.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> json.append("\\\"");
                case '\\' -> json.append("\\\\");
                case '\n' -> json.append("\\n");
                case '\r' -> json.append("\\r");
                case '\t' -> json.append("\\t");
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
}
