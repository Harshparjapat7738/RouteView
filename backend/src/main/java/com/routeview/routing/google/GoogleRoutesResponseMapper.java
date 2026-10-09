package com.routeview.routing.google;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.routeview.routing.RoutingException;
import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.TransitInfo;

/**
 * Converts a parsed {@code computeRoutes} response into {@link RouteCandidate}s.
 * The response is treated as untrusted: every field is type-checked, and anything
 * unexpected is reported as {@link Reason#INVALID_RESPONSE}.
 */
final class GoogleRoutesResponseMapper {

    /** Google returns at most three routes; this bound only protects against malformed responses. */
    static final int MAX_ROUTES = 5;
    private static final int MAX_STEPS = 60;
    private static final int MAX_WARNINGS = 5;
    private static final int MAX_TEXT_LENGTH = 200;

    /** Protobuf JSON duration, e.g. "1234s" or "1234.5s". */
    private static final Pattern DURATION = Pattern.compile("^(\\d+(?:\\.\\d+)?)s$");

    private GoogleRoutesResponseMapper() {
    }

    static List<RouteCandidate> map(Map<String, Object> response) {
        Object routes = response.get("routes");
        if (routes == null) {
            // Google omits "routes" when no route exists.
            return List.of();
        }
        if (!(routes instanceof List<?> items)) {
            throw invalid("'routes' is not a list");
        }

        List<RouteCandidate> candidates = new ArrayList<>();
        for (Object item : items.stream().limit(MAX_ROUTES).toList()) {
            candidates.add(mapRoute(item));
        }
        return List.copyOf(candidates);
    }

    private static RouteCandidate mapRoute(Object item) {
        if (!(item instanceof Map<?, ?> route)) {
            throw invalid("route entry is not an object");
        }
        try {
            return new RouteCandidate(
                    distanceMeters(route.get("distanceMeters")),
                    durationSeconds(route.get("duration")),
                    encodedPolyline(route.get("polyline")),
                    route.get("description") instanceof String description ? description : "",
                    transit(route.get("legs"), route.get("travelAdvisory")),
                    warnings(route.get("warnings")));
        } catch (IllegalArgumentException ex) {
            throw invalid("route values are invalid");
        }
    }

    private static long distanceMeters(Object value) {
        if (value == null) {
            // Protobuf JSON omits zero values.
            return 0;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        throw invalid("'distanceMeters' is not a number");
    }

    private static long durationSeconds(Object value) {
        if (value instanceof String text) {
            Matcher matcher = DURATION.matcher(text);
            if (matcher.matches()) {
                return Math.round(Double.parseDouble(matcher.group(1)));
            }
        }
        throw invalid("'duration' is missing or malformed");
    }

    private static String encodedPolyline(Object value) {
        if (value instanceof Map<?, ?> polyline && polyline.get("encodedPolyline") instanceof String encoded) {
            return encoded;
        }
        throw invalid("'polyline.encodedPolyline' is missing");
    }

    /** Provider warnings that must be displayed with walking, cycling and two-wheeler routes. */
    private static List<String> warnings(Object value) {
        List<String> result = new ArrayList<>();
        if (value instanceof List<?> items) {
            for (Object item : items.stream().limit(MAX_WARNINGS).toList()) {
                if (item instanceof String text && !text.isBlank()) {
                    result.add(clip(text));
                }
            }
        }
        return result;
    }

    /**
     * Transit details are an enhancement of a route: anything missing or unexpected only means that detail is
     * not shown, it never makes the route itself invalid. Returns null when the route has no transit step.
     */
    private static TransitInfo transit(Object legs, Object travelAdvisory) {
        if (!(legs instanceof List<?> legList)) {
            return null;
        }
        List<TransitInfo.TransitStep> steps = new ArrayList<>();
        for (Object leg : legList) {
            if (leg instanceof Map<?, ?> legMap && legMap.get("steps") instanceof List<?> stepList) {
                for (Object step : stepList.stream().limit(MAX_STEPS).toList()) {
                    if (step instanceof Map<?, ?> stepMap) {
                        TransitInfo.TransitStep mapped = transitStep(stepMap);
                        if (mapped != null) {
                            steps.add(mapped);
                        }
                    }
                }
            }
        }
        List<TransitInfo.TransitStep> rides = steps.stream()
                .filter(step -> step.kind() == TransitInfo.TransitStep.Kind.RIDE)
                .toList();
        if (rides.isEmpty()) {
            return null;
        }
        return new TransitInfo(
                steps,
                rides.size() - 1,
                rides.get(0).departureTime(),
                rides.get(rides.size() - 1).arrivalTime(),
                fare(travelAdvisory));
    }

    /**
     * The fare exactly as Google reports it ({@code travelAdvisory.transitFare}). Google only sends it when it can
     * determine the fare of every step, so a missing fare means "unknown", never zero.
     */
    static TransitInfo.TransitFare fare(Object travelAdvisory) {
        if (!(travelAdvisory instanceof Map<?, ?> advisory) || !(advisory.get("transitFare") instanceof Map<?, ?> money)) {
            return null;
        }
        if (!(money.get("currencyCode") instanceof String currency) || !currency.matches("[A-Z]{3}")) {
            return null;
        }
        try {
            java.math.BigDecimal amount = new java.math.BigDecimal(String.valueOf(money.get("units") == null ? "0" : money.get("units")).strip());
            if (money.get("nanos") instanceof Number nanos) {
                amount = amount.add(java.math.BigDecimal.valueOf(nanos.longValue(), 9));
            }
            if (amount.signum() < 0 || amount.signum() == 0) {
                return null; // a zero or negative fare is not a usable answer
            }
            return new TransitInfo.TransitFare(currency, amount.stripTrailingZeros().toPlainString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static TransitInfo.TransitStep transitStep(Map<?, ?> step) {
        long distance = step.get("distanceMeters") instanceof Number number ? Math.max(0, number.longValue()) : 0;
        long duration = 0;
        if (step.get("staticDuration") instanceof String text) {
            Matcher matcher = DURATION.matcher(text);
            if (matcher.matches()) {
                duration = Math.round(Double.parseDouble(matcher.group(1)));
            }
        }
        if (step.get("transitDetails") instanceof Map<?, ?> details) {
            Map<?, ?> stops = details.get("stopDetails") instanceof Map<?, ?> m ? m : Map.of();
            Map<?, ?> line = details.get("transitLine") instanceof Map<?, ?> m ? m : Map.of();
            Map<?, ?> vehicle = line.get("vehicle") instanceof Map<?, ?> m ? m : Map.of();
            String lineName = text(line.get("name"));
            if (lineName.isEmpty()) {
                lineName = text(line.get("nameShort"));
            }
            return new TransitInfo.TransitStep(
                    TransitInfo.TransitStep.Kind.RIDE,
                    lineName,
                    text(vehicle.get("type")),
                    stopName(stops.get("departureStop")),
                    stopName(stops.get("arrivalStop")),
                    text(stops.get("departureTime")),
                    text(stops.get("arrivalTime")),
                    text(details.get("headsign")),
                    details.get("stopCount") instanceof Number count ? Math.max(0, count.intValue()) : 0,
                    distance,
                    duration,
                    stopCoordinate(stops.get("departureStop"), "latitude"),
                    stopCoordinate(stops.get("departureStop"), "longitude"),
                    stopCoordinate(stops.get("arrivalStop"), "latitude"),
                    stopCoordinate(stops.get("arrivalStop"), "longitude"),
                    text(line.get("nameShort")),
                    color(line.get("color")));
        }
        if ("WALK".equals(step.get("travelMode"))) {
            return new TransitInfo.TransitStep(
                    TransitInfo.TransitStep.Kind.WALK, "", "", "", "", "", "", "", 0, distance, duration);
        }
        return null;
    }

    /** Latitude / longitude of a stop ({@code location.latLng}); null when absent or out of range. */
    private static Double stopCoordinate(Object stop, String key) {
        if (stop instanceof Map<?, ?> map && map.get("location") instanceof Map<?, ?> location
                && location.get("latLng") instanceof Map<?, ?> latLng && latLng.get(key) instanceof Number number) {
            double value = number.doubleValue();
            double limit = "latitude".equals(key) ? 90 : 180;
            return Double.isFinite(value) && Math.abs(value) <= limit ? value : null;
        }
        return null;
    }

    private static String color(Object value) {
        return value instanceof String text && text.matches("#[0-9A-Fa-f]{6}") ? text.toUpperCase() : "";
    }

    private static String stopName(Object stop) {
        return stop instanceof Map<?, ?> map ? text(map.get("name")) : "";
    }

    private static String text(Object value) {
        return value instanceof String string ? clip(string.strip()) : "";
    }

    private static String clip(String value) {
        return value.length() <= MAX_TEXT_LENGTH ? value : value.substring(0, MAX_TEXT_LENGTH);
    }

    private static RoutingException invalid(String detail) {
        return new RoutingException(Reason.INVALID_RESPONSE, "Unexpected Google Routes response: " + detail);
    }
}
