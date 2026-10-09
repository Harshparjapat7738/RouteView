# Travel modes

RouteView calculates routes for six user-facing travel modes. The mode is part of the route request and of the
Route Session; everything downstream (Area Detection, Passing Area Search, Multi-Area Search, Journey View) works on
the routes of the session's mode.

| Mode (RouteView) | Google Routes API `travelMode` | Extra configuration |
| --- | --- | --- |
| Four Wheeler (default) | `DRIVE` | `routingPreference: TRAFFIC_UNAWARE` |
| Two Wheeler | `TWO_WHEELER` | `routingPreference: TRAFFIC_UNAWARE`; beta, limited regions |
| Walking | `WALK` | beta |
| Cycling | `BICYCLE` | beta |
| Train | `TRANSIT` | `transitPreferences.allowedTravelModes = [TRAIN]` |
| Metro | `TRANSIT` | `transitPreferences.allowedTravelModes = [SUBWAY]` |

* The mapping lives in one place, `GoogleTravelModeMapping` (backend, Google adapter). The domain enum
  `TravelMode` knows nothing about Google.
* Train and Metro are public-transit requests with a preference. Google does not guarantee that only that vehicle is
  used, so the card and the step list show exactly what Google returned (line, vehicle type, stops, times,
  transfers, walking parts). Nothing is invented.
* Choosing a mode in the UI only changes search state. The single route calculation (Find Routes) carries the mode.
* Changing the mode drops the routes of the previous mode (the session key contains the mode) together with the
  search matches found in them; the UI asks to press Find Routes again.
* Two Wheeler, Walking and Cycling show "Routes for this travel mode may have limited path coverage." and the
  provider's own warnings.
* A mode the provider cannot serve for a journey (for example Two Wheeler outside supported regions) returns HTTP 422
  with problem code `ROUTING_UNSUPPORTED_MODE`; the UI shows a friendly message, marks the mode unavailable for that
  pair of places and never falls back to another mode. An empty Train/Metro result is shown as
  "No metro route is available for this journey."
* Billing: Two Wheeler and transit requests are billed at higher Routes API tiers; the app sends one request per
  Find Routes press and none for opening the selector or choosing a mode.

For the Metro mode in detail (station data, journey segments, fares, map layer) see [`metro.md`](metro.md).
