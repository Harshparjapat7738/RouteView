package com.routeview.configuration;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rejects oversized or length-less request bodies on {@code /api} before they are read.
 * Responses are small, fixed, safe JSON problem bodies.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    private final long maxBodyBytes;

    public RequestSizeLimitFilter(@Value("${routeview.security.max-request-body-bytes:16384}") long maxBodyBytes) {
        this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        int status = rejectionStatus(request.getContentLengthLong(), request.getHeader("Transfer-Encoding") != null,
                maxBodyBytes);
        if (status == 413) {
            reject(response, 413, "Request is too large.");
        } else if (status == 411) {
            reject(response, 411, "Content-Length is required.");
        } else {
            chain.doFilter(request, response);
        }
    }

    /** HTTP status to reject with, or 0 when the request may proceed. A negative length means "not declared". */
    static int rejectionStatus(long declaredLength, boolean chunked, long maxBodyBytes) {
        if (declaredLength > maxBodyBytes) {
            return 413;
        }
        return chunked && declaredLength < 0 ? 411 : 0;
    }

    private static void reject(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"status\":" + status + ",\"detail\":\"" + detail + "\"}");
    }
}
