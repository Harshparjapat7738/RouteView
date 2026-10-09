# Personal travel preferences

Preferences change how the routes of the current Route Session are **ordered** (ranking) and which are **shown** (filtering). They never call the routing API: changing or opening them only re-derives the list from the session, and turning a preference off brings every route back.

## Ranking ("Rank routes by")

Four switches: fastest journey, lowest fare, fewer transfers, less walking. Ranking only changes the order and never removes a route.

- Each selected preference ranks the routes (ties share a rank); a route's score is the sum of its ranks and the lowest score comes first. Provider order breaks ties and is the order when nothing is selected. With several preferences on, routes are therefore ordered by how well they do on all of them (no hidden weights).
- A preference is applied only when **every** shown route has the data, from the engines only: duration, Metro fare (one currency), transfers and walking distance (Metro, Bus, Google transit). Nothing is estimated.
- Otherwise it is skipped and reported ("Lowest fare could not be applied. Bus fares are not available…"). Single-leg modes (Two Wheeler, Four Wheeler, Walking, Cycling) have no transfers or walking-to-stops, so those preferences say they do not apply.
- "Lowest fare" is never claimed when fares are missing or in different currencies. The existing badges (Fastest, Lowest fare, …) are unchanged.
- The route with the best rank is selected until the person picks a route; their pick then stays selected while it is visible. The list, the Journey View and the map read the same view, so they always agree.

## Avoiding modes (filtering)

Any of the seven supported travel modes can be avoided. A route is removed when the engines report that it uses an avoided mode:

- the mode it was searched with (so avoiding Bus removes every Bus journey);
- a Train or Metro journey's transit leg whose vehicle is identified (BUS, SUBWAY/METRO, rail types).

Limits, stated in the UI: walking to or from a stop is part of every transit journey and is not the Walking mode (use "Less walking"); a leg whose vehicle cannot be identified never removes a route and is reported instead; trams, ferries and similar are not RouteView modes and are not filtered. If every route is removed, or the searched mode is avoided, the app says so ("You are avoiding Bus, so no Bus journeys are shown") and offers "Change preferences". Pressing Find Routes for an avoided mode requests nothing and records no recent journey.

## Storage

`localStorage` key `routeview.preferences`, `{ version: 1, prefer: {fastest, lowestFare, fewerTransfers, lessWalking}, avoid: [modes] }`. No account, no network, no analytics. Defaults store nothing (the key is removed). Unreadable or other-version data is discarded; unknown modes and non-boolean values are dropped; blocked or full storage never breaks the app (the panel says the preferences are not being kept). "Reset preferences" restores the defaults.

## UI

A one-line "Preferences" row under the travel-mode selector in the route setup (not on the bare map) opens a compact panel in the bottom sheet (phone) or docked panel (wide). The panel keeps ranking and avoiding in separate sections and shows what they did to the current routes. The list shows how it was ordered, what was hidden and what could not be applied.

Code: `frontend/src/features/preferences/`.

## Accessibility

Two optional accessibility switches (step-free stations, avoid inaccessible stations) live in the same panel and storage; see [accessibility-routing.md](accessibility-routing.md).
