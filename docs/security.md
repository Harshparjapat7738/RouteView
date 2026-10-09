# Security & production configuration

RouteView has no accounts or authentication. This page covers secrets, Google keys, CORS, error and log hygiene, the production profile, the database, security headers and a pre-release checklist.

## Secrets and environment variables

All secrets come from environment variables. Nothing secret is committed; `.env` and `.env.*` are git-ignored, and only `.env.example` files with placeholders are tracked.

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | frontend (public by design) | Browser key. Protect it with restrictions, not secrecy. |
| `GOOGLE_MAPS_SERVER_API_KEY` | backend only | Separate key for the Routes API. Never logged; masked in `toString`. |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` | backend | Required in `prod` (no defaults for host/db/user). |
| `POSTGRES_PASSWORD` | backend, docker compose | No default anywhere; the app will not start without it. |
| `CORS_ALLOWED_ORIGINS` | backend | Comma-separated explicit origins. Required in `prod`. `*` and wildcard patterns are rejected at startup. |
| `MAX_REQUEST_BODY_BYTES` | backend | Optional, default 16384. Larger `/api` bodies get 413. |
| `SPRING_PROFILES_ACTIVE` | backend | `dev` (default) or `prod`. |

Database credentials exist only in the backend environment. The frontend only ever receives `VITE_*` variables, and the Vite config reads other variables for itself only.

## Google API keys

Use two keys (full steps in [`google-cloud-setup.md`](google-cloud-setup.md)).

- **Browser key** (`VITE_GOOGLE_MAPS_API_KEY`): Application restriction = HTTP referrers (your production origin, e.g. `https://app.example.com/*`, plus `http://localhost:5173/*` for development only on a development key). API restriction = Maps JavaScript API and Places API (New). The Routes API is called by the backend, so it must not be enabled on this key.
- **Server key** (`GOOGLE_MAPS_SERVER_API_KEY`): API restriction = Routes API only. Application restriction = IP addresses of the backend host where it has a stable egress IP (referrer restrictions do not work for server calls). Set a daily quota and budget alerts on the project.

These restrictions are configured in Google Cloud Console and cannot be verified from the repository; check them there before release.

## CORS

Only `/api/**` is exposed cross-origin, for the origins in `CORS_ALLOWED_ORIGINS`, with methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers Content-Type and Accept, and no credentials. An empty list allows no cross-origin access. A wildcard is a startup error. In development, list the local frontend origin (e.g. `http://localhost:5173`), or rely on the Vite dev proxy, which makes calls same-origin.

## Errors and logging

- Errors are RFC 9457 Problem Details with fixed, friendly messages. Validation failures are 400, oversized bodies 413, Google/provider failures map to safe categories (for example "Unable to calculate routes. Please try again.").
- Stack traces, SQL, exception class names and connection strings never reach a response (`server.error.*` is locked down and the global handler returns a generic 500).
- Detail goes to server logs only: failure reason, provider failure category, route-calculation and area-detection timings, import statistics. API keys, passwords and Authorization headers are never logged; the Google key is masked in the properties object.
- `prod` logs at WARN for the framework and INFO for `com.routeview`, as structured (ECS) JSON; `dev` adds DEBUG for `com.routeview`.

## Profiles and database

- `prod` requires every connection setting from the environment, disables `show-sql`, and enables no development behaviour.
- Hibernate is `ddl-auto: none` in every profile. The schema changes only through Flyway migrations (V1 onward); `flyway.clean-disabled: true` means no profile can wipe the database. Area import runs only through the explicit `gradlew importAreas` command.
- `backend/docker-compose.yml` binds PostgreSQL to `127.0.0.1` and requires `POSTGRES_PASSWORD`. In production use a managed or private-network database, a dedicated least-privilege user, and TLS (`?sslmode=require` through your deployment's JDBC settings).

## Security headers

Backend (JSON only): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, restrictive `Permissions-Policy`.

Frontend build: `index.html` gets a `referrer` meta of `strict-origin-when-cross-origin` (the browser key is referrer-restricted, so `no-referrer` would break the map) and a CSP meta limited to `object-src 'none'; base-uri 'self'; form-action 'self'`, which cannot affect Google Maps.

Recommended full policy for the static host's response headers. It could not be tested against live Google Maps from the development sandbox, so deploy it first as `Content-Security-Policy-Report-Only`, load a map, search places, calculate a route, and fix any reported violation before enforcing:

```
default-src 'self';
script-src 'self' https://maps.googleapis.com https://maps.gstatic.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com;
connect-src 'self' https://maps.googleapis.com https://places.googleapis.com <your API origin>;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Also send `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff` and `Permissions-Policy: geolocation=(self)` from the static host.

Geolocation (the "Use my current location" buttons) needs two things from the deployment, and the repository contains no frontend hosting configuration, so neither is verified here:

- **A secure origin**: HTTPS in production; `localhost` and `127.0.0.1` for development. Plain HTTP on a LAN or public IP address is not a secure context, and no browser permission can change that. RouteView checks `isSecureContext` before asking and shows "open RouteView over HTTPS, or on localhost" instead of the permission advice.
- **No `geolocation=()` on the HTML document**: the backend's `Permissions-Policy: geolocation=(), camera=(), microphone=()` belongs to API JSON responses only and must not be copied to the static host. Use `geolocation=(self)` there. A page that embeds RouteView in an iframe also needs `allow="geolocation"` on the frame (and RouteView's own policy then has to allow that origin).

## Frontend audit

No `localStorage`/`sessionStorage`, no `dangerouslySetInnerHTML`/`innerHTML`/`eval`, no debug endpoints, no backend credentials. The production bundle contains only the public browser key and no development URLs. The service worker precaches the static shell only; API, Google and area data are never cached.

## Dependencies

`npm audit --omit=dev` reports 0 vulnerabilities for the frontend. Run `npm audit` and your Gradle dependency check (for example the OWASP dependency-check plugin or GitHub Dependabot) regularly; no bulk upgrades were made.

## Checking git history for leaked secrets

History cannot be scanned from the development sandbox. Run locally:

```
git log --all -p -S"AIza" --pretty=oneline | head
git log --all --diff-filter=A --name-only -- "*.env" ".env.*" | sort -u
npx secretlint "**/*"        # or: gitleaks detect --source .
```

If a real key ever appears, rotate it in Google Cloud Console first; rewriting history alone is not enough.

## Release checklist

- [ ] No hardcoded secrets (source, docs, tests)
- [ ] `.env` ignored; `.env.example` has placeholders only
- [ ] Browser key restricted (referrers + Maps JS + Places New); server key restricted (Routes API + IP)
- [ ] `SPRING_PROFILES_ACTIVE=prod`; DB settings and `POSTGRES_PASSWORD` from the environment
- [ ] `CORS_ALLOWED_ORIGINS` lists only the production frontend origin(s)
- [ ] Error responses contain no stack traces or internals; logs contain no secrets
- [ ] Flyway clean disabled, `ddl-auto: none`
- [ ] Frontend bundle contains no server secrets (`grep` `dist/` for the server key)
- [ ] Full CSP verified in Report-Only against the real map, then enforced
- [ ] `gradlew build` and `npm run build` succeed
