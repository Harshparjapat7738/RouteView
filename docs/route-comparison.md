# Route comparison and selection

The route list lets the user compare the calculated routes by time, distance **and** by the geographical areas each one passes through, and choose one. It is a presentation layer over the Route Session: nothing here calls Google Routes, Places, Geocoding or the database, and expanding, selecting or searching never makes a request.

## What each route card shows

`RouteCard` (header) and, below it, the route's journey:

- **Route number** (`Route 1…`, in the order the routing logic supplied; routes are never reordered, badges do not change their order or identity),
- **duration** and **distance**, **number of areas** ("4 areas") and the short via description when known,
- **badges** (below), and
- the **journey**: the full *Journey Stops* timeline for the selected route, a compact `A → B → C → D` line for the others.

No other routing fields are shown.

## Badges (deterministic, factual)

| Badge | Rule |
| --- | --- |
| **Selected** | the route is the Route Session's `selectedRouteId` |
| **Fastest** | lowest duration among the routes |
| **Shortest** | lowest distance among the routes |
| **✓ Matches Neharpar** | the route passes through an area found by the current passing-area search (`Matches 2 areas` when several areas match) |
| **✓ Matches all 2 selected areas** | with several selected areas ([multi-area search](passing-area-search.md#multi-area-search)): the route passes through every one of them |
| Matches 1 of 2 areas | partial match: shown without ✓, the card stays secondary |

Ties give every tied route the badge. With a single route, or when all routes have the same value, there is no Fastest/Shortest badge (it would say nothing). There are no subjective badges ("Best", "Recommended", "Safest") because there is no data behind them. The logic is `utils/routeBadges.ts` (pure, unit-tested). Selection is always shown as text ("Selected", `aria-pressed`) as well as by border and colour.

## One selection model

The only selection state is the Route Session's `selectedRouteId` and `selectedAreaId`. The card, the map, the Journey Stops and the search results all read it and all change it through the same actions (`routeSelected`, `areaSelected`, `routeAreaSelected`):

| Interaction | Effect |
| --- | --- |
| Click a route card, or a route on the map | that route is selected; its area highlight is cleared; its Journey Stops replace the previous route's |
| Click a Journey Stop (selected route) | the stop is highlighted, the map shows a marker there and pans to it; the route stays selected; clicking it again clears it |
| **Choose Route** in a search result | route and matched stop are selected together; same visuals as above |

The map draws the selected route thick and opaque and the others thinner and translucent; start/destination markers stay. Selecting does not refit the map, so all routes stay in view; only the highlight moves. (Fitting to the selected route is possible but would make comparing routes harder.)

## Journey Stops

The selected route's stops are an interactive timeline (name, type, distance from start, keyboard-operable buttons). Journeys longer than 8 stops show the first 8 with **Show all N stops**; a highlighted or matching stop is never hidden by the collapse. Routes that are not selected show the first 4 stops followed by "→ …" and a **Show all N stops** toggle that expands a read-only list (matching stops are never hidden). Collapsing only hides, nothing is removed. Expanded/collapsed is local to the card and unrelated to selection.

A route with no detected areas is a normal route: its card shows duration and distance as usual and the message *"No geographical areas were detected for this route."* Partial results (some routes with areas, some without) are shown per route.

## Search integration

The page computes one passing-area search outcome from the session and the query and gives it to both the search box (results with **Choose Route**) and the route list:

- routes that match get the **✓ Matches …** badge and a highlighted border, and their matching stops are marked;
- the list header says "1 of 3 routes match “neharpar”";
- routes that do not match **stay visible** but are secondary (dashed, muted border); nothing is hidden;
- with no match, or an empty query, nothing is marked or dimmed.

## States

| Situation | What is shown |
| --- | --- |
| No start/destination | "Select a start and destination to compare routes." (no cards) |
| Both selected, not calculated | "Press Find Routes to compare routes." |
| Calculating | "Finding routes..." (the list is marked busy); no previous routes or stops are shown |
| No route | "No route found between these locations." |
| Routing failure | the existing generic error (no provider details) |
| Detection returns nothing | route shown normally, calm message in the journey |

**Stale data.** Routes belong to the exact start/destination pair they were calculated for: when either changes, the old routes disappear immediately, and the passing-area search text is cleared, so no old route, stop or match can appear for the new journey. Pressing Find Routes again for the same pair reuses the session.

## Responsive behaviour

One layout for all sizes. Desktop: sidebar (locations, search, route cards, Journey Stops) 360 px wide beside the map. Narrow screens: the sidebar stacks above the map, is capped at 55 % of the viewport height and scrolls (route cards and stops with it), while the map keeps at least 240 px. Route headers and buttons are at least 44 px high; there is no horizontal scrolling.

## Accessibility

Cards, stops, toggles and search results are native buttons (keyboard and focus visible); selected state is exposed with `aria-pressed` and written as "Selected"; collapse toggles use `aria-expanded`/`aria-controls`; the match count and the search results are announced through live regions; the busy list is `aria-busy`; matches and selection never rely on colour alone.

## Tests

`npm test`: badge rules (`routeBadges.test.ts`), search and match mapping, route-session selection. The browser flow (empty state, one and many routes, badges, expand/collapse, selecting, search, stale data, no-area route, keyboard, mobile) was exercised with Playwright against a mocked API and a fake Google Maps.

## Limitations

Comparison is on duration, distance and journey only (no traffic, cost, safety or ranking). Duration comes from the routing provider as calculated; "Fastest" is relative to the routes that were calculated. Journey quality depends on the imported area data.

The selected route can also be opened in the [Journey View](journey-view.md) (and left again with **← Compare Routes**); both views read and change the same Route Session.
