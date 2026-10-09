# Google API integration: boundaries, requests and failures

## Boundaries

| Service | Where it runs | Code | Credential |
| --- | --- | --- | --- |
| Maps JavaScript API (map) | browser | `features/map` (`GoogleMapsProvider` is the only loader; `MapView` is reusable) | `VITE_GOOGLE_MAPS_API_KEY` (browser key, referrer-restricted) |
| Places API (New), Start/Destination only | browser | `features/location/services/googlePlacesSearch.ts` behind the provider-independent `LocationSearchService` | same browser key |
| Routes API, route calculation only | **backend** | `routing/google/GoogleRoutesProvider`, reached through `POST /api/routes` | `GOOGLE_MAPS_SERVER_API_KEY` (server only, never sent to the browser) |

Areas, Journey Stops and area search never use Google: they come from the PostGIS area data and the Route Session. No POI, business or generic place search exists.

Shared request code lives in `frontend/src/services/google/`:

- `googleFailure.ts`: sorts any failure into a kind (`network`, `timeout`, `unavailable`, `quota`, `rejected`, `not-configured`, `invalid-request`, `invalid-response`, `unknown`) and owns the user messages (`GoogleApiError.message` is always safe to show).
- `requestPolicy.ts`: `runWithPolicy` gives every attempt a time limit and its own `AbortSignal`, retries only transient failures, and honours cancellation.
- `logGoogleFailure.ts`: the developer log line.

## Request lifecycle

**Autocomplete** (`useLocationSuggestions`): nothing is requested for empty or fewer than 3 characters; typing is debounced (300 ms); each new text cancels the previous request, and an answer that arrives after the user typed more (or selected something) is discarded, so a slow "Far" can never replace the results for "Faridabad". A request is abandoned after 8 s. No automatic retry (typing again or **Try again** is the retry). Typed text is never a location: only choosing a suggestion confirms it (resolving the suggestion gets one automatic retry for a lost connection, 8 s limit).

**Route calculation** (`useRouteSession` + `routeRequestSlot`): one request per pair of locations.
- Repeated **Find Routes** clicks (even several in the same tick) send one request; the button shows "Finding routes..." and is disabled while it runs.
- A newer request cancels the older one. Changing start or destination cancels the pending request and drops the "loading" state, and every result is stored under the key of the locations it was calculated for. A late answer for old locations is ignored, so old routes never appear with a new destination. A new calculation also clears search selections (the session id changes).
- Each attempt is limited to 16 s (the backend gives up on Google after about 13 s). A transient failure (lost connection, temporary outage) is retried **once** after 0.8 s.
- Never retried automatically: quota, permission/key, not configured, invalid input, malformed answers, timeouts.
- Failures show a message and **Try again** (not for invalid input or a missing server key). Nothing reloads the page.

**Map loading**: missing key, failed script, authorization failure and a script that takes more than 15 s each show a message; load failures and slow loads offer **Reload map**. The map is created once.

## Messages

| Situation | Text |
| --- | --- |
| No connection | Unable to connect. Check your internet connection and try again. |
| Service outage | The map service is temporarily unavailable. Please try again. |
| Quota, permission, malformed or unknown | The map service could not complete this request right now. |
| Timeout | The request took too long. Please try again. |
| Location search failure | Unable to search locations. Try entering a different location. |
| Unusable locations (400) | These locations can't be used for a route. Please choose different ones. |

Nothing claims anything about billing.

## Backend

`GoogleRoutesProvider` uses connect (3 s) and read (10 s) timeouts. Every failure becomes a `RoutingException` with a reason (`NOT_CONFIGURED`, `UNAVAILABLE`, `TIMEOUT`, `QUOTA`, `REJECTED`, `INVALID_RESPONSE`); `RouteController` turns it into a generic Problem Details body (`503` unavailable/quota/not configured, `504` timeout, `502` rejected/invalid) with a stable `code` such as `ROUTING_QUOTA` so the client can pick the right message. Google's body, status text and key are never returned; the server log has the reason and HTTP status only.

## Troubleshooting

Developer console lines look like `[google] operation=routeCalculation kind=unavailable status=503 code=ROUTING_UNAVAILABLE attempt=1 requestId=rv-3` (category, status, our own ids; never keys, coordinates or provider text). `kind=not-configured`: set `GOOGLE_MAPS_SERVER_API_KEY` in `backend/.env`. `kind=rejected`: check the key restrictions and that the Routes API is enabled. A map that never loads: check `VITE_GOOGLE_MAPS_API_KEY` and its referrer restriction (see `google-cloud-setup.md`).
