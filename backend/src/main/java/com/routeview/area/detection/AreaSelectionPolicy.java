package com.routeview.area.detection;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.routeview.area.model.AreaType;
import com.routeview.common.geo.Coordinates;

/**
 * Turns the raw spatial candidates of one route into the journey stops a person would expect.
 * It is plain Java without any database access, so the rules are easy to read and to test. Every stage is its own
 * method and every dropped candidate gets a {@link SelectionVerdict}; there is no opaque score.
 *
 * <ol>
 *   <li><b>Sanity:</b> candidates with missing or impossible values are dropped (never thrown on).</li>
 *   <li><b>Relevance:</b> an area counts as passed through when the route is genuinely <em>inside</em> it for at least
 *       {@code min(typeCap, max(floor, size x fraction))} metres (see
 *       {@link AreaDetectionProperties#requiredIntersectionMeters}), where "inside" excludes visits shorter than the
 *       minimum visit and route running along the border. The one exception is an area that contains the route
 *       start or end. Close-by, border-touching and border-hugging areas are rejected.</li>
 *   <li><b>One stop per area:</b> rows with the same area id are merged (a route that leaves and re-enters an area is
 *       one stop at its earliest meaningful position).</li>
 *   <li><b>One stop per place:</b> candidates with the same name and an overlapping stretch of the route are the same
 *       place recorded twice (other administrative level, duplicate import): the type ranked first in
 *       {@code typePriority} wins, then the longer crossing. Same name with different ids on <em>different</em>
 *       stretches stays as separate stops.</li>
 *   <li><b>Hierarchy:</b> broad administrative types ({@code containerTypes}) are hidden where a finer selected area
 *       covers part of the same stretch and remain only where nothing finer exists. Nothing is inferred from
 *       polygon containment.</li>
 *   <li><b>Order:</b> by the distance along the route at which each area is first reached.</li>
 * </ol>
 */
public class AreaSelectionPolicy {

    private static final Logger log = LoggerFactory.getLogger(AreaSelectionPolicy.class);

    /** Tolerance for floating-point noise when comparing distances along the route. */
    private static final double EPSILON_METERS = 1.0;

    private final AreaDetectionProperties properties;
    private final Set<AreaType> selectable;

    public AreaSelectionPolicy(AreaDetectionProperties properties) {
        this.properties = properties;
        this.selectable = properties.selectableTypeSet();
    }

    public List<DetectedArea> select(List<RouteAreaCandidate> candidates) {
        return evaluate(candidates).areas();
    }

    public SelectionResult evaluate(List<RouteAreaCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return SelectionResult.empty();
        }
        List<SelectionDecision> decisions = new ArrayList<>();

        List<Stop> relevant = filterRelevant(candidates, decisions);
        List<Stop> perArea = mergeSameArea(relevant);
        List<Stop> perPlace = removeDuplicatePlaces(perArea, decisions);
        List<Stop> stops = properties.hierarchyFilteringEnabled()
                ? removeCoveredContainers(perPlace, decisions) : new ArrayList<>(perPlace);

        stops.sort(Comparator
                .comparingDouble((Stop stop) -> stop.entry)
                .thenComparingInt(stop -> properties.priorityOf(stop.type))
                .thenComparing(stop -> stop.areaId.toString()));

        List<DetectedArea> areas = new ArrayList<>(stops.size());
        for (int i = 0; i < stops.size(); i++) {
            Stop stop = stops.get(i);
            areas.add(stop.toDetectedArea(i + 1));
            decisions.add(new SelectionDecision(stop.areaId, stop.name, stop.type,
                    stop.endpoint ? SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT : SelectionVerdict.ACCEPTED));
        }
        return new SelectionResult(List.copyOf(areas), List.copyOf(decisions));
    }

    // ---- stage 1 + 2: sanity and relevance -------------------------------------------------------------------

    private List<Stop> filterRelevant(List<RouteAreaCandidate> candidates, List<SelectionDecision> decisions) {
        List<Stop> relevant = new ArrayList<>();
        int unusable = 0;
        for (RouteAreaCandidate candidate : candidates) {
            if (!isUsable(candidate)) {
                unusable++;
                continue;
            }
            SelectionVerdict verdict = relevance(candidate);
            if (verdict == SelectionVerdict.ACCEPTED || verdict == SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT) {
                relevant.add(new Stop(candidate, verdict == SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT));
            } else {
                decisions.add(new SelectionDecision(candidate.areaId(), candidate.name(), candidate.areaType(), verdict));
            }
        }
        if (unusable > 0) {
            log.warn("Ignored {} unusable area candidates", unusable);
        }
        return relevant;
    }

    private boolean isUsable(RouteAreaCandidate c) {
        return c != null
                && c.areaId() != null
                && c.name() != null && !c.name().isBlank()
                && c.areaType() != null && selectable.contains(c.areaType())
                && isFiniteNonNegative(c.entryDistanceMeters())
                && isFiniteNonNegative(c.exitDistanceMeters())
                && isFiniteNonNegative(c.insideMeters())
                && isFiniteNonNegative(c.interiorMeters())
                && isFiniteNonNegative(c.sizeMeters())
                && Double.isFinite(c.routeLengthMeters()) && c.routeLengthMeters() > 0
                && c.entryDistanceMeters() <= c.exitDistanceMeters() + EPSILON_METERS
                && c.exitDistanceMeters() <= c.routeLengthMeters() + EPSILON_METERS
                && Coordinates.isValid(c.entryLatitude(), c.entryLongitude());
    }

    private static boolean isFiniteNonNegative(double value) {
        return Double.isFinite(value) && value >= 0;
    }

    private SelectionVerdict relevance(RouteAreaCandidate c) {
        if (c.containsStart() || c.containsEnd()) {
            return SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT;
        }
        // The start/end pin is only just outside the area but the route does touch it: the traveller begins or ends there.
        if ((c.nearStart() || c.nearEnd()) && c.insideMeters() > 0) {
            return SelectionVerdict.ACCEPTED_ROUTE_ENDPOINT;
        }
        if (c.interiorMeters() <= 0) {
            return SelectionVerdict.NOT_CROSSED;
        }
        double required = properties.requiredIntersectionMeters(c.areaType(), c.sizeMeters());
        return c.interiorMeters() >= required ? SelectionVerdict.ACCEPTED : SelectionVerdict.BELOW_MINIMUM_INTERSECTION;
    }

    // ---- stage 3: one stop per area id ---------------------------------------------------------------------

    private static List<Stop> mergeSameArea(List<Stop> stops) {
        Map<UUID, Stop> merged = new LinkedHashMap<>();
        for (Stop stop : stops) {
            merged.merge(stop.areaId, stop, Stop::mergeWith);
        }
        return new ArrayList<>(merged.values());
    }

    // ---- stage 4: one stop per place -----------------------------------------------------------------------

    private List<Stop> removeDuplicatePlaces(List<Stop> stops, List<SelectionDecision> decisions) {
        List<Stop> ranked = new ArrayList<>(stops);
        ranked.sort(Comparator
                .comparingInt((Stop stop) -> properties.priorityOf(stop.type))
                .thenComparing(Comparator.comparingDouble((Stop stop) -> stop.interior).reversed())
                .thenComparingDouble(stop -> stop.entry)
                .thenComparing(stop -> stop.areaId.toString()));

        List<Stop> kept = new ArrayList<>();
        for (Stop stop : ranked) {
            boolean duplicate = kept.stream()
                    .anyMatch(other -> other.normalizedName.equals(stop.normalizedName) && other.overlaps(stop));
            if (duplicate) {
                decisions.add(new SelectionDecision(stop.areaId, stop.name, stop.type, SelectionVerdict.DUPLICATE_PLACE));
            } else {
                kept.add(stop);
            }
        }
        return kept;
    }

    // ---- stage 5: hierarchy --------------------------------------------------------------------------------

    private List<Stop> removeCoveredContainers(List<Stop> stops, List<SelectionDecision> decisions) {
        List<Stop> fine = stops.stream().filter(stop -> !properties.isContainer(stop.type)).toList();
        List<Stop> kept = new ArrayList<>(fine);
        for (Stop stop : stops) {
            if (!properties.isContainer(stop.type)) {
                continue;
            }
            if (fine.stream().noneMatch(stop::overlaps)) {
                kept.add(stop);
            } else {
                decisions.add(new SelectionDecision(stop.areaId, stop.name, stop.type, SelectionVerdict.COVERED_BY_FINER_AREA));
            }
        }
        return kept;
    }

    private static String normalize(String name) {
        return Normalizer.normalize(name, Normalizer.Form.NFC).strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    /** Working copy of a candidate while stops are merged. */
    private static final class Stop {
        final UUID areaId;
        final String name;
        final String normalizedName;
        final AreaType type;
        final double entry;
        final double exit;
        final double inside;
        final double interior;
        final double routeLength;
        final double latitude;
        final double longitude;
        final boolean endpoint;

        Stop(RouteAreaCandidate c, boolean endpoint) {
            this(c.areaId(), c.name().strip(), normalize(c.name()), c.areaType(), c.entryDistanceMeters(),
                    Math.max(c.exitDistanceMeters(), c.entryDistanceMeters()), c.insideMeters(), c.interiorMeters(),
                    c.routeLengthMeters(), c.entryLatitude(), c.entryLongitude(), endpoint);
        }

        private Stop(UUID areaId, String name, String normalizedName, AreaType type, double entry, double exit,
                double inside, double interior, double routeLength, double latitude, double longitude, boolean endpoint) {
            this.areaId = areaId;
            this.name = name;
            this.normalizedName = normalizedName;
            this.type = type;
            this.entry = entry;
            this.exit = exit;
            this.inside = inside;
            this.interior = interior;
            this.routeLength = routeLength;
            this.latitude = latitude;
            this.longitude = longitude;
            this.endpoint = endpoint;
        }

        /** Same area id: one stop, positioned at its earliest part and covering all parts. */
        Stop mergeWith(Stop other) {
            Stop first = entry <= other.entry ? this : other;
            return new Stop(first.areaId, first.name, normalizedName, type, first.entry, Math.max(exit, other.exit),
                    inside + other.inside, interior + other.interior, routeLength, first.latitude, first.longitude,
                    endpoint || other.endpoint);
        }

        boolean overlaps(Stop other) {
            return entry <= other.exit + EPSILON_METERS && other.entry <= exit + EPSILON_METERS;
        }

        DetectedArea toDetectedArea(int sequence) {
            double position = Math.min(1.0, Math.max(0.0, entry / routeLength));
            return new DetectedArea(areaId, name, type, sequence, position, Math.round(entry), Math.round(inside),
                    new Coordinates(latitude, longitude));
        }
    }
}
