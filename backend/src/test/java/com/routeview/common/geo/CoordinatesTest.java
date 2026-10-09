package com.routeview.common.geo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class CoordinatesTest {

    @Test
    void acceptsValidPointsIncludingTheBounds() {
        assertEquals(28.3354, new Coordinates(28.3354, 77.4231).latitude());
        assertTrue(Coordinates.isValid(90, 180));
        assertTrue(Coordinates.isValid(-90, -180));
    }

    @Test
    void rejectsOutOfRangeAndNonFiniteValues() {
        assertFalse(Coordinates.isValid(90.0001, 0));
        assertFalse(Coordinates.isValid(0, -180.0001));
        assertFalse(Coordinates.isValid(Double.NaN, 0));
        assertFalse(Coordinates.isValid(0, Double.POSITIVE_INFINITY));
        assertThrows(IllegalArgumentException.class, () -> new Coordinates(91, 0));
    }
}
