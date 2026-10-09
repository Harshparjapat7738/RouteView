# Share Journey

A **Share** button on the selected route card and in the Journey View. It shares the *intent* of a journey (where, which mode),
never a calculated route. The receiver's RouteView looks the places up and calculates everything again.

## What is shared

| Where | Content |
|---|---|
| **Link** | `?rv=1&m=<MODE>&o=<originPlaceId>&d=<destinationPlaceId>` on the app's own address. Nothing else. `o` is left out when the start is the sender's current location. |
| **Text (native share / Copy summary)** | "RouteView journey", `From:` / `To:` place names, `Travel mode:`, a line saying routes, times and fares are calculated again, and the link. |
| **Bus only** | Route numbers in riding order and the number of transfers (`Bus: 216DOWN → 171UP`, `1 transfer`). |

Never shared: coordinates (including the device position), polylines, durations, distances, times, fares, route or step
content, Metro/Train lines, stations or timetable, Journey Stops, preferences, saved places, recent journeys, any identity.

## Current location

If the journey starts at the current location the person is asked first: *Share without my location* (the default, focused
button), *Include route details* or *Cancel*. The link never carries the position or an origin in either case. The summary says
"Current location (position not shared)". Bus route numbers (which depend on where the person is) are included only when the
person chooses *Include route details*.

## How it is shared

1. `navigator.share` when it exists (and `canShare` accepts the payload): title, text and url.
2. Otherwise (or when the native share fails for a reason other than the person closing it) a small inline panel offers
   **Copy link** and **Copy summary**. If the Clipboard API is missing or refuses, the text is shown selected for a manual copy.
3. Feedback is an `aria-live` line under the button: *Shared.*, *Link copied.*, *Summary copied.*, or the error. Closing the share
   sheet is silent.

## Opening a link

`useSharedLink` (in `HomePage`) reads the query once at start-up.

* **Invalid** (unknown version, unknown mode, missing or malformed Place ID, a coordinate where a Place ID belongs, a duplicate or
  empty parameter, an over-long query): an alert says so, nothing is looked up or requested, the share parameters are removed from
  the address. Unrelated parameters are ignored and kept.
* **Offline**: a status says the journey opens once the connection is back. If the Google Maps library could not load while offline, a page reload is needed after reconnecting (the link stays in the address until it has been handled).
* **Maps not configured / not loadable**: an alert says place lookup is not available; nothing is requested.
* **Online**: both places are looked up again by Place ID (Places API, existing request policy), the inputs and mode are restored
  and, when a start was shared, the routes are calculated (the same path as repeating a recent journey). Without a start the
  destination and mode are restored and the notice asks the person to choose a start; nothing is calculated.
* **Lookup failure**: an alert with *Try again* (the safe Google failure message, no detail).
* Once handled, the share parameters are removed with `history.replaceState`, so a reload does not repeat it.
* The notice always says that routes, times and fares are calculated again and can differ from the sender's.

PWA: the service worker's navigation fallback serves the cached shell for any query string, so a link opens the app offline too
(and then waits for a connection to do its lookups).

## Data and policy

* No backend, account or short-link service: the link is the whole message and holds only Place IDs (which the Google Maps
  Platform terms allow to be stored indefinitely) and a mode.
* No Google Routes response, polyline or route content is built into a link or stored. Place **names** appear in the shared
  text only because the person pressed Share (they are labels the person already sees); the link itself has no names.
* Nothing about sharing is persisted by RouteView: no history of shares and no analytics.
* `features/share/utils/shareSummary.ts` holds the data policy. **Metro and Train**: the journey is Google route content, so no
  line, station, time or fare is ever shared and there is no switch for it. **Bus**: RouteView's own planner over a GTFS dataset
  whose licence terms are not documented in this repository; route numbers and transfers are shared, **stop names are not**
  (`stopNames: false`). Switch `DEFAULT_SHARE_POLICY.bus.stopNames` on only after the dataset's licence is confirmed to allow it.

## Tests

* `share/utils/share.test.ts`: link build/parse/invalid cases, summary content and the privacy rules, native-share and clipboard
  outcomes (supported, unsupported, refused, cancelled).
* Browser (fake Google Maps, real app code): button placement, native share payload, copy fallback, clipboard refusal, current
  location choice, valid / start-less / invalid links, offline then online, lookup failure and retry, address cleaning, phone and
  desktop widths.

## Limitations

* Bus stop names and Metro/Train line and station details are not in a shared text (see above); the receiver sees them after the
  recalculation.
* The receiver's recalculated routes can differ from the sender's (time of day, traffic, data updates). The shared route's
  position in the list is not part of the link.
* A link cannot restore a start that was the sender's current location; the receiver chooses their own start.
* The shared text contains place names as Google returned them; a recipient app may store that text.
* Web Share availability varies by browser (most desktop browsers lack it and use the copy panel).
* Verified against a faked Google Maps; real Places lookups of shared IDs were not exercised in this environment.
