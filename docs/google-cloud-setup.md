# Google Cloud Setup

RouteView uses Google Maps Platform. This document covers what is needed **for the current steps (map display, start/destination location search and route calculation)**. Further services are added to this document only when the step that uses them is implemented.

## Keys: two separate keys, never one

| Key | Used by | Where it lives | Exposed to browser? |
| --- | --- | --- | --- |
| **Browser key** | Maps JavaScript API + Places API (New) in the React app | `frontend/.env.local` → `VITE_GOOGLE_MAPS_API_KEY` | **Yes** (visible in network requests) |
| **Server key** | Backend calls to the Routes API | `backend/.env` → `GOOGLE_MAPS_SERVER_API_KEY` | **Never** |

A browser key can always be read by anyone who opens the page, so its security comes entirely from **restrictions in Google Cloud**, not from secrecy. Never reuse the browser key on the server, and never put a server key in any `VITE_` variable. Use separate keys (and ideally separate Google Cloud projects) for development and production.

## 1. Project and billing

1. Create or select a Google Cloud project.
2. Link a billing account. Maps JavaScript API does not load without one (Google provides a monthly free usage allowance).
3. Under **Billing → Budgets & alerts**, create a budget with alert thresholds.
4. Under **APIs & Services → Quotas**, set a daily request cap for Maps JavaScript API (Map loads) to limit cost if a key is abused.

## 2. Enable only the required APIs

Enable these APIs (the first two for the browser key, the Routes API for the server key):

| API (Cloud Console name) | Used for |
| --- | --- |
| **Maps JavaScript API** | Displaying the map and markers |
| **Places API (New)** | Location search suggestions (Autocomplete) for Start/Destination |
| **Routes API** | Route calculation (`computeRoutes`), called by the backend only |

Enable **Places API (New)**, not the legacy "Places API": the app uses the current Place Autocomplete Data API, and the legacy `Autocomplete`/`AutocompleteService` widgets are not available to new projects.

Do **not** enable Geocoding or any other API yet. Enable them later when their steps are implemented. The Routes API must **not** be on the browser key's allowed list.

## 3. Create and restrict the browser key

**APIs & Services → Credentials → Create credentials → API key**, then **Edit API key**:

**Application restrictions → Websites (HTTP referrers)**

Add only the origins that serve the app:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://your-production-domain.example/*
```

- Use separate keys for development and production so the production key does not allow `localhost`.
- The Vite dev server uses a fixed port (5173, `strictPort`), so the referrer entries stay stable.
- Do not use `*` or a bare domain wildcard such as `*.example.com/*` unless you really serve the app from several subdomains.

**API restrictions → Restrict key → select only:**

- Maps JavaScript API
- Places API (New)

The browser calls `places.googleapis.com` directly for suggestions, so the Places API (New) must be on this key's allowed list.

Never leave the key as "Don't restrict key".

## 3b. Create and restrict the server key (Routes API)

Create a **second** API key (**Create credentials → API key**):

- **API restrictions → Restrict key →** only **Routes API**.
- **Application restrictions → IP addresses:** the backend's outbound IP(s). For local development you may temporarily use your own public IP; never use an unrestricted key.
- **Do not** use HTTP referrer restrictions: server requests have no referrer and Google would reject them.

Put it in `backend/.env` (git-ignored), never in a `VITE_` variable:

```bash
GOOGLE_MAPS_SERVER_API_KEY=your-restricted-server-key
```

Restart the backend after changing it. Without the key `POST /api/routes` answers `503` and the app shows "Route calculation is currently unavailable."

Cost notes: requests use `routingPreference: TRAFFIC_UNAWARE` (cheapest Routes SKU) and a field mask limited to duration, distance, encoded polyline and description. Set a quota/budget alert for the Routes API as well.

## 4. Configure the app

Create `frontend/.env.local` (git-ignored):

```bash
VITE_GOOGLE_MAPS_API_KEY=your-restricted-browser-key
```

Restart `npm run dev` after changing environment files. The key is embedded in the bundle at build time, so production builds must also be created with the production key in the environment.

Optional Map ID. Map markers need one; if unset the app uses Google's `DEMO_MAP_ID`, which Google intends for development. For production create your own under **Google Maps Platform → Map Management** (a Map ID is not a secret and costs nothing):

```bash
VITE_GOOGLE_MAPS_MAP_ID=your-map-id
```

Optional initial map view (defaults to an overview of India, zoom 5; no user location is requested):

```bash
VITE_MAP_DEFAULT_LAT=22.5937
VITE_MAP_DEFAULT_LNG=78.9629
VITE_MAP_DEFAULT_ZOOM=5
```

## How location search uses (and limits) Google requests

- Suggestions are requested only after the user has typed at least 3 characters and paused for 300 ms; results of outdated requests are discarded.
- One Autocomplete session token is used per search field and replaced after each selection, so a search + selection is billed as one session.
- After a selection only the place's `location` is requested; the display name and place ID come from the suggestion itself.
- Only the chosen name, coordinates and place ID are kept in application state, never the raw Google response.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Google Maps API key is not configured." | `VITE_GOOGLE_MAPS_API_KEY` missing or empty; restart the dev server after editing `.env.local` |
| "The map is currently unavailable." | Key rejected: wrong key, API not enabled, billing not linked, or the current origin is not in the HTTP referrer list |
| "Suggestions are unavailable right now." under a search field | Places API (New) not enabled, or not on the key's API restriction list; check the browser console for Google's error |
| "Route calculation is currently unavailable. Please try again later." after Find Routes | Backend not running, `GOOGLE_MAPS_SERVER_API_KEY` missing, Routes API not enabled, or the key's API/IP restriction rejects the backend (backend logs show only a reason such as `REJECTED`/`NOT_CONFIGURED`); a `403` from Google usually means the key restrictions, `429` the quota |
| "The map could not be loaded." | Network problem, or an ad/privacy blocker is blocking `maps.googleapis.com` |

The browser console shows Google's detailed error (e.g. `RefererNotAllowedMapError`) for developers; the page itself deliberately shows only a generic message.
