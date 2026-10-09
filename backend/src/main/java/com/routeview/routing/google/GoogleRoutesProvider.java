package com.routeview.routing.google;

import java.net.http.HttpClient;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.routeview.routing.RoutingException;
import com.routeview.routing.RoutingException.Reason;
import com.routeview.routing.RoutingProvider;
import com.routeview.routing.model.RouteCandidate;
import com.routeview.routing.model.RoutingRequest;

/**
 * {@link RoutingProvider} backed by the Google Routes API (REST, {@code directions/v2:computeRoutes}).
 * Runs on the server with the server-side key, so the key never reaches a browser.
 * Google's response format does not leave this package.
 */
@Component
public class GoogleRoutesProvider implements RoutingProvider {

    private static final Logger log = LoggerFactory.getLogger(GoogleRoutesProvider.class);

    private static final String COMPUTE_ROUTES_PATH = "/directions/v2:computeRoutes";
    private static final ParameterizedTypeReference<Map<String, Object>> RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {
            };

    private final GoogleRoutesProperties properties;
    private final RestClient restClient;

    public GoogleRoutesProvider(GoogleRoutesProperties properties) {
        this.properties = properties;
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(properties.readTimeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public List<RouteCandidate> computeRoutes(RoutingRequest request) {
        if (!properties.hasApiKey()) {
            throw new RoutingException(Reason.NOT_CONFIGURED, "GOOGLE_MAPS_SERVER_API_KEY is not set");
        }

        Map<String, Object> response;
        try {
            response = restClient.post()
                    .uri(COMPUTE_ROUTES_PATH)
                    .header("X-Goog-Api-Key", properties.apiKey())
                    .header("X-Goog-FieldMask", GoogleRoutesRequestFactory.fieldMask(request.travelMode()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(GoogleRoutesRequestFactory.build(request))
                    .retrieve()
                    .body(RESPONSE_TYPE);
        } catch (RestClientResponseException ex) {
            // The cause is deliberately not attached: provider error bodies are not needed in our logs.
            int status = ex.getStatusCode().value();
            throw new RoutingException(
                    GoogleRoutesErrors.reasonFor(status, request.travelMode()), "Google Routes API answered with HTTP " + status);
        } catch (RestClientException ex) {
            log.debug("Google Routes API call failed", ex);
            throw new RoutingException(
                    isTimeout(ex) ? Reason.TIMEOUT : Reason.UNAVAILABLE,
                    "Google Routes API call failed: " + ex.getClass().getSimpleName());
        }

        if (response == null) {
            throw new RoutingException(Reason.INVALID_RESPONSE, "Google Routes API returned an empty body");
        }
        return GoogleRoutesResponseMapper.map(response);
    }

    /** True when the failure, or one of its causes, is a connect/read timeout. */
    static boolean isTimeout(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof java.net.SocketTimeoutException || cause instanceof java.net.http.HttpTimeoutException) {
                return true;
            }
        }
        return false;
    }
}
