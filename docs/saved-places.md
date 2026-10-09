# Saved places and recent journeys

Saved places (Home, Work, custom) and recent journeys are kept in this browser only. There is no account, no
backend call and no analytics for this feature.

## What is stored

Key `routeview.places` in `localStorage`, schema `version: 1`:

- **Saved place**: `id`, `kind` (HOME / WORK / CUSTOM), `label`, `placeId`, `savedAt`. Home and Work always carry the labels "Home" and "Work"; a custom label is the person's own text (up to 40 characters, unique, "Home"/"Work" reserved). At most 20 places.
- **Recent journey**: `id`, `origin` (`{placeId, label}` or the string `CURRENT_LOCATION`), `destination` (`{placeId, label}`), `travelMode`, `searchedAt`. At most 10, newest first, the same journey (same places and mode) moves to the top instead of repeating, and records older than 30 days are removed.

Never stored: coordinates, addresses, routes or route results, the GPS position, search text. A start at the current location is recorded only as `CURRENT_LOCATION`.

## Google Maps Platform content

Only Place IDs (which Google allows to be stored) and short labels are kept. Choosing a saved place or repeating a journey looks the place up again with Place Details (`location`, `displayName`), so coordinates are always fresh and are never reused from storage. The labels of recent journeys are the names that were shown when the journey was searched; they expire after 30 days (the Google caching window) and can be deleted at any time. Saved places show the person's own label, not Google's name. A place without a Place ID cannot be looked up again and is not recorded.

## Behaviour

- Repeating a journey restores start, destination and travel mode and calculates new routes. It needs a connection (the places are looked up again); offline it says so and changes nothing. A `CURRENT_LOCATION` start asks the browser for the position again, as the "Your location" button does.
- A record that can no longer be found (for example a retired Place ID) shows a friendly message; the person can change or remove it.
- Corrupt data (not JSON, wrong shape, other schema version) is discarded and removed; single invalid records are dropped without losing the rest. Blocked or full storage never breaks the app; the panel says the places are not being kept.
- Controls: add, rename, change place, remove (saved); remove one, clear all with confirmation (recent). Another tab's changes are picked up.
- A later schema change should bump `SCHEMA_VERSION` in `utils/placesData.ts` and add a migration; an unknown version is discarded rather than half-read.

## UI

A history button (search bar, directions panel, mobile route panel) opens the "Saved & recent" panel: in the bottom sheet on phones (it grows while a form is open), as the docked panel on wide screens. The initial map screen shows only the button.

Code: `frontend/src/features/places/`.
