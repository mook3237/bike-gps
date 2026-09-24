# Map Place Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select official Kakao category places directly from the current map viewport and support bounds-scoped keyword re-search without changing the existing place detail or endpoint flows.

**Architecture:** Load Kakao `services`, refresh an invisible in-memory place index from all 18 official categories after debounced `idle` events, and resolve genuine map taps by screen-space projection. Add one existing-style “여기서 재검색” control that routes the active keyword and map rectangle through the existing search API and result renderer.

**Tech Stack:** Vanilla JavaScript, Kakao Web Map SDK `services.Places`, Kakao Local REST API, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-kakao-place-bicycle-policy-design.md`

## Global Constraints

- Preserve the current UI, styling, search flow, route cards, navigation flow, and `waypoints[]` structure.
- Do not create a new place-detail UI; successful selection calls existing `openPlace()` or `choosePlace()`.
- Do not add visible bulk markers or pointer-capturing transparent overlays.
- Support only the 18 official Kakao category groups; never guess an unreturned base-map POI.
- Remove the existing 6–16 metre tap-time category lookup.
- Do not run Git commit or push commands; the user owns Git operations.

## Review Focus

- A stale category callback after a second viewport refresh must not replace the newer viewport index; Task 1 tests generation rejection.
- A cached result must not be used for a different bounds/zoom key; Task 1 tests exact-key lookup.
- Two nearly equidistant candidates must produce no selection; Task 2 tests ambiguity rejection.
- Programmatic result-map fitting must not incorrectly expose “여기서 재검색”; Task 3 tests user interaction gating.
- Bounds-scoped keyword search must not change ordinary search ordering or endpoint selection; Task 3 tests both request forms.

---

### Task 1: Viewport category index

**Files:**
- Modify: `tests/map-place-waypoint.test.mjs`
- Modify: `app.js:4-30`

**Interfaces:**
- Consumes: existing `state.map`, Kakao `idle`, `dragstart`, `dragend`, and `kakao.maps.services.Places`.
- Produces: `visiblePlaceKey(map) -> string`, `scheduleVisiblePlaceRefresh()`, `refreshVisiblePlaces() -> Promise`, and `state.visiblePlaces` for Task 2.

- [ ] **Step 1: Replace tap-radius tests with failing viewport lifecycle tests**

Create a Kakao test double whose `event.addListener` records `idle`, `dragstart`, and `dragend`, whose map exposes `getBounds()` and `getLevel()`, and whose `services.Places.categorySearch(code, callback, options)` records all calls. Assert:

```js
assert.equal(categoryCalls.length, 18);
assert.equal(categoryCalls.every(call => call.options.useMapBounds === true), true);
assert.equal(vm.runInContext('state.visiblePlaces.length', context), 2);
```

Run two refresh generations and invoke the older callbacks last; assert that only the newer result IDs remain. Repeat an equivalent bounds/level refresh and assert no extra category calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/map-place-waypoint.test.mjs
```

Expected: failures because `visiblePlaceKey`, `scheduleVisiblePlaceRefresh`, `refreshVisiblePlaces`, and the Kakao services setup do not exist.

- [ ] **Step 3: Implement the viewport place index**

Extend state with:

```js
visiblePlaces: [],
visiblePlaceCache: new Map(),
visiblePlaceKey: '',
visiblePlaceGeneration: 0,
visiblePlaceTimer: null,
placesService: null
```

Load the SDK using `libraries=services`. Define the 18 category codes once. Build a stable key from map level and rounded south-west/north-east coordinates. `scheduleVisiblePlaceRefresh()` clears the prior timer and starts one 300 ms timer. `refreshVisiblePlaces()` searches every category with `{useMapBounds:true,size:15}`, deduplicates by place ID, ignores stale generations, and stores a bounded TTL cache. Treat `ZERO_RESULT` as an empty category and retain no partial generation after `ERROR`.

Register `idle` to schedule refresh and perform one refresh after map initialization. Do not create Kakao Marker or CustomOverlay objects for this index.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: viewport lifecycle tests pass.

### Task 2: Screen-space tap selection

**Files:**
- Modify: `tests/map-place-waypoint.test.mjs`
- Modify: `app.js:10-30`

**Interfaces:**
- Consumes: `state.visiblePlaces`, `state.visiblePlaceKey`, `map.getProjection().pointFromCoords()`, click `event.point`.
- Produces: `closestVisiblePlace(clickPoint, places, projection) -> place|null` and revised `handleMapClick(event) -> place|null`.

- [ ] **Step 1: Write failing hit-test and gesture tests**

Use literal projected points and assert:

```js
assert.equal(closestVisiblePlace({x:100,y:100}, places, projection)?.id, 'nearest');
assert.equal(closestVisiblePlace({x:300,y:300}, places, projection), null);
assert.equal(closestVisiblePlace({x:100,y:100}, ambiguousPlaces, projection), null);
```

Call the real drag-start handler before `handleMapClick()` and assert that `openPlace()` is not reached. For a unique valid hit, assert the returned place and selected place passed to `openPlace()` have the same ID.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/map-place-waypoint.test.mjs
```

Expected: failures because screen-space hit testing is absent and the old implementation still performs tap-time REST lookup.

- [ ] **Step 3: Implement conservative screen-space matching**

Delete `mapPoiClickTolerance`, `closestMapPlace`, and `lookupMapPlaces`. Implement a fixed mobile-friendly hit radius in pixels and a smaller ambiguity delta. Filter invalid place coordinates, project with `pointFromCoords(new kakao.maps.LatLng(...))`, sort by squared distance, reject outside-radius and ambiguous results, then call existing `openPlace()` only from the normal map screen.

Keep existing place-sheet dismissal and navigation-place cancellation branches unchanged. Preserve drag suppression and invalidate any pending viewport generation at drag start.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: hit, empty-space, ambiguity, drag, and `openPlace()` tests pass.

### Task 3: Bounds-scoped “여기서 재검색”

**Files:**
- Modify: `tests/map-place-waypoint.test.mjs`
- Modify: `api/place-search.js:1-25`
- Modify: `app.js:35-60,112-145`
- Modify: `index.html:20-65`
- Modify: `styles.css:1-7`

**Interfaces:**
- Consumes: `state.searchQuery`, `state.map.getBounds()`, existing `doSearch`, `renderResults`, `showMarkers`, and `choosePlace`.
- Produces: optional `rect` query support in `/api/place-search`, `currentMapRect() -> string`, and `searchCurrentMap()`.

- [ ] **Step 1: Write failing API and UI-flow tests**

For the API handler, invoke:

```js
{ method:'GET', query:{ query:'커피숍', rect:'126.9,37.4,127.1,37.6', size:'15' } }
```

Assert the upstream keyword URL contains the exact `rect`. Invoke ordinary search without `rect` and assert it remains absent.

In the app harness, set `state.searchQuery='커피숍'`, provide literal bounds, trigger the search-here handler, and assert the request includes both query and rectangle before existing result rendering runs. Assert user drag/zoom on the results screen reveals the button, while the initial programmatic result fit does not.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/map-place-waypoint.test.mjs
```

Expected: failures because `rect`, `currentMapRect`, `searchCurrentMap`, and `#searchHereBtn` are absent.

- [ ] **Step 3: Add optional rectangle support**

Validate `rect` as four finite WGS84 numbers in west,south,east,north order with west < east and south < north. Forward it only to Kakao keyword search. Delete the obsolete `nearby` branch and its category fan-out while leaving normal keyword ranking and response mapping unchanged.

- [ ] **Step 4: Add the minimal search-here control**

Add one hidden `#searchHereBtn` near the existing map controls with the text `여기서 재검색`. Style it as a small existing-language pill without changing other layout. Reveal it only after user drag or zoom while `state.screen==='results'`; hide it when a search starts, when results render, and outside the results screen.

`searchCurrentMap()` calls the existing search request path with `state.searchQuery` and `currentMapRect()`, then passes results to `renderResults()` so existing visible markers and marker clicks continue to call `openPlace()`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: search-here API, UI state, result-marker click, and endpoint reuse tests pass.

### Task 4: Place regression verification

**Files:**
- Test: `tests/map-place-waypoint.test.mjs`
- Test: `navigation.test.cjs`
- Test: `tests/regression.test.mjs`
- Test: `tests/navigation.test.mjs`
- Test: `tests/full-audit.mjs`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verification evidence only.

- [ ] **Step 1: Run the focused place suite**

```powershell
node --test --test-isolation=none tests/map-place-waypoint.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run existing regression suites**

```powershell
node --test --test-isolation=none navigation.test.cjs tests/navigation.test.mjs tests/regression.test.mjs
node tests/full-audit.mjs
```

Expected: zero failures.

