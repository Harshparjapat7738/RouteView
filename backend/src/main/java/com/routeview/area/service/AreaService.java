package com.routeview.area.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.routeview.area.model.Area;
import com.routeview.area.repository.AreaRepository;

/**
 * Boundary of the area module for the rest of the application. It performs no area detection:
 * the Area Detection Engine will be built on top of this module later.
 */
@Service
@Transactional(readOnly = true)
public class AreaService {

    private final AreaRepository areaRepository;

    public AreaService(AreaRepository areaRepository) {
        this.areaRepository = areaRepository;
    }

    public Optional<Area> findById(UUID id) {
        return areaRepository.findById(id);
    }

    public long count() {
        return areaRepository.count();
    }
}
