package com.routeview.area.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AreaNameNormalizerTest {

    @Test
    void surroundingAndRepeatedWhitespaceIsCleanedButNothingElseChanges() {
        assertEquals("Sector 15", AreaNameNormalizer.normalize("  Sector 15  "));
        assertEquals("Sector 15", AreaNameNormalizer.normalize("Sector\t  15\n"));
        assertEquals("sector 15", AreaNameNormalizer.normalize("sector 15"));
        assertEquals("Model Town", AreaNameNormalizer.normalize("Model Town"));
    }

    @Test
    void caseAbbreviationsPunctuationAndScriptsAreKept() {
        assertEquals("St. Mary's Colony (West)", AreaNameNormalizer.normalize("St. Mary's Colony (West)"));
        assertEquals("NIT", AreaNameNormalizer.normalize("NIT"));
        assertEquals("नेहरपार", AreaNameNormalizer.normalize("नेहरपार"));
    }

    @Test
    void invisibleCharactersAndDecomposedLettersAreNormalised() {
        assertEquals("Faridabad", AreaNameNormalizer.normalize("﻿Farid​abad"));
        assertEquals("Café", AreaNameNormalizer.normalize("Café"));
    }

    @Test
    void emptyOrBlankBecomesEmptyAndNullIsSafe() {
        assertEquals("", AreaNameNormalizer.normalize(null));
        assertEquals("", AreaNameNormalizer.normalize("   \t "));
    }

    @Test
    void sameNameStaysSameNameSoDifferentPlacesAreNeverMergedByNormalisation() {
        // Only identity (source + external id) separates two "Model Town" areas; normalisation keeps both names equal.
        assertEquals(AreaNameNormalizer.normalize("Model Town"), AreaNameNormalizer.normalize(" Model  Town "));
    }
}
