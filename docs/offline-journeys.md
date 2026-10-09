# Offline Journey Details

Journeys the person explicitly saves can be reopened without a connection. Everything stays in this browser; nothing is sent
anywhere, there is no account and nothing is saved automatically.

## What can work offline

| Journey | Kept on the device | Offline view |
|---|---|---|
| **Bus** (RouteView's own planner over a static GTFS dataset) | Both places (Place ID + short label), the travel mode, the preferences selected at the time, and a compact **itinerary**: route numbers, stop names in riding order, transfers, short walks, the scheduled clock times, and the dataset's **source, version, import date and service-period end** | The station-by-station itinerary, when it was saved, the data source and version, and stale warnings |
| **Metro, Train, Four/Two Wheeler, Walking, Cycling** (Google route content) | Place IDs, short labels, travel mode and preferences. **Nothing of the route.** | The saved intent, and a plain statement that full directions come from Google and need a connection |

Not kept for any journey: coordinates (places are looked up again from their Place ID), polylines or any route geometry,
durations and distances of a Google route, fares, accessibility claims, live data, the device position.

## What needs a connection

* Calculating or refreshing any journey (Google Routes, the Bus engine).
* Looking a place up again from its Place ID (Places), which "Refresh with live data" does.
* The map. Offline the map library cannot load, and no route line is ever drawn from saved data: only a stop sequence is saved,
  not geometry, so the details view says "No map is shown".
* Live buses, delays, fares and service status. The offline view never shows or implies them; every time is labelled as the saved timetable.

## Google Maps Platform restrictions (checked 9 Oct 2026)

* *Routes API policies* page: "While caching of most Routes API content is restricted, storing place IDs is permitted."
* *Maps Platform Service Specific Terms*: A.3 "Google ID Caching" lets Place IDs from the Places and Routes APIs be cached; B.19.3 allows
  latitude/longitude from the Routes API to be cached temporarily (up to 30 consecutive calendar days); there is no permission to
  store routes, polylines, directions, transit details or durations. The general Terms prohibit caching Google Maps content.

What this implementation does with that:

* Google-powered journeys keep **Place IDs only** (no coordinates at all, which is stricter than the 30-day allowance), plus short labels.
  The labels are the names shown at the time (Google Places content), so they expire after **30 days**, the same window as recent
  journeys: afterwards the place is shown as "Saved place" and is still looked up by its Place ID.
* **Metro counts as Google content**: its lines, stations, times and fare come from Google's transit response, so a Metro journey is saved as intent only.
* The service worker never touches Google or API traffic (below).
* There is deliberately no switch that stores Google route content.

This is the maintainers' reading of the published terms, not legal advice; the agreement that applies to the project's Google account is what governs.

## Dataset terms (Bus)

The Delhi Open Transit Data terms (otd.delhi.gov.in/terms) state, clause 22, that material on the portal "may be reproduced free of
charge", must be reproduced accurately and not in a misleading context, and that the source must be prominently acknowledged. Clauses 6-8
require permission for use, forbid modification and use "for any other purpose". The licence for storing the data on a user's device is
therefore not unambiguous. The implementation keeps the stop sequence unmodified, shows the source on every saved itinerary and labels it as a saved
timetable. **`DEFAULT_OFFLINE_POLICY.bus.itinerary`** (`features/offline/utils/offlinePolicy.ts`) switches the itinerary off in one
place: Bus journeys are then saved as intent only (reason `DATA_TERMS`) and the details say why. Confirm the terms with the publisher before relying on it.

## Data and storage

* `localStorage` key `routeview.offlineJourneys`, schema version 1. An unknown version, text that is not JSON or a truncated write is discarded and removed;
  a single unreadable record or itinerary is dropped without losing the rest (a bad itinerary leaves the intent behind).
* Up to **10** journeys and 300,000 characters. The same two places and mode are one saved journey (saving again replaces it).
* A save is written in one step and **read back**; if the browser refuses (quota, blocked storage) or the stored text differs (an interrupted write), the previous
  content is restored and the person is told nothing was saved. The list in the page changes only after a verified write.
* A current-location start is stored as the word "Current location", never coordinates, and the walk from the device to the first stop is left out (the first
  stop itself, a public dataset stop, is kept because the itinerary needs it).
* The preferences snapshot is validated through the existing preferences parser; accessibility is stored only when on.
* Other tabs' changes are picked up (`storage` event). The data is independent of the service worker's caches, so an app update never touches it.

## Controls

* **Journey View** (selected route): *Save for offline* / *Update saved copy* / *Remove*, with a caption saying what will be kept. Disabled with a reason when a place has no Place ID,
  and at the limit.
* **Saved & recent panel**: a *Saved for offline* section: open a journey, remove it, or *Clear saved* (with a confirmation) to delete everything.
* **Details**: places, mode, saved time and age, source, data version, dataset import date, preferences, the steps (with the stop list collapsed per bus), stale warnings,
  *Refresh with live data* (online only: it looks the places up again and recalculates, never replaying saved data) and *Remove from this device*.
* While offline, the offline notice gets a pointer: "N saved journeys are available offline".
* Refreshing does not change the saved copy; *Update saved copy* does. If a recalculated journey uses a different dataset version than the saved copy, the Journey View says so.

## Stale indicators

Shown in the list ("may be out of date") and the details: saved 7 or more days ago; the dataset's own calendar ended; the dataset was imported more than 180 days ago; and
"Not reported" when the backend gave no version. Every transit time is labelled as the saved timetable at all times, fresh or not.

## Service worker and PWA

`vite.config.ts` is unchanged in behaviour: Workbox precaches only the built shell (HTML, JS, CSS, icons, manifest), navigations fall back to the cached shell except `/api/*`,
and there is **no runtime caching**, so no Places, Routes, Maps or `/api` response is ever stored by the service worker. A unit test guards the config (no `runtimeCaching`, no Google hosts, `/api`
in the fallback denylist) and the browser test inspects `sw.js` and the Cache Storage after a full save. Updates keep `registerType: 'prompt'`: a new version installs in the
background and takes over when the app is reopened, so an update never reloads a page in use; saved journeys are in `localStorage` and survive it.

## Tests

* `features/offline/utils/offline.test.ts`: what is kept (and what never is), current-location privacy, Google intent-only, policy switch, round trips, replace/limit/size, label
  expiry, corrupt/foreign/future data, storage failures (quota, blocked, interrupted write with rollback), freshness and dataset comparison, service-worker config guard.
* Browser (production build, real service worker, fake Google Maps and mocked API): save online, open offline, reconnect and refresh, update the copy, newer data notice, stale
  indicators, Google intent-only, remove one / clear all, full / blocked / corrupt storage, cache contents, an app update with saved journeys.

## Limitations

* Offline, the Google Maps library cannot load, so after reconnecting a page reload is needed before places can be looked up (the same as shared links).
* A Bus itinerary is the one that was calculated for the time it was saved: other times, days or places need a live calculation.
* Only Bus has an offline itinerary. A Metro journey cannot be rebuilt offline because RouteView has no offline planner for it.
* Dataset "freshness" is the version string and import time the backend reports; the Bus dataset states no publication date of its own.
* Verified against a faked Google Maps and mocked API responses; the real Places lookup on refresh was not exercised here.
