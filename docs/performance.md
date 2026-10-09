# Performance

What was measured, what was changed because of it, and what was deliberately left alone. Every number here was observed in the development sandbox (synthetic data, a fake Google Maps, a development build of the frontend); nothing is a production benchmark. Re-measure on your own data with the commands at the end.

## What was inspected and found fine

- **Requests.** One route calculation is exactly one `POST /api/routes` (routes and areas are detected in the same backend request). Selecting a route, choosing a Journey Stop, typing in or changing the passing-area search, expanding cards and opening/closing the Journey View make **0** requests. Six consecutive calculations made 6 route requests. Request cancellation, stale-response protection and the single retry are unchanged.
- **Map objects.** One Google `Map` is created per page load and survives every interaction. Polylines are created once per calculation and only have their options updated afterwards; selecting a route creates no polyline and does not refit the map. After six recalculation cycles exactly the current session's 3 polylines and 3 markers are attached, listener counts and DOM size are constant, so nothing accumulates.
- **Cleanup.** Every timer, `AbortController` and `addEventListener` in the source is paired with its removal (`requestPolicy`, `useDebouncedValue`, `useOnlineStatus`, the slow-map timer, the suggestion request).
- **PWA.** Still shell-only precache, no runtime caching: Google, `/api` and route sessions are never cached.
- **TanStack Query** is not part of RouteView (the route session is one reducer), so none was introduced.

## Frontend: what was wrong and what changed

Nothing was memoized, so every state change re-rendered everything below `HomePage`. Typing a letter in the passing-area search re-rendered the location inputs, the route list, every route card, and the whole map layer (map, markers, every polyline wrapper). Counts below are React commits per interaction (3 routes × 40 stops, development build, same script before and after):

| Interaction | Before | After |
| --- | --- | --- |
| Type 4 letters in the area search | location inputs 8, map layer 4, polyline wrappers 12 | location inputs 0, map layer 1, polyline wrappers 3 |
| Click a Journey Stop | route cards 3, location inputs 2, polyline wrappers 3 | route cards 1 (the selected one), no location inputs, no polylines |
| Select another route | route cards 3, location inputs 2, markers 2 | route cards 2 (old + new selection), no location inputs or markers |
| Open Journey View | map layer, markers and polylines re-rendered | map layer untouched |

Changes: `memo` on `LocationPanel`, `MapView`, `MapRoutes`, `MapMarkers`, `MapViewport`, `MapAreaHighlight`, `JourneyStops`, `RouteStopsPreview`, `JourneyView`, `JourneyTimeline`; a memoised `RouteListItem` so a card re-renders only when its own route, selection, badges or search match changed (only the selected route receives the highlighted stop id); stable handlers in `HomePage`; `calculate` reads the latest state through a ref so selecting no longer changes its identity; the set of dimmed routes keeps its identity while the same routes are dimmed; the search is keyed on the session's routes, so choosing a stop does not re-run it; the Journey view is derived with `useMemo`. Virtualisation was **not** added: stop lists are collapsed to 8 (compare view) and the timeline renders at most a few hundred light rows, so there is nothing to gain.

## Bundle

One 321 KB (99.7 KB gzip) JavaScript file was split into `react` (207 KB), `maps` (59 KB) and the application (55 KB, about 17 KB gzip), plus a 0.6 KB runtime. The total is unchanged (React DOM is 64% of the source); the benefit is caching: a release that changes only RouteView code re-downloads, and the service worker re-precaches, the application chunk instead of the whole file. The Journey View and other components are small, so no route-level lazy loading was added.

## Backend and PostGIS

Area detection is **one** spatial query per route (no per-area queries, no N+1), runs entirely in PostgreSQL, and returns only the columns the selection policy needs (no geometry is transferred). The GiST index `area_geometry_gist` is used: the plan shows a bitmap index scan on it.

Profiling the candidate query with `EXPLAIN ANALYZE` on a throwaway PostGIS 16 with 26,350 synthetic areas (20,000 villages up to 250 districts, 40–640 vertices each) found a real problem. For an 8 km route with only 17 candidate areas the query took **8.1 s**: the `crossed` aggregate was re-executed once per candidate (`loops=17`), repeating the expensive `ST_Buffer`/`ST_Difference` work. Changes to `route-area-candidates.sql`:

1. `pieces` and `crossed` are `MATERIALIZED`, so they are evaluated once (8.1 s → 0.25 s for the 8 km route).
2. The boundary buffer is computed once per candidate area, not once per crossing piece (0.25 s → about 0.07 s).
3. The route is cut into pieces of at most 64 vertices (`ST_Subdivide`) and each piece's expanded box is matched against the GiST index. For a ~500 km diagonal route the old single bounding box matched 20,554 of the 26,350 areas, the piece boxes matched 898, and 288 were within tolerance. The expansion is a superset of the tolerance, so no area is missed.

Latest timings, same synthetic data, median of two runs, compared with the version that only had change 1 (the original query was too slow to wait for on the longer routes): 8 km route 0.24 s → 0.07 s; 60 km route 0.53 s → 0.26 s; 500 km route 19.8 s → 2.3 s. The returned rows were compared one by one with the reference query on all three routes and on the five boundary cases of the detection tests (grazing, shared border, split areas, start inside, point touch): identical. A planar `ST_DWithin` pre-check was tried and removed: it was slower than the geography test it was meant to guard.

No new index was added: the existing ones (`area_geometry_gist`, `source + source_id`, `area_type`, `parent_area_id`, `lower(name)`) cover the queries that exist, and none of the measured time was spent in an index lookup.

## Measuring again

- Frontend renders and requests: run the app (`npm run dev`) and use the React DevTools profiler, or count requests in the browser's network tab while selecting routes and stops (expect zero).
- Bundle: `npm run build` prints chunk sizes.
- Database: with real data loaded, run the query from `route-area-candidates.sql` under `EXPLAIN (ANALYZE, BUFFERS)` for a long and a short route; look for `loops` greater than 1 on aggregate nodes and for a sequential scan of `area`.
