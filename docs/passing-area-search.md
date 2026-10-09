# Passing-Area Search

**Purpose.** Answer *"Which of my calculated routes passes through this area?"* The user types an area name (for example `Neharpar`); RouteView shows the routes whose Journey Stops contain it and lets the user choose one.

```text
Calculated routes → detected areas (Area Detection Engine) → name match → matching routes → choose route
```

## Scope: the current Route Session only

The search runs on the **detected areas of the routes in the current Route Session** (`route.detectedAreas`), nothing else:

- It is **not** a map or place search. Nothing is sent to Google Places (autocomplete, text search), Geocoding or any other service, and the routing API is not called again.
- It does **not** query the area database. There is no search endpoint, no global area search and no per-keystroke request; matching is local, in the browser, on data the routes already carry.
- Because it only sees detected areas (geographical areas only), it can never return restaurants, hospitals, shops or other POIs.
- With no usable session (nothing calculated yet, loading, error, or a session without routes) the search shows *"No routes available. Calculate routes first to search for passing areas."* and searches nothing.

### Why Google Places is intentionally not used

Places would find *any* place near a name, including businesses, and says nothing about whether one of the calculated routes goes through it. The product question is about the journey of the routes already calculated, and the answer must be consistent with the Journey Stops the user sees. Unmatched queries therefore end with *"No matching area found on the calculated routes."* and **never fall back to Google**. This is a product rule.

## Matching

Both the query and the area names are normalised the same way (Unicode NFC, trimmed, runs of whitespace collapsed to one space, lower case), so `neharpar`, `NeHarPar` and ` neharpar ` are the same query. The query is limited to 100 characters and is never used as a regular expression.

An area matches when its name is, in this order of quality:

| Quality | Rule | Example for the query `sector 88` |
| --- | --- | --- |
| exact | name equals the query | `Sector 88` |
| prefix | name starts with the query | `Sector 88 Extension` |
| contains | name contains the query | `New Sector 88 Area` |

Results are ranked exact, then prefix, then contains; ties go to the area on the earliest route, then to the name, so the order is always the same for the same data. No fuzzy, phonetic or semantic matching.

**One result per area.** The same area on several routes is one result with several matching routes. Records are identified by normalised name and area type (as in the detection engine), because the same place can carry different ids on different routes. An empty query shows nothing (no list of arbitrary areas).

## Result model

`features/search/types/areaSearch.ts`:

```text
AreaSearchResult   key, areaId, areaName, areaType, quality, matchingRoutes[]
MatchingRoute      route   (the session's own Route, not a copy)
                   area    (that route's DetectedArea; area.sequence = place in that route's journey)
AreaSearchOutcome  no-routes | empty-query | no-match | found(results)
```

Ids are used internally for selection and are never displayed; users see the area name, type, route number, journey, distance and duration.

## Architecture

- `features/search/services/passingAreaSearchService.ts`: pure functions, no React. `searchPassingAreas(session, query)` returns an `AreaSearchOutcome`. All matching, grouping and ranking is here.
- `features/search/components/PassingAreaSearch.tsx`: the input and the results. It calls the service and renders; it contains no matching logic.
- The query text is plain state in `HomePage`; results are derived from `(session, query)`, so they always match the current session.

## Choosing a result

**Choose Route** dispatches `routeAreaSelected(routeId, areaId)` to the Route Session reducer in one step: the route becomes the selected route and the matched area becomes `selectedAreaId`. That is the same state the Journey Stops and the map already use, so everything follows:

- the route is emphasised on the map and the other routes become secondary (existing behaviour, no redraw or refit),
- the matching Journey Stop is highlighted and scrolled into view,
- the map pans to the route position where the area is first reached and shows the existing area marker (our own data; no Places markers),
- no routing or detection request is made.

Choosing a result on another route clears the previous highlight; an area that is not on the chosen route selects the route and highlights nothing.

## Multi-area search

Several areas can be combined: "Neharpar" **and** "Sector 88". It is the same search over the same session data, with a list of selected areas on top.

- **Selecting.** Typing shows suggestions (ranked exact > prefix > contains, case-insensitive, no fuzzy matching). **+ Add** (or Enter for the top suggestion) turns a suggestion into a chip `[ Neharpar × ] [ Sector 88 × ]`, clears the text and keeps the chips. Selected areas are not suggested again. `×` removes only that chip; **Clear all** removes every chip; clearing the text keeps them.
- **Matching** (`matchRoutesByAreas` in `passingAreaSearchService.ts`, pure). A route is a *full match* only when every selected area is among its detected areas. An area is the same area on another route when it has the same `areaId` **or** the same normalised name and type (the same place can carry different ids on different routes). Routes with only some of the areas are *partial matches*: they are labelled "Matches 1 of 2 areas" without ✓ and are never counted as matches. An area repeated on a route uses its first occurrence. Duplicates in the selection count once.
- **Order.** The matched areas of a route are always listed in that route's own travel order (`sequence`), never in selection or alphabetical order.
- **Where it shows.** Chips and a summary of full-match routes (with **Choose Route**) in the search panel; "✓ Matches all 2 selected areas" on route cards; matched stops marked in Journey Stops (the full sequence is still shown); non-matching routes are secondary on the cards and drawn dimmer on the map. If no route passes through all areas: "No route passes through all selected areas." Nothing is removed, recalculated or requested; the selected route is never dimmed.
- **State.** `useAreaSearch(session)` (plain React state, no extra library) holds the text and the selected areas. They belong to the Route Session: changing start or destination, or any new session, clears them, so no filter outlives its routes. Pressing Find Routes for the same locations reuses the session and keeps them.

Still not implemented: ordered ("A before B") matching, saving searches, other places than detected areas.

## Tests

`npm test` (Node's built-in runner, no extra dependency): `passingAreaSearchService.test.ts` (exact, case-insensitive, partial, route-specific, several routes, no match, no session, ranking, determinism) and, for multi-area search, one/two/three areas, full vs partial matches, no route with all areas, duplicate selections, order preservation, suggestions, removing one / clearing all, and invalidation by a new session and `routeSessionSelection.test.ts` (choosing route + area). The browser flow (type, results, choose, map and Journey Stop highlight, no outgoing requests) was exercised with Playwright against a mocked API and a fake Google Maps.

## Known limitations

- Matches names only as written in the data: no transliteration, accents folding or spelling variants (`Sector-88` ≠ `Sector 88`).
- Only areas that the Area Detection Engine reported for a route can be found; an area the route touches but detection filtered out is not searchable.
- Results show at most 6 areas; typing more narrows them.
