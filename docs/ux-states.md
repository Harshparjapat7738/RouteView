# UX states and copy

Terms used consistently in the interface: **Start** and **Destination** (the From/To fields), **Route**, **Passing area** (a geographical area a route passes through), **Journey Stop**, **Journey View**, **Selected** route, **Fastest**, **Shortest**, **Matches**. RouteView shows no live traffic, navigation, real-time ETA or places other than geographical areas.

| Situation | What the user sees |
| --- | --- |
| Nothing selected yet | "Select a start and destination to compare routes." No cards, no sample data |
| Start / Destination missing (after pressing Find Routes) | "Please select a start location from the suggestions." / "Please select a destination from the suggestions." Typed text alone is never a selection (only a chosen suggestion shows the selected style) |
| Same location | "Start and destination must be different." |
| Calculating | Button "Finding routes..." (disabled, `aria-disabled`), status line, the hint that the areas of each route are detected in the same step, and two placeholder cards that only reserve space. No percentages, no step is shown as finished. Old routes are not shown |
| Routes ready | Cards with Route number, duration, distance, area count and the factual badges (Selected with text, Fastest, Shortest, Matches / partial) |
| No route | "No route found between these locations." |
| Route without areas | "No geographical areas were detected for this route." |
| Search (typed) | Scope hint "Searches only the areas along your calculated routes."; no hit: "No passing area found in your calculated routes." No Google call is made |
| Several chosen areas | Removable chips, summary "N of M routes match …"; only routes through all chosen areas are full matches, others are labelled as partial |
| Failure | A short, human message without internals; "Try again" where repeating can help; the app stays usable (change locations, retry). See [`google-api-reliability.md`](google-api-reliability.md) |
| Journey View unavailable | "No journey to show yet. Find routes first, then open the Journey View." |

**Focus.** Opening the Journey View moves focus to its "← Compare Routes" button; closing it returns focus to the "Open Journey View" button. Route cards, stops, chips and suggestions are real buttons and reachable by keyboard; the selected route is announced through `aria-pressed` and the "Selected" label, never colour alone.

**Notifications.** There are no toasts: results of selecting, searching or switching are visible in the interface itself, and errors stay on screen until resolved.

**Layout.** The page never scrolls horizontally from 320 px up; the map keeps its size while routes load (placeholder cards reserve the list space).

## Current location button

A round button at the bottom-right of the map ("Use my current location"). The browser's permission prompt appears only when it is pressed; nothing is requested on page load. One `navigator.geolocation.getCurrentPosition` call per press (never `watchPosition`), ignored while a request is running. On success a single blue-dot marker is moved to the position and the map is centred on it (zoom 15, wider for a coarse fix); pressing again refreshes it. It does not touch Start/Destination, routes, the session, the selected route or the Journey View, and the position is kept in memory only (no storage, URL, cache or request). Failures (blocked, unavailable, timed out, unsupported) show a short dismissible message next to the button. Code: `features/location/{services/currentPosition.ts,hooks/useCurrentLocation.ts}` and `features/map/components/{MapLocateControl,MapCurrentLocationMarker}.tsx`. Geolocation needs HTTPS (or localhost); the static host must not block it with `Permissions-Policy: geolocation=()` (see `docs/security.md`).
