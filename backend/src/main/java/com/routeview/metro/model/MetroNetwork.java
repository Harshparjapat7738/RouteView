package com.routeview.metro.model;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * An immutable, in-memory snapshot of the active metro network (a few hundred stations), with the indexes the
 * journey logic needs. Built from the database or from an import; static data, safe to cache.
 *
 * <p>Identity: a {@link MetroLine} is a <b>service</b> (a GTFS route) identified by its id, never by name or colour.
 * A {@link LineGroup} is the logical line shown to people (Blue Line = main + Vaishali branch). Station connectivity
 * comes from {@link MetroConnection}s (consecutive stops of real trips), not from names or geography.
 */
public final class MetroNetwork {

    public static final MetroNetwork EMPTY = new MetroNetwork(null, List.of(), List.of(), List.of());

    /** One ordered branch / service pattern of a line. */
    public record Pattern(MetroLine line, String pattern, List<UUID> stationIds, String toward) {
        public Pattern {
            stationIds = List.copyOf(stationIds);
        }
    }

    /** A logical line: one or more services that share a name base, colour and trunk. */
    public record LineGroup(UUID id, String name, String color, List<MetroLine> services) {
        public LineGroup {
            services = List.copyOf(services);
        }
    }

    private static final int MAX_EXPANSIONS = 200_000;

    private final MetroDatasetInfo dataset;
    private final List<MetroStation> stations;
    private final List<MetroLine> lines;
    private final List<MetroConnection> connections;
    private final List<MetroShape> shapes;
    private final Map<UUID, MetroStation> stationsById = new HashMap<>();
    private final Map<UUID, MetroLine> linesById = new HashMap<>();
    private final List<Pattern> patterns = new ArrayList<>();
    private final Map<UUID, List<MetroLine>> linesOfStation = new HashMap<>();
    private final Map<UUID, LineGroup> groupsById = new LinkedHashMap<>();
    /** station -> (service -> neighbour stations), undirected, deterministic order. */
    private final Map<UUID, Map<UUID, Set<UUID>>> adjacency = new HashMap<>();

    public MetroNetwork(MetroDatasetInfo dataset, List<MetroStation> stations, List<MetroLine> lines, List<MetroStationLine> stationLines) {
        this(dataset, stations, lines, stationLines, List.of(), List.of());
    }

    public MetroNetwork(MetroDatasetInfo dataset, List<MetroStation> stations, List<MetroLine> lines, List<MetroStationLine> stationLines,
                        List<MetroConnection> connections, List<MetroShape> shapes) {
        this.dataset = dataset;
        this.stations = List.copyOf(stations);
        this.lines = List.copyOf(lines);
        this.shapes = List.copyOf(shapes);
        this.stations.forEach(station -> stationsById.put(station.id(), station));
        this.lines.forEach(line -> linesById.put(line.id(), line));

        Map<String, List<MetroStationLine>> grouped = new HashMap<>();
        for (MetroStationLine row : stationLines) {
            if (stationsById.containsKey(row.stationId()) && linesById.containsKey(row.lineId())) {
                grouped.computeIfAbsent(row.lineId() + "|" + row.pattern(), key -> new ArrayList<>()).add(row);
            }
        }
        grouped.values().stream()
                .sorted(Comparator.comparing((List<MetroStationLine> rows) -> rows.get(0).lineId().toString())
                        .thenComparing(rows -> rows.get(0).pattern()))
                .forEach(rows -> {
                    rows.sort(Comparator.comparingInt(MetroStationLine::sequence));
                    MetroLine line = linesById.get(rows.get(0).lineId());
                    patterns.add(new Pattern(line, rows.get(0).pattern(),
                            rows.stream().map(MetroStationLine::stationId).toList(), rows.get(0).toward()));
                });
        for (Pattern pattern : patterns) {
            for (UUID stationId : pattern.stationIds()) {
                List<MetroLine> onStation = linesOfStation.computeIfAbsent(stationId, key -> new ArrayList<>());
                if (!onStation.contains(pattern.line())) {
                    onStation.add(pattern.line());
                }
            }
        }

        // Connections: those imported from trips; when none were supplied, derived from the ordered patterns.
        List<MetroConnection> usable = new ArrayList<>();
        for (MetroConnection c : connections) {
            if (stationsById.containsKey(c.fromStationId()) && stationsById.containsKey(c.toStationId()) && linesById.containsKey(c.lineId())) {
                usable.add(c);
            }
        }
        if (usable.isEmpty()) {
            for (Pattern p : patterns) {
                for (int i = 0; i + 1 < p.stationIds().size(); i++) {
                    usable.add(new MetroConnection(p.stationIds().get(i), p.stationIds().get(i + 1), p.line().id(), 1));
                }
            }
        }
        this.connections = List.copyOf(usable);
        List<MetroConnection> ordered = new ArrayList<>(this.connections);
        ordered.sort(Comparator.comparing((MetroConnection c) -> c.lineId().toString())
                .thenComparing(c -> c.fromStationId().toString()).thenComparing(c -> c.toStationId().toString()));
        for (MetroConnection c : ordered) {
            if (c.fromStationId().equals(c.toStationId())) continue;
            adjacency.computeIfAbsent(c.fromStationId(), k -> new LinkedHashMap<>()).computeIfAbsent(c.lineId(), k -> new LinkedHashSet<>()).add(c.toStationId());
            adjacency.computeIfAbsent(c.toStationId(), k -> new LinkedHashMap<>()).computeIfAbsent(c.lineId(), k -> new LinkedHashSet<>()).add(c.fromStationId());
        }

        Map<UUID, List<MetroLine>> byGroup = new LinkedHashMap<>();
        this.lines.stream().sorted(Comparator.comparing(MetroLine::name).thenComparing(l -> l.id().toString()))
                .forEach(l -> byGroup.computeIfAbsent(l.groupId(), k -> new ArrayList<>()).add(l));
        byGroup.forEach((id, services) -> groupsById.put(id, new LineGroup(id, services.get(0).groupName(), services.get(0).displayColor(), services)));
    }

    public MetroDatasetInfo dataset() { return dataset; }
    public List<MetroStation> stations() { return stations; }
    public List<MetroLine> lines() { return lines; }
    public List<Pattern> patterns() { return List.copyOf(patterns); }
    public List<MetroConnection> connections() { return connections; }
    public List<MetroShape> shapes() { return shapes; }
    public List<LineGroup> groups() { return List.copyOf(groupsById.values()); }
    public LineGroup group(UUID id) { return groupsById.get(id); }
    public boolean isEmpty() { return stations.isEmpty(); }

    public MetroStation station(UUID id) { return stationsById.get(id); }
    public MetroLine line(UUID id) { return linesById.get(id); }

    /** Services serving the station (one per GTFS route, several for an interchange or a shared trunk), in a stable order. */
    public List<MetroLine> linesOf(UUID stationId) {
        return linesOfStation.getOrDefault(stationId, List.of()).stream()
                .sorted(Comparator.comparing(MetroLine::name).thenComparing(line -> line.id().toString()))
                .toList();
    }

    /** Logical lines serving the station, each exactly once (Blue main + Vaishali at a shared station is one group). */
    public List<LineGroup> groupsOf(UUID stationId) {
        Map<UUID, List<MetroLine>> byGroup = new LinkedHashMap<>();
        for (MetroLine l : linesOf(stationId)) {
            byGroup.computeIfAbsent(l.groupId(), k -> new ArrayList<>()).add(l);
        }
        List<LineGroup> out = new ArrayList<>();
        byGroup.forEach((id, services) -> {
            LineGroup g = groupsById.get(id);
            out.add(new LineGroup(id, g == null ? services.get(0).groupName() : g.name(), g == null ? services.get(0).displayColor() : g.color(), services));
        });
        out.sort(Comparator.comparing(LineGroup::name).thenComparing(g -> g.id().toString()));
        return out;
    }

    /** An interchange is a station served by two or more <b>logical lines</b>, never by two services of one line. */
    public boolean isInterchange(UUID stationId) {
        return groupsOf(stationId).size() >= 2;
    }

    /**
     * Distinct station sequences from {@code from} to {@code to} that stay on the given services, following real
     * consecutive-stop connections (simple paths, at most {@code maxHops} segments when positive, at most {@code limit}
     * results, shortest first). A shared trunk therefore yields every valid candidate; nothing is picked arbitrarily.
     */
    public List<List<UUID>> paths(UUID from, UUID to, Set<UUID> serviceIds, int maxHops, int limit) {
        List<List<UUID>> found = new ArrayList<>();
        if (from == null || to == null || from.equals(to)) return found;
        int[] expansions = {0};
        Deque<UUID> path = new ArrayDeque<>();
        Set<UUID> visited = new HashSet<>();
        path.addLast(from);
        visited.add(from);
        walk(from, to, serviceIds, maxHops, path, visited, found, expansions);
        found.sort(Comparator.comparingInt(List::size));
        List<List<UUID>> distinct = new ArrayList<>();
        Set<List<UUID>> seen = new HashSet<>();
        for (List<UUID> p : found) {
            if (seen.add(p)) distinct.add(p);
            if (distinct.size() >= limit) break;
        }
        return distinct;
    }

    private void walk(UUID at, UUID to, Set<UUID> services, int maxHops, Deque<UUID> path, Set<UUID> visited, List<List<UUID>> found, int[] expansions) {
        if (++expansions[0] > MAX_EXPANSIONS || found.size() >= 64) return;
        if (maxHops > 0 && path.size() - 1 >= maxHops) return;
        Map<UUID, Set<UUID>> byService = adjacency.getOrDefault(at, Map.of());
        Set<UUID> next = new LinkedHashSet<>();
        for (Map.Entry<UUID, Set<UUID>> e : byService.entrySet()) {
            if (services.contains(e.getKey())) next.addAll(e.getValue());
        }
        for (UUID n : next) {
            if (visited.contains(n)) continue;
            path.addLast(n);
            if (n.equals(to)) {
                found.add(new ArrayList<>(path));
            } else {
                visited.add(n);
                walk(n, to, services, maxHops, path, visited, found, expansions);
                visited.remove(n);
            }
            path.removeLast();
        }
    }

    /** The services (among {@code within}) that run along every consecutive pair of the path. */
    public List<MetroLine> servicesOnPath(List<UUID> path, Set<UUID> within) {
        List<MetroLine> out = new ArrayList<>();
        for (UUID serviceId : within) {
            MetroLine service = linesById.get(serviceId);
            if (service == null || path.size() < 2) continue;
            boolean all = true;
            for (int i = 0; i + 1 < path.size() && all; i++) {
                Set<UUID> next = adjacency.getOrDefault(path.get(i), Map.of()).get(serviceId);
                all = next != null && next.contains(path.get(i + 1));
            }
            if (all) out.add(service);
        }
        out.sort(Comparator.comparing(MetroLine::externalId));
        return out;
    }

    /** The shapes belonging to a service, ordered (most-travelled first, then id). */
    public List<MetroShape> shapesOf(UUID lineId) {
        return shapes.stream().filter(s -> s.lineId().equals(lineId))
                .sorted(Comparator.comparingInt(MetroShape::tripCount).reversed().thenComparing(s -> s.externalId() == null ? "" : s.externalId()))
                .toList();
    }
}
