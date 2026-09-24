# Kakao Map Place Selection and Bicycle Safety Policy Design

## Goal

Improve map-based place selection using only Kakao's officially searchable place categories, while preserving the existing place detail and endpoint-selection flows. Lock all initial, waypoint, rerouting, and long-distance route requests to Kakao's Bicycle Routing API with `BIKE_ONLY` as the default and no automobile-routing fallback.

## Scope and constraints

- Preserve the current UI, styling, search flow, route cards, navigation flow, and `waypoints[]` structure.
- Do not create a new place-detail UI. Every successful map or search-result selection must enter the existing `openPlace()` flow.
- Do not add visible bulk POI markers to the map.
- Do not infer road legality from road names or undocumented response fields.
- Do not implement the external road-validation system in this change.
- Keep `/v2/routing/bicycle` as the only upstream routing endpoint and keep `BIKE_ONLY` as the first/default route mode.

## Current behavior and root causes

The current map-click implementation performs 18 category searches in a 6–16 metre radius after each tap. This does not model the set of places currently displayed in the viewport and often misses a visible label because Kakao's base-map label position and Local API place coordinate are not the same concept.

The existing route proxy already calls only `https://dapi.kakao.com/v2/routing/bicycle`. Initial route loading, waypoint routes, automatic rerouting, manual rerouting, and navigation destination replacement all pass through the same `fetchRoutes()` and `/api/bicycle-route` boundary. There is no automobile endpoint or fallback.

## Official Kakao support boundary

Kakao Web Map's map click event exposes geographic and screen coordinates but not the identity of a base-map POI. Kakao Places category search can search the current map bounds and returns place IDs, names, categories, addresses, and coordinates for the 18 official category groups.

The official APIs do not expose every base-map building label or uncategorized business through a bounds-only query. This implementation therefore supports only places returned by the 18 official category searches. Missing places remain unselectable rather than being guessed.

Kakao Bicycle Routing supports `BIKE_ONLY`, `SHORTEST`, and `ACCESSIBLE`, but its documented response has no road-class, motorway, motorroad, or bicycle-access field and no request option that explicitly excludes those road classes. The app cannot truthfully certify 100% exclusion from the Kakao response alone.

## Place data lifecycle

Load the Kakao Web SDK with the `services` library and create one `kakao.maps.services.Places` instance bound to the existing map.

Register an `idle` listener on the existing map. After a short debounce, search all 18 official category groups with the current map bounds. The implementation will:

- retain no visible marker or label for these background results;
- deduplicate results by Kakao place ID;
- ignore callbacks from an older refresh generation;
- cache completed result sets by a normalized bounds-and-zoom key with a bounded lifetime and entry count;
- avoid background category loading at map levels where a single-page category result cannot safely represent visible POIs; and
- preserve the last valid cache while a refresh is in flight, but never use it outside the bounds and zoom for which it was produced.

If a category returns more results than the supported page represents, the app may omit those additional places. It must not broaden the hit radius or guess a replacement.

## Map tap matching

Do not add transparent DOM overlays or invisible markers because they can intercept touch gestures and make overlapping hits dependent on overlay stacking.

On a genuine map click:

1. Use the click event's screen `point`.
2. Convert every cached place coordinate to a screen point using the existing map projection.
3. Keep only candidates inside a conservative fixed pixel hit radius.
4. Sort by squared screen distance.
5. Reject the tap if there is no candidate or if the two nearest candidates are too close to distinguish safely.
6. Pass the unique nearest place to the existing `openPlace()` function.

`dragstart` invalidates tap eligibility and pending place work. `dragend` retains a brief suppression window so a completed drag is not interpreted as a place tap. The implementation uses Kakao map events rather than pointer-capturing overlays so iPhone/PWA pan and pinch behavior remains intact.

Existing search-result markers remain visible and clickable. Their click handler continues to call `openPlace()`.

## Search and “search here”

The current interface has no “여기서 재검색” action. Add one small map-overlay button using the existing visual language. It is available on the results screen after the user pans or zooms the map, and it does not replace or restructure the existing header, sheet, or result list. The action uses the current search query together with the current map bounds, sends the bounds through the existing place-search API, and renders results through the existing `renderResults()` and marker flow.

The server keyword-search endpoint accepts an optional rectangle for this flow. Normal keyword search without a rectangle retains its current behavior and current-location ordering. Stale requests are aborted or ignored using the existing search sequence/controller mechanism.

## Endpoint selection reuse

Map category hits and search-result hits both use the existing place object shape and existing functions:

- `openPlace()` for normal map browsing;
- existing place detail buttons for departure and destination;
- `choosePlace()` when an endpoint or waypoint search is active;
- existing `waypoints[]` insertion and route reload behavior.

No new detail sheet, route card, or endpoint-selection component is introduced.

## Bicycle routing safety invariant

The route proxy must accept only its current coordinate inputs and must construct every upstream request using `/v2/routing/bicycle`. `BIKE_ONLY` remains first in the route-mode definitions so it remains the default selected route.

No error path may call an automobile directions endpoint. If the Bicycle API returns no usable route, including a long-distance failure, the proxy returns a bicycle-route failure and the existing route error UI reports that no bicycle route can be found.

No road-name filtering, inferred road classification, or undocumented field parsing is added.

## Route performance baseline

Add development-console-only timing instrumentation without changing request ordering, concurrency, caching, routing modes, or route processing. Each route search records the browser-relative milestones for route-search entry, `/api/bicycle-route` fetch start, response receipt, route preparation completion, and rendered route UI completion. The API response carries server-relative timing metadata for request receipt, each Kakao mode start and completion, and response-ready time so browser and server clocks do not need to be assumed synchronized.

After route lines and cards are created, schedule the final report after the next paint opportunity and print one `[Route Performance]` console group containing per-mode Kakao durations, API total, frontend processing, map rendering, total duration, and a milestone table. Retain a small development-only in-memory history so short Seoul routes and long Seoul–Busan attempts can be compared without exposing timings in user UI.

The current server starts `BIKE_ONLY`, `SHORTEST`, and `ACCESSIBLE` through one `Promise.all(defs.map(one))`; instrumentation must preserve and test that parallel behavior.

## Testing

### Place tests

- `idle` after a map move refreshes places for the new bounds.
- `idle` after a zoom change refreshes places for the new bounds and level.
- Repeated equivalent bounds use cache and debounce behavior.
- Older asynchronous category callbacks cannot overwrite the newest viewport results.
- A category place tap selects the unique nearest screen-space candidate.
- An ambiguous overlap and an empty-space tap select nothing.
- Drag is never treated as a tap.
- A successful tap invokes the existing `openPlace()` flow.
- Existing result-marker clicks invoke the same flow.
- “여기서 재검색” sends the active query and current bounds, then uses existing result rendering.
- Existing departure, destination, and waypoint selection behavior remains intact.

### Route tests

- Every upstream URL uses `/v2/routing/bicycle`.
- `BIKE_ONLY` remains first/default.
- Ordinary and waypoint requests preserve their coordinates.
- Automatic and manual rerouting use `fetchRoutes()` and the bicycle proxy.
- Long-distance requests do not switch endpoints.
- Bicycle failures return an error and never trigger an automobile fallback.
- All three Kakao mode requests are started before any one is allowed to resolve, proving the existing parallel behavior.
- Server timing metadata contains receive, per-mode start/completion, and response-ready offsets.
- Browser timing covers request start, response receipt, processing completion, rendered UI completion, and one console summary without adding UI.

Run the existing regression suite after the focused tests.

## External road-validation research deliverable

The final report will compare South Korea-capable public road-network data, transport/road public data, OpenStreetMap attributes, and geometry map-matching services. For each option it will report availability, cost, licence, Korean road quality, support for `bicycle=no`, `motorroad`, `motorway`, matching method, server/performance cost, and integration scope. No external road validator is implemented in this change.

## Expected product files

- Modify `app.js` for SDK services loading, viewport place refresh/cache, screen-space hit testing, drag/tap separation, and “여기서 재검색”.
- Modify `api/place-search.js` to remove the tap-radius category mode and add optional bounds to keyword search.
- Modify `index.html` and `styles.css` only to add the small “여기서 재검색” overlay control that is absent from the current UI.
- Update `tests/map-place-waypoint.test.mjs` for place behavior.
- Update `tests/regression.test.mjs` and/or `tests/navigation.test.mjs` for routing invariants.
- Modify `api/bicycle-route.js` only to add timing metadata or correct a test-proven bicycle-only violation; do not otherwise change routing behavior.
