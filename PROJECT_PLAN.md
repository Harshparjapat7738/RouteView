# RouteView — Product & Technical Understanding Document

> **Purpose of this document**
> This document explains the product we are going to build: the product vision, functionality, technical direction, constraints and expected behaviour.
>
> **Important:** This document is not an implementation plan. It does not define build phases or implementation steps. Actual development is provided separately through explicit step-by-step prompts.

---

## 1. Product Overview

We are building a **Route Planning Web Application + PWA** using **Google Maps Platform** as the map and routing foundation.

The application provides a route-planning experience similar to Google Maps, with one additional core capability:

> **Show the geographical areas that the user will pass through on each possible route.**

The application is **not** intended to replace Google Maps navigation. It adds a **route discovery and route preference layer** on top of map and routing functionality.

Example — travelling from **Manjhawali Village → Faridabad**, the routing system may provide multiple routes. Instead of only showing:

- Route A — 28 min
- Route B — 31 min

RouteView also shows the geographical journey:

- **Route A:** `Manjhawali → Tigaon → Ballabhgarh → NIT → Faridabad`
- **Route B:** `Manjhawali → Tigaon → Neharpar → Sector 88 → Faridabad`

The user can then search for a required area such as **Neharpar**; the application identifies the route that passes through that area and lets the user select it.

## 2. Core Problem We Are Solving

Traditional route planners answer: *"What is the fastest or shortest route?"*

RouteView answers: *"Which route passes through the area I want to travel through?"*

Useful when a person:

- wants to pass through a particular locality
- wants to travel through a specific village
- wants to pass through a particular sector
- wants to travel through a specific town or city
- knows the area they need to cross but does not know which route contains it

The application focuses on **geographical route awareness**.

## 3. Core Product Flow

```text
Start Location
      ↓
Destination
      ↓
Calculate Routes
      ↓
Multiple Possible Routes
      ↓
Detect Geographical Areas
      ↓
Display Areas Along Each Route
      ↓
User Searches Required Area
      ↓
Find Routes Passing Through That Area
      ↓
User Selects Preferred Route
```

The difference from a normal route planner is the **area discovery layer** between route calculation and route selection.

## 4. User Inputs

**Start Location** — e.g. `Manjhawali Village` or `28.3354, 77.4231`. Resolved into geographic coordinates.

**Destination** — e.g. `Faridabad`. Also resolved into geographic coordinates.

**Optional Current Location** — in the future, "Use my current location" via browser/device geolocation.

## 5. Route Calculation

Google Maps Platform provides map and routing functionality. The routing system should return multiple possible routes where supported. Each route contains:

- route identifier
- distance
- estimated duration
- route geometry/path
- route order/index
- start position
- destination position

Route geometry is particularly important because it is the input of the Area Detection Engine.

## 6. Geographical Area Detection

The core feature. Given a route geometry, determine which meaningful geographical areas the route passes through:

```text
Route Geometry
      ↓
Find geographical areas intersecting the route
      ↓
Filter irrelevant areas
      ↓
Remove duplicates
      ↓
Determine travel order
      ↓
Create Journey View
```

Result example: `Manjhawali → Tigaon → Neharpar → Sector 88 → Faridabad`.

The system must understand the geographical relationship between the route and area boundaries/locations.

## 7. Important Area Rule

The application displays **geographical areas only**. It must **not** treat normal Google Maps places or POIs as journey areas.

**Valid:** village, locality, town, city, sector, suburb, district, recognisable geographical region — e.g. Manjhawali, Tigaon, Neharpar, Sector 88, Ballabhgarh, Faridabad.

**Must NOT be displayed as journey areas:** restaurants, hotels, hospitals, petrol pumps, shopping malls, shops, businesses, tourist attractions, schools, colleges, banks, ATMs, parking locations, individual buildings, generic POIs.

The application answers *"Where geographically am I passing?"*, not *"What businesses or places are nearby?"*

## 8. Journey View

Detected areas are presented in a metro/timeline-style **Journey View**:

```text
● Manjhawali
      │
● Tigaon
      │
● Neharpar
      │
● Sector 88
      │
● Faridabad
```

It communicates: the starting area, areas passed through, the destination area and the approximate order of travel — so the user understands the route geographically without studying the map.

## 9. Multiple Routes

Each route has its own geographical journey. The map displays the routes visually; route cards provide enough information to compare them: distance, duration, route number, geographical areas, selected/unselected state.

## 10. Passing-Area Search

The user searches for an area they want to pass through (e.g. `Neharpar`). The application returns/highlights the route(s) containing that area (e.g. Route B).

## 11. Passing-Area Search Is Not Generic Place Search

The user is not asking *"Find Neharpar on the map."* They are asking *"Which of my calculated routes passes through Neharpar?"*

```text
Calculated Routes
       ↓
Detected Areas
       ↓
Search Area Name
       ↓
Match Against Route Areas
       ↓
Return Matching Routes
```

The routing API must not be called again when the searched area is already present in the calculated route data.

## 12. Future Multi-Area Search

Initially a single required area. Eventually multiple areas (e.g. `Neharpar + Sector 88`), returning routes that satisfy all requirements. This is a future capability, not an initial requirement.

## 13. Map Experience

Uses Google Maps Platform. The map is responsible for: displaying the map, start, destination, route paths and route-related area markers where appropriate; map interaction; highlighting selected routes; relating the Journey View to the map.

The UI should feel familiar but must be our own design — do not copy proprietary Google Maps UI/assets pixel-for-pixel.

## 14. Journey View ↔ Map Interaction

Selecting an area (e.g. Neharpar) in the Journey View highlights it, pans/zooms the map toward it and can emphasise the corresponding route segment. Selecting a route on the map updates the route/journey information.

```text
Map  ↕  Route  ↕  Journey View
```

## 15. Recommended Technical Direction

**Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Zustand where appropriate, Google Maps JavaScript API, PWA support.

**Backend:** Java 21, Spring Boot, REST APIs.

**Database:** PostgreSQL, PostGIS.

**External platform:** Google Maps Platform.

## 16. Why PostgreSQL + PostGIS

Needed spatial operations: route/area intersection, point-in-area, areas close to a route, geographic distances, where an area occurs along a route, spatial indexing.

```text
Google Route Geometry
        ↓
PostGIS Spatial Processing
        ↓
Candidate Geographical Areas
        ↓
Area Filtering
        ↓
Ordered Journey Areas
```

## 17. Backend Architecture Direction

A **modular monolith**, not microservices. Conceptual modules: `route`, `routing`, `area`, `spatial`, `geocoding`, `journey`, `search`, `common`, `configuration`. The package structure may evolve; separation of responsibilities is the principle.

## 18. External Provider Abstraction

Provider-specific functionality is isolated behind application-level interfaces:

```text
RoutingProvider   → GoogleRoutingProvider
GeocodingProvider → GoogleGeocodingProvider
```

Area detection logic must not be coupled to Google-specific response objects.

## 19. Conceptual Data Model

Not final database schemas.

**Area** — id, name, normalizedName, type, geometry, centerPoint, parentArea, country/state/district information.
Types: `VILLAGE`, `LOCALITY`, `SECTOR`, `TOWN`, `CITY`, `SUBURB`, `DISTRICT`, `OTHER`.

**Route Session** — id, start, destination, createdAt, expiresAt. Keeps calculated routes and detected areas together.

**Route** — id, sessionId, providerRouteId, distance, duration, geometry, routeIndex.

**Journey Stop** — id, routeId, areaId, sequenceNumber, distanceFromStart, position. Connects Route → Geographical Area → Journey View.

## 20. Area Detection Engine

```text
Route Geometry → Find Candidate Areas → Evaluate Relevance → Filter Unwanted Areas
→ Deduplicate → Determine Travel Order → Generate Journey Stops
```

It must not blindly return every polygon intersecting a route (tiny administrative boundaries, small jurisdictions, overlapping polygons, irrelevant regions). A **configurable area selection/relevance policy** keeps the Journey View useful to a human.

## 21. Area Ordering

Areas are presented in the order the traveller encounters them, derived from the route geometry — not database or alphabetical order.

## 22. Duplicate Handling

An area may be encountered more than once. Avoid unnecessary duplicates (e.g. not `Tigaon → Neharpar → Tigaon → Neharpar`); present meaningful geographical progression. The re-entry policy stays configurable.

## 23. Route Session Concept

```text
Start + Destination → Route Session → Routes → Detected Areas → Journey View → Passing-Area Search
```

Passing-area search primarily searches the already calculated route session, avoiding unnecessary external routing calls. Sessions may expire; MVP results do not need permanent storage.

## 24. API Concept

```text
GET  /api/geocoding/autocomplete?q=...
GET  /api/geocoding/search?q=...
POST /api/routes
GET  /api/routes/{routeId}
GET  /api/routes/{routeId}/journey
GET  /api/journey/search?routeSessionId=...&q=...
```

Conceptual boundaries; exact contracts are finalised during implementation.

## 25. Frontend Concept — Desktop

```text
┌─────────────────────────────────────────────────────┐
│                  Application Header                 │
├───────────────────┬─────────────────────────────────┤
│ Route Controls    │                                 │
│ From              │                                 │
│ To                │              MAP                │
│ Find Routes       │                                 │
│ Route Cards       │                                 │
│ Journey View      │                                 │
└───────────────────┴─────────────────────────────────┘
```

The map remains the dominant visual element.

## 26. Mobile / PWA Concept

```text
┌─────────────────────┐
│        MAP          │
├─────────────────────┤
│    Bottom Sheet     │
│ From / To           │
│ Routes              │
│ Journey View        │
└─────────────────────┘
```

Works on desktop, laptop, tablet, mobile browser and installed PWA.

## 27. Route Card Concept

```text
Route 1
28.4 km · 42 min
Manjhawali → Tigaon → Ballabhgarh → NIT → Faridabad
[Select Route]
```

Users compare routes on time, distance **and** where the route goes.

## 28. Route Filtering Behaviour

On search (e.g. `Neharpar`), determine which calculated routes contain the area. Matching routes can be highlighted, moved to the top, marked as matching, or optionally used to filter the list. Exact UI behaviour is finalised during implementation.

## 29. Strict Product Scope

Route planning + geographical area visualisation + passing-area search + route selection. Not a general-purpose Google Maps replacement.

## 30. Explicitly Out of Scope (initial product)

Voice navigation, turn-by-turn navigation, traffic prediction, social features, user reviews, business listings, restaurants, hotels, shopping locations, hospitals as POIs, petrol pumps as POIs, generic POI discovery, tourist attractions, payments, advertising, social sharing, user accounts (MVP), offline navigation, AI route recommendations, admin dashboard, microservice architecture.

> **Do not turn the Journey View into a POI/business discovery feature. It is strictly about geographical areas.**

## 31. Future Possibilities

Required areas, avoid areas, preferred areas, route scoring (required/preferred/avoided areas, distance, duration), saved journeys, live navigation, dedicated Android/iOS app on the same backend. Not requirements for the initial product.

## 32. Product Philosophy

1. **Geography first** — the differentiator is understanding areas along a route.
2. **Route choice over route speed** — choose by where the route goes, not only how fast.
3. **Simple user experience** — no GIS knowledge required; complexity stays inside.
4. **Accurate area representation** — no meaningless or excessive names.
5. **Provider separation** — Google is the initial provider; core logic stays independent.
6. **Extensible architecture** — future capabilities without rewriting.

## 33. Definition of the Product

> RouteView is a route-planning web application that uses Google Maps Platform to calculate routes and adds a geographical journey layer that shows the areas a traveller will pass through, allowing users to search for a required passing area and choose a route accordingly.

```text
Where am I starting?
        ↓
Where am I going?
        ↓
What routes are available?
        ↓
Which areas does each route pass through?
        ↓
Does my required area exist on one of those routes?
        ↓
Which route do I want?
```
