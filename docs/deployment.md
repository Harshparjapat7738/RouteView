# Deployment: Vercel (frontend) + Render (backend)

RouteView is two independently deployed applications plus a database:

```text
Browser ──HTTPS──> Vercel  (static frontend, frontend/)
   │
   └──HTTPS, CORS──> Render  (Spring Boot API in Docker, backend/) ──> PostgreSQL + PostGIS
                              └──> Google Routes API (server key)
Browser ──> Google Maps JavaScript / Places API (browser key)
```

Nothing here has been deployed or verified against live Vercel, Render or Google services. The repository was checked locally (frontend build, tests, lint, type check); the backend image and the live headers still have to be verified after the first deployment (see "Verify after deploying").

## 1. Database (provision first)

* PostgreSQL 16 with the **PostGIS** extension (the development image is `postgis/postgis:16-3.4`).
* Flyway (migrations V1–V9) runs automatically when the backend starts and creates every table, spatial column and index. `V1` runs `CREATE EXTENSION IF NOT EXISTS postgis`: on a managed database either let the migration user do that, or run `CREATE EXTENSION postgis;` once as an administrator before the first start. A missing or unusable PostGIS stops the start.
* Hibernate never changes the schema (`ddl-auto: none`) and Flyway `clean` is disabled, so a deployment cannot wipe the database.
* **Data is not in the repository.** A fresh database has the schema and **no** areas, metro stations or bus network. Without them: routes still calculate through Google, but there are no Journey Stops (areas), `METRO` journeys return no RouteView metro data and `BUS` finds no route. Load data once, deliberately, from a machine with JDK 21 that can reach the database (point `POSTGRES_*` at it): `./gradlew importAreas`, `importMetro`, `importBus`. The datasets (`backend/metro.data/`, about 350 MB) are downloaded by you and are git-ignored. The area table is **not** a metro dataset. Review `docs/area-import.md`, `docs/metro.md` and `docs/bus.md` first and check your database plan's storage limit (the bus timetable has millions of rows). Nothing imports at startup.
* Use the provider's **internal** connection address from Render when the database is on Render; otherwise see "TLS" below.

## 2. Backend on Render

Render has no native Java runtime, so the service uses the Docker runtime and `backend/Dockerfile`.

| Setting | Value |
|---|---|
| Service type | Web Service |
| Runtime | Docker |
| Root directory | `backend` |
| Dockerfile path | `./Dockerfile` |
| Build / start command | none (the image builds with `./gradlew bootJar` on JDK 21 and starts `java -jar`) |
| Health check path | `/actuator/health` (public, no details) |
| Port | nothing to set: the app uses Render's `PORT` (`SERVER_PORT` overrides it) |
| Instance memory | the bus graph (about 99 k pattern stops) is cached in memory; a 512 MB instance may be tight, prefer 1 GB. Not measured on Render. |

The image runs with `SPRING_PROFILES_ACTIVE=prod` (override in the dashboard if needed), a non-root user, `-XX:MaxRAMPercentage=75`, and graceful shutdown so a redeploy finishes in-flight requests. The tests are skipped in the image build because they need a PostGIS database; run `./gradlew test` in CI or locally.

### TLS to the database

`application-prod.yml` builds the JDBC URL from `POSTGRES_HOST`, `POSTGRES_PORT` and `POSTGRES_DB`, with no TLS option. For a database that requires TLS (any public/external address) set the whole URL instead; it takes precedence:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/<database>?sslmode=require
```

`POSTGRES_USER` and `POSTGRES_PASSWORD` are still used. Flyway and the application share this connection.

### CORS

`CORS_ALLOWED_ORIGINS` must list the **exact** origin(s) of the frontend, comma-separated, no path, no trailing slash, no wildcard (startup fails on `*`). Example shape: `https://<your-production-domain>`. Each Vercel preview URL is a different origin: add one only when you test it against this backend. Requests from other origins get no CORS headers and the browser blocks them. The API uses no cookies and `allowCredentials` is false.

## 3. Frontend on Vercel

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Vite |
| Install command | `npm ci` (default with `package-lock.json`) |
| Build command | `npm run build` (`tsc -b && vite build`) |
| Output directory | `dist` |
| Node.js version | 22.x (`engines.node` is `>=22.12`) |

`frontend/vercel.json` only adds response headers (it contains no rewrites on purpose: RouteView has no client-side routes, share links are `/?rv=1&…` query strings on the root page, and the service worker serves the shell offline):

* `Permissions-Policy: geolocation=(self), camera=(), microphone=()`: keeps "Use my current location" working on RouteView's own origin only.
* `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (the Maps key is referrer-restricted, so `no-referrer` would break the map), `X-Frame-Options: DENY`.
* A Content-Security-Policy is **not** set there. Add the policy from `docs/security.md` as `Content-Security-Policy-Report-Only` first, with your API origin in `connect-src`, and enforce it after a clean test.

Vercel serves HTTPS, which geolocation requires. Do not copy the backend's `geolocation=()` header to the frontend.

## 4. Environment variables

Never put a secret in a `VITE_` variable: it is public in the JavaScript bundle. Real values go only in the Vercel / Render dashboards (or a git-ignored `.env`), never in the repository.

| Variable | Where | Required | Purpose | Secret | Safe default |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | Vercel (build) | Yes in production | Full backend base including `/api`, e.g. `https://<render-service>.onrender.com/api`. The default `/api` only works with a same-origin proxy and would fail on Vercel | No | `/api` (development) |
| `VITE_GOOGLE_MAPS_API_KEY` | Vercel (build) | Yes | Browser key for Maps JavaScript + Places (New). Restrict by HTTP referrer (your Vercel domain) and by API | Public by nature, restricted | none (map shows "not configured") |
| `VITE_GOOGLE_MAPS_MAP_ID` | Vercel (build) | Recommended | Your own Map ID (not the development `DEMO_MAP_ID`) | No | `DEMO_MAP_ID` |
| `VITE_MAP_DEFAULT_LAT`, `_LNG`, `_ZOOM` | Vercel (build) | No | Initial map view | No | India, zoom 5 |
| `DEV_BACKEND_URL` | local only | No | Vite dev proxy target. Not used in production | No | `http://localhost:8080` |
| `SPRING_PROFILES_ACTIVE` | Render | Set by the image (`prod`) | Production profile | No | `prod` in the image |
| `POSTGRES_HOST` | Render | Yes (unless `SPRING_DATASOURCE_URL`) | Database host | No | none in `prod` |
| `POSTGRES_PORT` | Render | No | Database port | No | `5432` |
| `POSTGRES_DB` | Render | Yes (unless URL) | Database name | No | none in `prod` |
| `POSTGRES_USER` | Render | Yes | Database user (least privilege) | Yes | none in `prod` |
| `POSTGRES_PASSWORD` | Render | Yes | Database password | **Yes** | none, the app refuses to start |
| `SPRING_DATASOURCE_URL` | Render | Only for TLS / external DB | Full JDBC URL with `?sslmode=require` | Yes if it embeds credentials (it should not) | none |
| `CORS_ALLOWED_ORIGINS` | Render | Yes | Exact frontend origin(s) | No | none (closed) |
| `GOOGLE_MAPS_SERVER_API_KEY` | Render | Yes for routing | Routes API key. A different key from the browser key; restrict to Routes API (and to Render's outbound IPs if you can) | **Yes** | none (routes answer 503) |
| `SERVER_PORT` | Render | No | Overrides `PORT` | No | `PORT`, else `8080` |
| `MAX_REQUEST_BODY_BYTES` | Render | No | Largest accepted request body | No | `16384` |
| `BUS_JOURNEY_TIME_ZONE`, `BUS_JOURNEY_MAX_ALTERNATIVES` | Render | No | Bus planner tuning | No | `Asia/Kolkata`, `3` |
| `AREA_DETECTION_*` | Render | No | Area-detection tuning, see `docs/area-detection.md` | No | documented defaults |
| `AREA_IMPORT_*`, `METRO_IMPORT_*`, `BUS_IMPORT_*` | **Not on Render** | No | Only for the explicit `importAreas` / `importMetro` / `importBus` commands run from a developer machine | No | not needed at runtime |

## 5. Order of deployment

1. Provision PostgreSQL + PostGIS and note its host, port, database, user and (internal / TLS) address.
2. Google Cloud: browser key (Maps JavaScript + Places (New), referrer restrictions added for the Vercel domain once known) and a separate server key (Routes API). See `docs/google-cloud-setup.md`.
3. Create the Render web service (Docker, root `backend`), set the database variables, `GOOGLE_MAPS_SERVER_API_KEY` and a first `CORS_ALLOWED_ORIGINS` (a placeholder you will correct in step 6 is fine). Deploy and wait for `/actuator/health` to be `UP`. Flyway creates the schema.
4. Create the Vercel project (root `frontend`), set `VITE_API_BASE_URL` to the Render address plus `/api`, the browser key and the Map ID. Deploy.
5. Add the final Vercel production domain to the browser key's HTTP-referrer restriction.
6. Set `CORS_ALLOWED_ORIGINS` on Render to the exact Vercel production origin and redeploy the backend.
7. Load the area, metro and bus data deliberately (section 1), then run the verification below.

## Verify after deploying

Do not treat the deployment as working until each of these has been checked on the live services:

* The frontend loads over HTTPS with no console errors, and no request goes to `localhost`.
* `GET https://<render-service>/actuator/health` returns `{"status":"UP"}`.
* A route search from the frontend reaches `/api/routes`, returns alternatives, and the browser shows no CORS error.
* The document response of the frontend contains `Permissions-Policy: geolocation=(self)…` (DevTools → Network → the page → Headers, or `curl -I https://<frontend>`), and the API's own `geolocation=()` is not on the page.
* The map and place search load with the browser key (no referrer error).
* "Use my current location" prompts for permission and places the blue dot (HTTPS; test on a real phone too).
* With data imported, a Metro journey (Delhi) returns stations and lines, and a Bus journey returns a timetable.
* Render logs show Flyway applied V1–V9 and no import ran at startup.

## Known gaps (need a decision or manual action)

* `/api/routes` is public and has no rate limit. Each call can use paid Google Routes quota. Cap it with Google Cloud quotas and billing alerts, or decide on rate limiting at an edge/proxy.
* The metro, bus and area datasets must be imported by hand and are large.
* The Docker image has not been built in the sandbox used for this preparation (no Docker daemon, and the Gradle plugin repository was not reachable); the first Render build is its first test.
