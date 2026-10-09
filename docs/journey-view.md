# Journey View

A focused view of the **selected route** of the Route Session: summary, route switcher and the journey from the start through the detected geographical areas to the destination. It is a second *view* of the same session, not a second model: the selected route is always `session.selectedRouteId`, the highlighted stop is `session.selectedAreaId`. No route calculation, area detection, Google call or backend request happens in it.

```text
← Compare Routes
Route 2 · 52 min · 32.0 km   [Selected] [Fastest] [✓ Matches all 2 selected areas]
[Route 1] [Route 2 ✓] [Route 3]          ← switches the session's selected route
● START  Manjhawali
│ ○ Tigaon
│ ✓ Neharpar        ← matched by the multi-area search
│ ✓ Sector 88
■ DESTINATION  Faridabad
```

## Using it

**Open Journey View for Route N →** (route list, shown when a route is selected) opens it; **← Compare Routes** returns to the comparison with the selection unchanged. Changing start or destination closes it (the routes are gone).

## Components (`features/journey/`)

| Component | Role |
| --- | --- |
| `JourneyView` | Composes the pieces from `RouteSessionState`; owns the empty/loading/error messages |
| `JourneyHeader` | Route number, duration, distance, Selected / Fastest / Shortest (existing `computeRouteBadges`) and the search match label (`describeRouteMatch`, shared with the route cards) |
| `RouteSwitcher` | Buttons for the session's routes; calls the same `selectRoute` as cards and map |
| `JourneyTimeline` | Start → stops → Destination; start/destination are the session's locations, visually distinct (large filled markers, no buttons), never detected areas |
| `utils/buildJourney.ts` | Pure: orders stops by `sequence` then `positionAlongRoute` (never alphabetical or by coordinates) and marks matched/selected stops |

The map is the existing `MapView`: selecting a route or a stop updates the same session, so the map emphasises the route (non-matching routes are dimmer while a search is active), and the existing highlight marker/pan shows the chosen stop. No Places markers.

## Behaviour

- **Stops**: name, type, distance from start and "% of the way" (`positionAlongRoute`). Database ids are never shown. Clicking a stop highlights it ("On map", `aria-pressed`) and its place on the map; clicking it again clears the highlight. The route stays selected. Switching routes clears a highlight that is not on the new route.
- **Search**: a stop is marked "✓" only when its own area id is among the route's matched areas (from `matchRoutesByAreas`), never because of a similar name. A route that has only some selected areas shows "Matches 1 of 2 areas"; a route with none shows "Does not match the selected areas"; neither looks like a full match.
- **States**: no selected route → "Select a route to view the journey."; no session → a hint to find routes; loading → "Loading journey..."; error → "This journey is no longer available." (with ← Compare Routes); a route without areas → "No geographical areas detected along this route." between Start and Destination (a valid state; no fake stops).
- **Responsive**: desktop = sidebar (summary, switcher, timeline) beside the map. Below 768px the order is summary → map → timeline → search, in one scrolling page.
- **Accessibility**: all controls are buttons with visible focus; stop labels read "Stop 3 of 5: Neharpar, Locality, matches your search, highlighted on the map"; selection is shown by text ("Selected", "On map", ✓) and `aria-pressed`, not colour alone.
- Long journeys are listed in full (no virtualization).

## Tests

`buildJourney.test.ts` (start/destination from the session, travel order, ties by position, matched only by own ids, empty journey, data not mutated) and the shared `describeRouteMatch`. The browser flow (select, switch, stop highlight, multi-area marks, non-matching route, no areas, mobile order and overflow, keyboard, no outgoing requests) was exercised with Playwright against a mocked API and a fake Google Maps.
