package com.routeview.area.ingest.osm;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import org.locationtech.jts.geom.Coordinate;

/**
 * Streams OpenStreetMap XML as produced by Overpass with {@code out geom}. Elements are handed over one at
 * a time, so memory use does not grow with the size of the region. The XML parser is hardened: no DTDs and
 * no external entities.
 */
final class OsmXmlReader {

    private static final int MAX_TAGS_PER_ELEMENT = 500;
    private static final int MAX_REMARK_LENGTH = 200;

    private OsmXmlReader() {
    }

    static void read(InputStream in, Consumer<OsmFeature> consumer) throws IOException {
        try {
            XMLStreamReader xml = newFactory().createXMLStreamReader(in);
            try {
                readDocument(xml, consumer);
            } finally {
                xml.close();
            }
        } catch (XMLStreamException e) {
            throw new IOException("The OpenStreetMap response is not valid XML.", e);
        }
    }

    private static XMLInputFactory newFactory() {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        try {
            factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        } catch (IllegalArgumentException ignored) {
            // property not supported by this implementation; DTDs are already disabled above
        }
        return factory;
    }

    private static void readDocument(XMLStreamReader xml, Consumer<OsmFeature> consumer) throws XMLStreamException, IOException {
        Builder current = null;
        MemberBuilder member = null;
        boolean sawRoot = false;

        while (xml.hasNext()) {
            int event = xml.next();
            if (event == XMLStreamConstants.START_ELEMENT) {
                String name = xml.getLocalName();
                switch (name) {
                    case "osm" -> sawRoot = true;
                    case "node", "way", "relation" -> current = new Builder(OsmFeature.Kind.valueOf(name.toUpperCase(java.util.Locale.ROOT)), parseLong(xml.getAttributeValue(null, "id")));
                    case "tag" -> {
                        if (current != null && current.tags.size() < MAX_TAGS_PER_ELEMENT) {
                            String key = xml.getAttributeValue(null, "k");
                            String value = xml.getAttributeValue(null, "v");
                            if (key != null && value != null) {
                                current.tags.put(key, value);
                            }
                        }
                    }
                    case "nd" -> {
                        Coordinate coordinate = coordinateOf(xml);
                        if (current != null && current.kind == OsmFeature.Kind.WAY) {
                            current.addWayNode(coordinate);
                        } else if (member != null) {
                            member.add(coordinate);
                        }
                    }
                    case "member" -> {
                        if (current != null && current.kind == OsmFeature.Kind.RELATION) {
                            member = new MemberBuilder(
                                    xml.getAttributeValue(null, "type"),
                                    parseLong(xml.getAttributeValue(null, "ref")),
                                    xml.getAttributeValue(null, "role"));
                        }
                    }
                    case "remark" -> throw new IOException("Overpass reported a problem: " + truncate(xml.getElementText()));
                    default -> {
                        // bounds, meta, note, ... are not needed
                    }
                }
            } else if (event == XMLStreamConstants.END_ELEMENT) {
                String name = xml.getLocalName();
                if ("member".equals(name) && member != null && current != null) {
                    current.addMember(member);
                    member = null;
                } else if (current != null && ("node".equals(name) || "way".equals(name) || "relation".equals(name))) {
                    consumer.accept(current.build());
                    current = null;
                }
            }
        }
        if (!sawRoot) {
            throw new IOException("The response is not OpenStreetMap XML.");
        }
    }

    private static Coordinate coordinateOf(XMLStreamReader xml) {
        String lat = xml.getAttributeValue(null, "lat");
        String lon = xml.getAttributeValue(null, "lon");
        if (lat == null || lon == null) {
            return null;
        }
        try {
            return new Coordinate(Double.parseDouble(lon), Double.parseDouble(lat));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static long parseLong(String value) {
        try {
            return value == null ? -1 : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static String truncate(String text) {
        String trimmed = text == null ? "" : text.trim();
        return trimmed.length() <= MAX_REMARK_LENGTH ? trimmed : trimmed.substring(0, MAX_REMARK_LENGTH);
    }

    private static final class MemberBuilder {
        final String type;
        final long ref;
        final String role;
        final List<Coordinate> coordinates = new ArrayList<>();
        boolean missingCoordinate;

        MemberBuilder(String type, long ref, String role) {
            this.type = type == null ? "" : type;
            this.ref = ref;
            this.role = role == null ? "" : role;
        }

        void add(Coordinate coordinate) {
            if (coordinate == null) {
                missingCoordinate = true;
            } else {
                coordinates.add(coordinate);
            }
        }
    }

    private static final class Builder {
        final OsmFeature.Kind kind;
        final long id;
        final Map<String, String> tags = new HashMap<>();
        final List<List<Coordinate>> outer = new ArrayList<>();
        final List<List<Coordinate>> inner = new ArrayList<>();
        final List<Long> subareas = new ArrayList<>();
        final List<Coordinate> wayNodes = new ArrayList<>();
        boolean incomplete;

        Builder(OsmFeature.Kind kind, long id) {
            this.kind = kind;
            this.id = id;
        }

        void addWayNode(Coordinate coordinate) {
            if (coordinate == null) {
                incomplete = true;
            } else {
                wayNodes.add(coordinate);
            }
        }

        void addMember(MemberBuilder member) {
            if ("relation".equals(member.type) && "subarea".equals(member.role)) {
                subareas.add(member.ref);
            } else if ("way".equals(member.type) && (member.role.isEmpty() || "outer".equals(member.role))) {
                addLine(outer, member);
            } else if ("way".equals(member.type) && "inner".equals(member.role)) {
                addLine(inner, member);
            }
        }

        private void addLine(List<List<Coordinate>> target, MemberBuilder member) {
            if (member.coordinates.isEmpty() || member.missingCoordinate) {
                incomplete = true;
            } else {
                target.add(member.coordinates);
            }
        }

        OsmFeature build() {
            if (kind == OsmFeature.Kind.WAY) {
                if (wayNodes.isEmpty()) {
                    incomplete = true;
                } else {
                    outer.add(wayNodes);
                }
            }
            return new OsmFeature(kind, id, Map.copyOf(tags), outer, inner, subareas, incomplete);
        }
    }
}
