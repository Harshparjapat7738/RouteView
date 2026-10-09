package com.routeview.area.ingest.osm;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.routeview.area.ingest.AreaDataProvider;
import com.routeview.area.ingest.AreaImportProperties;
import com.routeview.area.ingest.AreaImportSink;
import com.routeview.area.ingest.AreaNameNormalizer;
import com.routeview.area.ingest.ImportRegion;
import com.routeview.area.ingest.NormalizedArea;
import com.routeview.area.ingest.RejectionReason;
import com.routeview.area.ingest.SkipReason;

/**
 * Reads geographical areas from OpenStreetMap through the Overpass API (or from a saved Overpass XML file)
 * and reports them as {@link NormalizedArea}s. All OSM-specific knowledge lives in this package.
 *
 * <p>Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
 */
@Component
public class OpenStreetMapAreaDataProvider implements AreaDataProvider {

    public static final String SOURCE = "openstreetmap";

    private static final int MAX_NAME_LENGTH = 255;
    private static final Set<String> METADATA_KEYS = Set.of("place", "boundary", "admin_level", "name:en", "wikidata");
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofMinutes(10);
    private static final String USER_AGENT = "RouteView-area-import/0.1 (explicit import command)";

    private final AreaImportProperties properties;
    private final OsmGeometryAssembler assembler = new OsmGeometryAssembler();

    public OpenStreetMapAreaDataProvider(AreaImportProperties properties) {
        this.properties = properties;
    }

    @Override
    public String sourceName() {
        return SOURCE;
    }

    @Override
    public void read(ImportRegion region, AreaImportSink sink) throws IOException {
        try (InputStream in = open(region)) {
            OsmXmlReader.read(in, feature -> handle(feature, sink));
        }
    }

    /** Opens the saved file if one is configured; otherwise asks Overpass for the region. */
    private InputStream open(ImportRegion region) throws IOException {
        if (properties.usesSourceFile()) {
            return Files.newInputStream(Path.of(properties.sourceFile()));
        }
        if (region == null) {
            throw new IllegalArgumentException("A region is required to read from Overpass.");
        }
        return requestOverpass(OverpassQueryBuilder.build(region));
    }

    private InputStream requestOverpass(String query) throws IOException {
        URI uri = URI.create(properties.overpassUrl());
        boolean loopback = "localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost());
        if (!"https".equals(uri.getScheme()) && !(loopback && "http".equals(uri.getScheme()))) {
            throw new IllegalArgumentException("The Overpass URL must use https.");
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("User-Agent", USER_AGENT)
                .POST(HttpRequest.BodyPublishers.ofString("data=" + URLEncoder.encode(query, StandardCharsets.UTF_8)))
                .build();
        try {
            HttpClient client = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                throw new IOException("Overpass answered with HTTP " + response.statusCode() + ".");
            }
            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("The Overpass request was interrupted.", e);
        }
    }

    private void handle(OsmFeature feature, AreaImportSink sink) {
        OsmAreaTypeMapper.Decision decision = OsmAreaTypeMapper.classify(feature.tags());
        if (!decision.isArea()) {
            sink.skipped(decision.skipReason());
            return;
        }
        if (feature.kind() == OsmFeature.Kind.NODE) {
            // A point has no boundary, so it cannot be a stored area (see docs/area-import.md).
            sink.skipped(SkipReason.UNMAPPED_TAGS);
            return;
        }

        String externalId = feature.externalId();
        String name = AreaNameNormalizer.normalize(feature.tags().get("name"));
        if (name.isEmpty()) {
            sink.rejected(externalId, RejectionReason.NO_NAME, "no name tag");
            return;
        }
        if (name.length() > MAX_NAME_LENGTH) {
            sink.rejected(externalId, RejectionReason.NAME_TOO_LONG, "name has " + name.length() + " characters");
            return;
        }

        OsmGeometryAssembler.Assembly assembly = assembler.assemble(feature);
        if (assembly.geometry() == null) {
            sink.rejected(externalId, RejectionReason.INCOMPLETE_BOUNDARY, assembly.problem());
            return;
        }

        sink.accept(new NormalizedArea(SOURCE, externalId, name, decision.type(), assembly.geometry(), null, metadata(feature)));
        for (long child : feature.subareaRelationIds()) {
            sink.parentLink("relation/" + child, externalId);
        }
    }

    private static Map<String, String> metadata(OsmFeature feature) {
        Map<String, String> metadata = new LinkedHashMap<>();
        for (String key : METADATA_KEYS) {
            String value = feature.tags().get(key);
            if (value != null) {
                metadata.put(key, value);
            }
        }
        return metadata;
    }
}
