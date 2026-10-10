# RouteView

RouteView is a route-planning web application (and PWA) built on Google Maps Platform. Alongside the usual distance and duration, it shows **which geographical areas** (villages, localities, sectors, towns, cities) each possible route passes through, and lets you search for an area you need to pass through to pick the right route.

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for the product concept, [`docs/architecture.md`](docs/architecture.md) for technical conventions, [`docs/database.md`](docs/database.md) for the database, [`docs/area-import.md`](docs/area-import.md) for the area import and [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md) for Google Cloud configuration and [`docs/security.md`](docs/security.md) for security and production configuration.

> **Status:** foundation, Google Maps display, Start/Destination selection and route calculation. With two locations selected, **Find Routes** requests route alternatives (via the backend and the Google Routes API) and draws them on the map with a basic distance/duration summary. The backend also has a PostgreSQL + PostGIS spatial database foundation for geographical areas (see [`docs/database.md`](docs/database.md)); areas can be imported from OpenStreetMap with an explicit command (see [`docs/area-import.md`](docs/area-import.md)), and the **Area Detection Engine** uses them: each calculated route lists the geographical areas it passes through, in travel order, as **Journey Stops** (see [`docs/area-detection.md`](docs/area-detection.md)). **Passing-Area Search** lets you type an area name and choose among the calculated routes that pass through it; it searches only those detected areas, never Google (see [`docs/passing-area-search.md`](docs/passing-area-search.md)). Route cards compare duration, distance, area count and journey, with factual **Fastest / Shortest / Selected / Matches** badges (see [`docs/route-comparison.md`](docs/route-comparison.md)). Google requests are bounded, cancellable and retried at most once for transient failures, with friendly errors and recovery actions (see [`docs/google-api-reliability.md`](docs/google-api-reliability.md)). RouteView is an installable **PWA** with a mobile-first layout; it needs a connection for maps and routing (see [`docs/pwa.md`](docs/pwa.md)). **Journey View** shows the selected route as Start → detected areas → Destination beside the map, with a route switcher (see [`docs/journey-view.md`](docs/journey-view.md)). **Multi-area search** combines several detected areas as removable chips and keeps only the routes through all of them.

## Project structure

```text
.
├── frontend/                 React + TypeScript + Vite single-page app (future PWA)
│   ├── public/               Static assets served as-is
│   └── src/
│       ├── app/              App root and global styles
│       ├── config/           Browser-visible configuration (env.ts)
│       ├── features/map/     Google Maps loading, map view, markers (components/, config/, hooks/, types/)
│       ├── features/location/ Start/destination search and selection (components/, hooks/, services/, types/, utils/)
│       ├── features/route/   Find Routes, Route Session state, route list/cards
│       ├── layouts/          Page shells
│       ├── pages/            Route-level pages
│       ├── services/api/     Centralised HTTP client for the backend
│       └── types/            Shared TypeScript types (API contracts)
├── backend/                  Spring Boot modular monolith (Gradle); docker-compose.yml = local PostgreSQL + PostGIS
│   └── src/main/java/com/routeview/
│       ├── common/           Cross-cutting code (global error handling)
│       ├── configuration/    Web, CORS, security headers, typed properties
│       ├── route/            POST /api/routes (controller, service, dto, model)
│       ├── routing/          RoutingProvider abstraction + Google Routes adapter
│       ├── area/             Geographical areas: entity, AreaType, repository, service (PostGIS)
│       ├── spatial/          SRID 4326 constant and geometry factory
│       └── geocoding/  journey/  search/      Domain modules (empty for now)
│       (common/geo holds the shared Coordinates value type)
├── docs/                     Technical documentation
├── PROJECT_PLAN.md           Product & technical understanding document
└── .env.example              Points to the per-app .env.example files
```

Feature code is organised by feature, not by technical layer: `frontend/src/features/<feature>/` (`map`, `location` and `route` exist; `journey`, `area` come later) and `backend/.../com/routeview/<module>/{controller,service,dto,model}`. These folders are created when the first feature needs them.

## Technology stack

| Area | Choice |
| --- | --- |
| Frontend | React 19, TypeScript 6 (strict), Vite 8, oxlint |
| Backend | Java 21, Spring Boot 4.1, Gradle 8.14 (wrapper included) |
| Database | PostgreSQL 16 + PostGIS 3.4, Spring Data JPA / Hibernate Spatial, Flyway migrations |
| Maps / location search | Google Maps JavaScript API + Places API (New) via `@vis.gl/react-google-maps` |
| Routing | Google Routes API (`computeRoutes`), called from the backend |

Dependencies are kept minimal (React, `@vis.gl/react-google-maps`). Tailwind CSS, shadcn/ui, TanStack Query, Zustand, PWA tooling and the database driver are part of the plan but are only added when the step that needs them is implemented.

## Prerequisites

- **Node.js 22.12+** (includes npm)
- **Docker** (for the local PostgreSQL + PostGIS database; or your own PostgreSQL with PostGIS)
- **JDK 21** (e.g. Eclipse Temurin 21). The backend pins the Gradle daemon, Java compilation, and test runtime to Java 21; use a Java version manager that reads `backend/.java-version` or set `JAVA_HOME` to a JDK 21 installation. Gradle itself is downloaded by the wrapper.

## Getting started

### Frontend

```bash
cd frontend
npm install          # install dependencies
npm run dev          # dev server on http://localhost:5173
npm run build        # type-check + production bundle in frontend/dist
npm run lint         # static analysis
npm test             # unit tests (Node test runner): passing-area and multi-area search, route session selection
npm run preview      # serve the production build locally
```

In development the Vite server proxies `/api/*` to the backend (`http://localhost:8080` by default), so no CORS setup is needed locally.

### Backend

The backend needs the database. Copy `backend/.env.example` to `backend/.env`, set `POSTGRES_PASSWORD`, then:

```bash
cd backend
docker compose up -d # PostgreSQL + PostGIS (docker compose stop / down to stop)
./gradlew bootRun    # run on http://localhost:8080 (profile: dev)
./gradlew importAreas # explicit area import (set AREA_IMPORT_REGION first); never runs at startup
./gradlew importMetro # explicit Delhi Metro station import from a downloaded GTFS dataset (see docs/metro.md); never runs at startup
./gradlew areaQuality # read-only area data-quality report (coverage by type/source, rule violations)
./gradlew build      # compile, test and package -> backend/build/libs/
./gradlew test       # run tests only
```

On Windows use `gradlew.bat` instead of `./gradlew`. Health check: `GET http://localhost:8080/actuator/health`.

## Environment configuration

| File | Copy to | Read by | Contains |
| --- | --- | --- | --- |
| `frontend/.env.example` | `frontend/.env.local` | Vite | Public, browser-visible values only |
| `backend/.env.example` | `backend/.env` | Spring Boot (via `spring.config.import`) | Server-side configuration and secrets |

Real environment variables always override values from `backend/.env`. All `.env*` files except `.env.example` are git-ignored.

**Frontend**

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base path/URL, default `/api` |
| `DEV_BACKEND_URL` | Backend address for the Vite dev proxy (not sent to the browser) |
| `VITE_GOOGLE_MAPS_API_KEY` | Restricted **browser** key (Maps JavaScript API + Places API (New)). Without it the app shows "Google Maps API key is not configured." |
| `VITE_GOOGLE_MAPS_MAP_ID` | Optional Map ID for markers (default `DEMO_MAP_ID`, development only). Not a secret |
| `VITE_MAP_DEFAULT_LAT`, `VITE_MAP_DEFAULT_LNG`, `VITE_MAP_DEFAULT_ZOOM` | Optional initial map view (default: India overview, zoom 5) |

**Backend**

| Variable | Purpose |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `dev` (default), `test` or `prod` |
| `SERVER_PORT` | HTTP port, default `8080` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed browser origins. Empty = none. **Required in `prod`** (may be set empty for same-origin deployments) |
| `POSTGRES_DB`, `POSTGRES_USER` | Database name and user (default `routeview`); also read by docker compose |
| `POSTGRES_PASSWORD` | **Required**, no default. Database password; also read by docker compose |
| `AREA_IMPORT_REGION` (or `AREA_IMPORT_SOURCE_FILE`) | Region (`south,west,north,east`) or saved Overpass file for `importAreas`. Optional: `AREA_IMPORT_OVERPASS_URL`, `AREA_IMPORT_BATCH_SIZE`, `AREA_IMPORT_MAX_SPAN_DEGREES` |
| `AREA_DETECTION_*` | Optional tuning of the Area Detection Engine: `AREA_DETECTION_TOLERANCE_METERS` (30), `AREA_DETECTION_MIN_CROSSING_METERS` (250), `AREA_DETECTION_MIN_CROSSING_FLOOR_METERS` (60), `AREA_DETECTION_BOUNDARY_BAND_METERS` (12); per-type minimums live in `application.yml`; see `docs/area-detection.md` |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Where the backend connects (default `localhost`, `5432`); compose publishes the port on localhost only |
| `GOOGLE_MAPS_SERVER_API_KEY` | **Server** Google key used for the Routes API. A separate key from the browser key (see below). Without it `POST /api/routes` answers `503` and the UI shows a generic message |

## Release (production)

1. **Database:** PostgreSQL 16 with PostGIS, a dedicated least-privilege user, reachable only from the backend. Flyway creates the schema on first start; load area data once with `./gradlew importAreas` (see [`docs/area-import.md`](docs/area-import.md)).
2. **Backend:** `./gradlew build`, then run `backend/build/libs/*.jar` with `SPRING_PROFILES_ACTIVE=prod` and these variables set: `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `GOOGLE_MAPS_SERVER_API_KEY` (Routes API only, IP-restricted) and `CORS_ALLOWED_ORIGINS` (the frontend origin; no wildcards).
3. **Frontend:** `VITE_GOOGLE_MAPS_API_KEY=<referrer-restricted browser key> npm run build`, then serve `frontend/dist` over **HTTPS** with a fallback to `index.html`. Send `Cache-Control: no-cache` for `index.html` and `sw.js` (hashed files under `/assets` can be cached for a year). Route `/api` to the backend (same origin, or set `VITE_API_BASE_URL` at build time and list the origin in `CORS_ALLOWED_ORIGINS`).
4. **Google Cloud:** enable Maps JavaScript API and Places API (New) on the browser key and Routes API on the server key; restrictions are in [`docs/security.md`](docs/security.md) and [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md).
5. **Before going live:** work through the checklist in [`docs/security.md`](docs/security.md); measurements and tuning notes are in [`docs/performance.md`](docs/performance.md).

## Security rules

**Secrets**

- Never hardcode or commit API keys, passwords, tokens, credentials or private keys. Use environment variables.
- Only `.env.example` files are committed, and they contain names, not values.

**Google Maps Platform keys** (full setup in [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md))

- Two keys are in use. The browser key is limited to the **Maps JavaScript API and Places API (New)**; the server key to the **Routes API**. Use **two separate keys**, never one generic unrestricted key:
  - **Browser key** (`VITE_GOOGLE_MAPS_API_KEY`): it is public once deployed, so restrict it by **HTTP referrer** (your domains only) and by **API** (Maps JavaScript API + Places API (New) only).
  - **Server key** (`GOOGLE_MAPS_SERVER_API_KEY`): backend only. Restrict it by **API** (only the Routes API for now) and by server IP where possible. Do **not** give it a referrer restriction: server requests carry no referrer and would be rejected. Never reuse the browser key here. It must never appear in frontend code or any `VITE_` variable.
- Calls to routing/geocoding web services go through the backend, so the server key never reaches the browser.
- Set quotas and billing alerts in Google Cloud.
- The map shows only generic error messages to users; Google's detailed errors appear in the browser console only. No user location is collected.

**Frontend**

- Every `VITE_*` variable ships in the bundle: never put secrets there.
- Client-side validation is for UX only; the backend validates every request.
- Treat API responses as untrusted input; narrow/validate before use.
- `dangerouslySetInnerHTML` is forbidden (enforced by oxlint `react/no-danger`). React escapes text by default; keep it that way.
- Search text is untrusted: it is length-limited, sent only to the location search service, and always rendered as text (never as HTML). Only the selected name, coordinates and place ID are kept; raw Google responses are not stored.
- Route responses are untrusted: shape, sizes and polyline are validated before use, and users only ever see generic error messages.
- All API calls go through `src/services/api/httpClient.ts`; the base URL is configured only in `src/config/env.ts`.

**Backend**

- `POST /api/routes` validates coordinates (range, finite, start != destination). Google error bodies and exception messages never reach the client or the logs; the browser only sees `Route calculation is currently unavailable.`
- Errors are returned as RFC 9457 Problem Details. Stack traces, exception messages, file paths and configuration are never included in responses; unexpected errors are logged server-side and answered with a generic message.
- Every response carries defensive headers (`X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`).
- CORS is closed by default and opened only for origins listed in `CORS_ALLOWED_ORIGINS`.
- Only the `health` actuator endpoint is exposed, without details.
- Database credentials come only from environment variables (`POSTGRES_*`), have no default password and exist only in the backend; the database port is published on localhost only. Flyway migrations are the only schema changes.
- Never log passwords, API keys, authorization headers, tokens or personal data. Production logs are structured JSON (ECS) at `WARN`/`INFO`.

## Development conventions

- **Architecture:** modular monolith. Each backend module owns its `controller`, `service`, `dto` and `model` packages; no global `controller/` or `service/` folders. External providers (Google) stay behind interfaces in `routing` and `geocoding`; domain and spatial logic never use provider response types.
- **API:** every endpoint under `/api/...`, JSON in and out, DTOs at the boundary (never expose entities), Bean Validation on inputs, correct HTTP status codes, Problem Details for errors. Details in [`docs/architecture.md`](docs/architecture.md).
- **Code quality:** TypeScript strict mode; small focused files; meaningful names; no dead or commented-out code; no fake or placeholder implementations; no hardcoded environment-specific values.
- **Dependencies:** add a dependency only when the current step needs it, and never two libraries for the same job.
- **Tests:** JUnit 5 + Spring Boot Test are configured for the backend. Use `@ActiveProfiles("test")` for test configuration. Write tests alongside real behaviour, not placeholders.
- **Git:** line endings are normalised by `.gitattributes`; build output, dependencies, IDE files, logs and `.env` files are ignored.
