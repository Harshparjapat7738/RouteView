# Architecture & API Conventions
# docker compose -f docker-compose.full.yml up -d
# docker compose -f docker-compose.full.yml down
## System overview

```text
React PWA (frontend/)
      │  HTTP + JSON, /api/...
      ▼
Spring Boot modular monolith (backend/)
      │
      ├── domain modules (route, area, journey, search, spatial)
      ├── provider adapters (routing, geocoding)  ──►  Google Maps Platform
      └── PostgreSQL + PostGIS (area table, SRID 4326; see database.md)
```

In development the Vite dev server proxies `/api` to Spring Boot, so the browser sees a single origin. In production the frontend is either served from the same origin as the API or the API allows the frontend origin through `CORS_ALLOWED_ORIGINS`.

## Backend modules

Package root: `com.routeview`. Each module documents its responsibility in its `package-info.java`.

| Module | Responsibility |
| --- | --- |
| `common` | Cross-cutting code shared by all modules; depends on no feature module |
| `configuration` | Web/CORS setup, security headers, typed configuration properties |
| `route` | Route sessions and calculated routes; public route API |
| `routing` | `RoutingProvider` abstraction + Google adapter |
| `geocoding` | `GeocodingProvider` abstraction + Google adapter |
| `area` | Geographical areas (never POIs): `Area` entity, `AreaType`, `AreaRepository`, `AreaService` |
| `spatial` | Spatial foundation (SRID 4326, geometry factory); later PostGIS operations (intersection, containment, position along route) |
| `journey` | Reserved for later journey features (area detection lives in `area.detection`) |
| `search` | Passing-area search over an existing route session |

Inside a module, use sub-packages only as needed: `controller`, `service`, `dto`, `model` (plus `repository` when persistence arrives). Modules talk to each other through services and their own types, never through another module's controllers. Provider response types never leave `routing`/`geocoding`.

## Frontend structure

Code is organised by feature under `frontend/src/features/<feature>/`. Google-specific code is isolated:

- `features/map` owns loading the Google Maps JavaScript API (`GoogleMapsProvider`, the only place that does so), the map view and the marker layer. It exposes its own `MapMarker` type and knows nothing about locations or routes.
- Route comparison (cards, badges, collapsible stops, search matches) is described in [`route-comparison.md`](route-comparison.md); it reads only the Route Session.
- `features/route` owns route calculation and the Route Session: the API client (`routeApi.ts`, which validates the response), polyline decoding, the session model and reducer (`state/`), the `useRouteSession` hook, and the `RouteList`/`RouteCard` components. It talks only to the backend and never to Google directly.
- `features/search` owns Passing-Area Search: a pure `passingAreaSearchService` (match, group, rank over the session's detected areas) and the `PassingAreaSearch` component. It makes no request; `useAreaSearch` keeps the typed text and the selected areas (cleared with the session), and `matchRoutesByAreas` finds routes through all of them. It makes no request; choosing a result dispatches one `routeAreaSelected` action to the Route Session. See [`passing-area-search.md`](passing-area-search.md).
- `features/journey` owns the Journey View (header, route switcher, timeline, pure `buildJourney`): a presentation of the selected route of the Route Session that reads it and dispatches the existing selection actions. See [`journey-view.md`](journey-view.md).
- The app is an installable PWA (`vite-plugin-pwa`, shell-only precache, no runtime caching) with a mobile-first layout; see [`pwa.md`](pwa.md).
- `services/google/` holds the shared request policy (timeouts, bounded retry, cancellation), failure classification and messages used by route calculation, Places search and map loading; see [`google-api-reliability.md`](google-api-reliability.md).
- `features/location` owns Start/Destination selection. The UI depends on the provider-independent `LocationSearchService` interface and the app's own `LocationSelection` model; only `services/googlePlacesSearch.ts` touches Google Places objects. One service instance is created per search field.
- `pages/HomePage` composes the features and holds the selected start/destination in plain React state (`null` = not selected). Typed text is never a selection.

## Data flow towards area detection

```text
Google Routes → Route (encoded polyline kept) → Area Detection Engine → PostGIS → ordered DetectedAreas → RouteSession → Journey Stops
```

The engine is described in [`area-detection.md`](area-detection.md): one PostGIS query per route, then a plain-Java selection policy (relevance per area type, de-duplication by area id, hierarchy, order) that records a verdict for every candidate.

Areas are filled by an explicit import (`gradlew importAreas`): `AreaDataProvider` (OpenStreetMap today) → `NormalizedArea` → validation → batched upsert, see [`area-import.md`](area-import.md). Provider classes (Google, OSM) stop at `routing` and `area/ingest/osm`; `area` knows only RouteView's own types and SRID 4326 geometry. Only `AreaRepository` talks to the `area` table. Details: [`database.md`](database.md).

## Route calculation flow

```text
Find Routes (HomePage) → useRouteCalculation → POST /api/routes
  → RouteController → RouteService → RoutingProvider ← GoogleRoutesProvider → Google Routes API
```

**Decision: routing runs on the backend.** The Routes API is called with the *server* key (`GOOGLE_MAPS_SERVER_API_KEY`), which never reaches the browser. The browser key is referrer-restricted to the Maps JavaScript and Places APIs and is deliberately not reused (a server request has no referrer). The backend is also where the future Area Detection Engine needs the route geometry, so route data does not have to round-trip through the client.

- `routing` has its own provider-neutral types (`RoutingRequest`, `RouteCandidate`) and the `RoutingProvider` interface. Everything Google-specific (`GoogleRoutesProvider`, request factory, response mapper, properties) is package-private to `routing.google`.
- `route` depends on `routing`, never the reverse. `RouteService` turns candidates into the internal `Route` (id, index, distance, duration, encoded polyline, summary).
- The Google field mask requests only duration, distance, encoded polyline and description; `TRAFFIC_UNAWARE` keeps the request in the cheapest SKU. `computeAlternativeRoutes` is on and the number of routes is never assumed (0..n, capped).
- Provider failures become `RoutingException` with a reason (`NOT_CONFIGURED`, `UNAVAILABLE`, `TIMEOUT`, `QUOTA`, `REJECTED`, `INVALID_RESPONSE`) which the controller maps to `503`/`504`/`502` with a generic body and a stable `code`. Details are logged by reason only.

## Route Session (frontend)

```text
Location selection → Route calculation → Route Session → Route selection → Map
   (HomePage)        (useRouteSession)    (RouteSession)   (reducer)      (MapRoutes)
```

`RouteSession` (`features/route/types/routeSession.ts`): `id`, `startLocation`, `destinationLocation`, `routes[]` (each with distance, duration, summary, **`encodedPolyline` and decoded `path`**), `selectedRouteId` and `createdAt`. It is application state only (React `useReducer`, no extra library, nothing persisted), so a page reload starts with no session.

- `state/routeSession.ts` creates sessions and selects routes (pure functions); `state/routeSessionReducer.ts` holds the states `none | loading | ready | error` and the actions `calculationStarted/Succeeded/Failed` and `routeSelected`.
- A state is keyed by the pair of coordinates it belongs to: it is hidden as soon as either location changes and results of superseded requests are ignored.
- Selecting a route only changes `selectedRouteId`; it never calls the routing API and does not redraw the lines or refit the map. Pressing Find Routes again for locations that already have routes reuses the session.
- `HomePage` composes the pieces: `RouteList`/`RouteCard` and the map both read the same `selectedRouteId` and both call the same `selectRoute`. The map receives only `MapRoute` (id, path, colour) from `toMapRoutes`.
- `RouteCard` takes `children`: the selected route shows `JourneyStops`, the others a collapsible `RouteStopsPreview`. Each route carries its own `detectedAreas`; `selectedAreaId` (always an area of the selected route) drives the map highlight. See [`area-detection.md`](area-detection.md).

### Route Session lifecycle and consistency

**State ownership.** There is one authoritative store: the `routeSessionReducer` behind `useRouteSession`. It holds the session (locations, routes with their `detectedAreas`, `selectedRouteId`, `selectedAreaId`). Everything else is derived: the route list, comparison badges, Journey View, Journey Stops, the map lines and highlight, and every search result are computed from the session in render. The only other state is UI-local: the typed search text and chosen filter areas (`useAreaSearch`) and whether the Journey View was requested (`HomePage`).

**Lifecycle.**

```text
locations change  -> pending request cancelled, stored session for the old locations discarded (never revived),
                     search text/filters cleared, Journey View closed
Find Routes       -> loading (old routes are not shown) -> ONE backend response = routes + their detected areas
                     -> complete new session (selected route = first route, no highlighted area)
success           -> session is normalised: selectedRouteId is one of its routes, selectedAreaId one of that route's areas
failure           -> error for the NEW locations (retry offered when useful); old routes are never shown for them
```

Route calculation and area detection are one backend request, so the session is created atomically: there is no half-built session to expose, and "loading" covers both steps.

**Stale-response protection.** `routeRequestSlot` allows exactly one request to update the session; a newer request (other locations) aborts and supersedes the older one, a repeated click for the same locations is dropped, and the reducer additionally ignores any result whose key does not match the pending calculation. A late answer from request A can therefore never overwrite session B.

**Failure behaviour (decision).** A session is only valid for the exact location pair it was calculated for, so changing a location immediately invalidates it. A failed recalculation therefore shows a clear error and no routes; keeping the old routes visible would present them as the result of the new locations.

**Selection.** Selecting a route, a stop or an area, opening/closing the Journey View, and adding/removing/clearing filter areas are pure state changes: they never call the routing API. Switching the route clears the highlighted area (it belongs to one route). Filter areas are pruned to areas that exist in the current session, so they can never refer to another session; they are also cleared whenever the session changes.

**Journey View** is shown only while the session has a selected route; otherwise the comparison view is shown.

### `POST /api/routes`

Request:

```json
{ "origin": { "latitude": 28.3354, "longitude": 77.4231 }, "destination": { "latitude": 28.4089, "longitude": 77.3178 } }
```

Response `200` (`routes` is empty when no route exists):

```json
{ "routes": [ { "id": "…", "index": 0, "distanceMeters": 28400, "durationSeconds": 2520, "summary": "NH19", "encodedPolyline": "…", "detectedAreas": [ { "areaId": "…", "name": "…", "areaType": "VILLAGE", "sequence": 1, "positionAlongRoute": 0.0, "distanceFromStartMeters": 0, "latitude": 28.3354, "longitude": 77.4231 } ] } ] }
```

`detectedAreas` may be empty (a normal result); a failure of area detection never fails the request.

`400` for missing/out-of-range coordinates or identical start and destination; `503` when routing is not configured or temporarily unavailable; `502` when Google rejects the request or answers unexpectedly.

## API conventions

- **Prefix:** all application endpoints live under `/api/` (e.g. `/api/routes`). Actuator stays under `/actuator/`.
- **Format:** `application/json` for requests and responses.
- **DTOs:** controllers accept and return DTOs (Java records). Internal models and future JPA entities are never serialised directly.
- **Validation:** validate at the boundary with Jakarta Bean Validation (`@Valid`, `@NotBlank`, `@Size`, ...). The frontend never counts as validation.
- **Status codes:** `200` read/ok, `201` created, `204` no content, `400` invalid input, `404` not found, `405` wrong method, `415` unsupported media type, `500` unexpected error.
- **Errors:** always an RFC 9457 Problem Details body, produced by `common.error.GlobalExceptionHandler`.

### Error response format

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed.",
  "instance": "/api/example",
  "errors": [
    { "field": "destination", "message": "must not be blank" }
  ]
}
```

`errors` appears only for validation failures. For a missing resource, throw `ResourceNotFoundException` (or a module-specific subclass) with a client-safe message. Any other unhandled exception returns `500` with the generic detail `"An unexpected error occurred."`; the real cause is logged server-side only.

## Configuration profiles

| Profile | Activation | Purpose |
| --- | --- | --- |
| `dev` | Default when no profile is set | Local development; `com.routeview` logs at `DEBUG` |
| `test` | `@ActiveProfiles("test")` in tests (`src/test/resources/application-test.yml`) | Quiet logging for automated tests |
| `prod` | `SPRING_PROFILES_ACTIVE=prod` | Structured JSON (ECS) logs, `WARN` root level, `CORS_ALLOWED_ORIGINS` must be set |

Shared settings live in `application.yml`. Secrets never appear in any committed configuration file; they come from environment variables or a local, git-ignored `backend/.env`.

## Logging rules

- Use SLF4J (`LoggerFactory.getLogger(...)`) with parameterised messages.
- Never log passwords, API keys, tokens, `Authorization` headers, full request bodies or personal data (e.g. precise user locations).
- `ERROR` for unexpected failures (with stack trace, server-side only), `WARN` for recoverable problems, `INFO` for significant lifecycle events, `DEBUG` for development detail.
