package com.routeview.bus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.routeview.bus.model.BusStop;
import com.routeview.common.accessibility.Accessibility;
import com.routeview.common.accessibility.Accessibility.Status;

/** Bus stops take wheelchair access only from an explicit GTFS wheelchair_boarding of 1 or 2; everything else is unknown. */
class BusAccessibilityTest {

    private static BusTestData.Result run(String... stopRows) {
        Map<String, String> files = new LinkedHashMap<>(BusTestData.files());
        files.put("stops.txt", String.join("\n", stopRows));
        return BusTestData.run(files);
    }

    private static BusStop stop(BusTestData.Result result, String externalId) {
        return result.sink().stops.stream().filter(s -> s.externalId().equals(externalId)).findFirst().orElseThrow();
    }

    @Test
    void readsOnlyExplicitStatements() {
        BusTestData.Result result = run(
                "stop_code,stop_id,stop_lat,stop_lon,stop_name,zone_id,wheelchair_boarding",
                "100,S1,28.6000,77.1000,Alpha Stop,Z1,1",
                "101,S2,28.6100,77.1100,Bravo Stop,Z2,2",
                "102,S3,28.6200,77.1200,Charlie Stop,Z4,0",
                "103,S4,28.6300,77.1300,Delta Stop,Z5,",
                "104,S5,28.6400,77.1400,Echo Stop,Z6,yes");
        assertEquals(Status.ACCESSIBLE, stop(result, "S1").wheelchair());
        assertEquals(Status.INACCESSIBLE, stop(result, "S2").wheelchair());
        assertEquals(Status.UNKNOWN, stop(result, "S3").wheelchair()); // 0 = no information
        assertEquals(Status.UNKNOWN, stop(result, "S4").wheelchair()); // empty
        assertEquals(Status.UNKNOWN, stop(result, "S5").wheelchair()); // not a GTFS value
        assertEquals(Integer.valueOf(1), stop(result, "S1").wheelchairBoardingValue());
        assertEquals(Integer.valueOf(2), stop(result, "S2").wheelchairBoardingValue());
        assertNull(stop(result, "S3").wheelchairBoardingValue());
    }

    @Test
    void aDatasetWithoutTheColumnIsAllUnknownNeverAccessible() {
        BusTestData.Result result = BusTestData.run(); // the standard fixture has no wheelchair_boarding column
        assertEquals(true, result.sink().stops.size() > 0);
        for (BusStop stop : result.sink().stops) {
            assertEquals(Status.UNKNOWN, stop.wheelchair(), stop.externalId());
            assertNull(stop.wheelchairBoardingValue());
        }
    }

    @Test
    void theAccessibilityValueObjectKeepsSourceOnlyForStatements() {
        assertEquals(Accessibility.UNKNOWN, Accessibility.of(null, "X", "1"));
        assertEquals(Accessibility.UNKNOWN, Accessibility.of("MAYBE", "X", "1"));
        Accessibility accessible = Accessibility.of("ACCESSIBLE", "DTC", "2024-01-01");
        assertEquals(Status.ACCESSIBLE, accessible.status());
        assertEquals("DTC", accessible.source());
        assertEquals("2024-01-01", accessible.sourceVersion());
        Accessibility unknown = new Accessibility(Status.UNKNOWN, "DTC", "v");
        assertNull(unknown.source());
        assertNull(unknown.sourceVersion());
        assertEquals(Status.UNKNOWN, new Accessibility(null, "a", "b").status());
        assertEquals(Status.ACCESSIBLE, Accessibility.combine(java.util.List.of(Status.ACCESSIBLE, Status.ACCESSIBLE)));
        assertEquals(Status.INACCESSIBLE, Accessibility.combine(java.util.List.of(Status.INACCESSIBLE)));
        assertEquals(Status.UNKNOWN, Accessibility.combine(java.util.List.of(Status.ACCESSIBLE, Status.INACCESSIBLE)));
        assertEquals(Status.UNKNOWN, Accessibility.combine(java.util.List.of(Status.ACCESSIBLE, Status.UNKNOWN)));
        assertEquals(Status.UNKNOWN, Accessibility.combine(java.util.List.of()));
    }
}
