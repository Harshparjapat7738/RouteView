package com.routeview.area.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Point;

import com.routeview.spatial.SpatialReference;

/**
 * A meaningful geographical area (village, locality, sector, town, city, ...) with its boundary.
 * Never a point of interest or a business. The table is created by the Flyway migrations
 * (see {@code db/migration}); Hibernate does not manage the schema.
 *
 * <p>This is RouteView's own model: it does not depend on any area-data provider.
 */
@Entity
@Table(name = "area")
public class Area {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "area_type", nullable = false)
    private AreaType areaType;

    /** Boundary in SRID 4326 (longitude/latitude). */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(nullable = false, columnDefinition = "geometry(MultiPolygon, 4326)")
    private MultiPolygon geometry;

    /** Representative point of the area, if known. SRID 4326. */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "center_point", columnDefinition = "geometry(Point, 4326)")
    private Point centerPoint;

    /** The containing area (e.g. the town a sector belongs to); null when unknown or top level. */
    @Column(name = "parent_area_id")
    private UUID parentAreaId;

    /** Where the area data came from, e.g. the name of a dataset. */
    @Column(nullable = false)
    private String source;

    /** Identifier of the area inside {@link #source}; unique per source when present. */
    @Column(name = "source_id")
    private String sourceId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** For JPA only. */
    protected Area() {
    }

    public Area(String name, AreaType areaType, MultiPolygon geometry, String source) {
        this.name = requireText(name, "name");
        this.areaType = requireNonNull(areaType, "areaType");
        this.geometry = requireWgs84(requireNonNull(geometry, "geometry"), "geometry");
        this.source = requireText(source, "source");
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public AreaType getAreaType() {
        return areaType;
    }

    public MultiPolygon getGeometry() {
        return geometry;
    }

    public Point getCenterPoint() {
        return centerPoint;
    }

    public void setCenterPoint(Point centerPoint) {
        this.centerPoint = centerPoint == null ? null : requireWgs84(centerPoint, "centerPoint");
    }

    public UUID getParentAreaId() {
        return parentAreaId;
    }

    public void setParentAreaId(UUID parentAreaId) {
        if (parentAreaId != null && parentAreaId.equals(id)) {
            throw new IllegalArgumentException("An area cannot be its own parent.");
        }
        this.parentAreaId = parentAreaId;
    }

    public String getSource() {
        return source;
    }

    public String getSourceId() {
        return sourceId;
    }

    public void setSourceId(String sourceId) {
        this.sourceId = sourceId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    private static <T extends org.locationtech.jts.geom.Geometry> T requireWgs84(T geometry, String field) {
        if (geometry.getSRID() != SpatialReference.WGS84_SRID) {
            throw new IllegalArgumentException(field + " must use SRID " + SpatialReference.WGS84_SRID + ".");
        }
        return geometry;
    }

    private static <T> T requireNonNull(T value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
