# Bicycle Policy and Road Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock routing to Kakao Bicycle Routing with `BIKE_ONLY` first and no automobile fallback, capture a no-optimization performance baseline, then report viable external road-validation options for South Korea without implementing them.

**Architecture:** Treat `/api/bicycle-route` as the sole routing boundary and add behavior tests for every request class and failure path. Research authoritative public road data, OpenStreetMap attributes, and map-matching services as a separate report-only deliverable.

**Tech Stack:** Vercel-style JavaScript API handler, Kakao Bicycle Routing REST API, Node.js test runner, official public-data and OpenStreetMap documentation.

**Spec:** `docs/superpowers/specs/2026-09-24-kakao-place-bicycle-policy-design.md`

## Global Constraints

- Use only `https://dapi.kakao.com/v2/routing/bicycle` for current app routing.
- Keep `BIKE_ONLY` first/default.
- Never fall back to automobile routing after any bicycle failure.
- Do not add road-name filtering, inferred classification, or undocumented response parsing.
- Do not implement an external road validator in this change.
- Do not run Git commit or push commands; the user owns Git operations.

## Review Focus

- Partial upstream failures must retain successful bicycle modes without invoking another endpoint; Task 1 tests call URLs and counts.
- A total Bicycle API failure must return the bicycle-specific error without another fetch; Task 1 tests the failure branch.
- Long-distance coordinates must not choose a different endpoint; Task 1 uses Seoul–Busan literals.
- Automatic and manual rerouting must share `fetchRoutes()` rather than a hidden direct URL; Task 2 exercises both call paths.
- Performance timestamps from browser and server clocks must not be directly subtracted; Task 3 exchanges server-relative offsets and combines durations safely.
- External data licences may impose attribution or share-alike obligations; Task 4 reports them explicitly.

---

### Task 1: Server bicycle-only contract

**Files:**
- Modify: `tests/regression.test.mjs`
- Modify only if a test fails: `api/bicycle-route.js`

**Interfaces:**
- Consumes: `/api/bicycle-route` query coordinates and Kakao REST key.
- Produces: bicycle-only routes or a bicycle-specific error; never an automobile request.

- [ ] **Step 1: Write failing-or-characterization tests for every server request class**

Mock upstream fetch and record complete URLs for:

```js
const seoulBusan = { start_x:'126.9780', start_y:'37.5665', end_x:'129.0756', end_y:'35.1796' };
const waypoint = { ...seoulBusan, via_x:'127.1,128.1', via_y:'37.1,36.1', v_name:'경유 1,경유 2' };
```

Assert every URL has pathname `/v2/routing/bicycle`, the first call has `route_mode=BIKE_ONLY`, waypoint values remain ordered, and no URL contains automobile directions paths. On all-mode failure, assert exactly three bicycle requests, status 502, and an error containing `자전거 경로`.

- [ ] **Step 2: Run server-policy tests**

```powershell
node --test --test-isolation=none --test-name-pattern="bicycle|waypoint|long-distance|fallback" tests/regression.test.mjs
```

Expected: existing invariants may pass as characterization tests; any failure identifies the smallest required change in `api/bicycle-route.js`.

- [ ] **Step 3: Make only evidence-driven server changes**

If and only if Step 2 finds a violation, constrain the route definition and upstream URL so all `one()` calls use the bicycle constant and return the existing 502 error when no routes succeed. Do not add another endpoint or road classifier.

- [ ] **Step 4: Re-run server-policy tests**

Run the command from Step 2. Expected: all policy tests pass.

### Task 2: Client rerouting contract

**Files:**
- Modify: `navigation.test.cjs`
- Modify: `tests/navigation.test.mjs`
- Modify only if a test fails: `app.js`

**Interfaces:**
- Consumes: existing `fetchRoutes()`, `recalculateNavigationRoute(reason)`, and `replaceNavigationDestination(destination)`.
- Produces: proof that initial, automatic, manual, and destination-change routing all use the same bicycle proxy.

- [ ] **Step 1: Add client-flow tests**

Stub `fetchRoutes()` at the client boundary and exercise `loadRoutes()`, `recalculateNavigationRoute('off-route')`, `recalculateNavigationRoute('manual')`, and `replaceNavigationDestination()`. Assert each invokes `fetchRoutes()` with the expected origin, destination, and waypoint list and that no production client string references an automobile endpoint.

- [ ] **Step 2: Run client navigation tests**

```powershell
node --test --test-isolation=none navigation.test.cjs tests/navigation.test.mjs
```

Expected: existing shared-boundary behavior passes; any failing path is corrected without changing navigation UI.

- [ ] **Step 3: Apply only required client corrections**

If a tested flow bypasses `fetchRoutes()`, route it through that function with the same state arguments already used by its neighboring flows. Do not alter navigation rendering or route geometry processing.

- [ ] **Step 4: Re-run client navigation tests**

Run the command from Step 2. Expected: zero failures.

### Task 3: Route performance baseline instrumentation

**Files:**
- Modify: `tests/regression.test.mjs`
- Modify: `navigation.test.cjs`
- Modify: `api/bicycle-route.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: existing parallel `Promise.all(defs.map(one))`, `fetchRoutes()`, `prepareRoutes()`, `drawRoutes()`, and `renderRouteCards()`.
- Produces: response `performance` metadata, browser `routePerformance` record, and one `[Route Performance]` console report per route search.

- [ ] **Step 1: Write failing server timing and concurrency tests**

Use three deferred upstream promises. Invoke the API handler and assert all three fetch calls exist before resolving any promise, proving the current requests are parallel. Resolve them individually and assert response metadata has this shape with finite non-negative offsets/durations:

```js
{
  receivedAt: 0,
  modes: {
    BIKE_ONLY: { startMs: 0, endMs: 12, durationMs: 12 },
    SHORTEST: { startMs: 0, endMs: 15, durationMs: 15 },
    ACCESSIBLE: { startMs: 1, endMs: 18, durationMs: 17 }
  },
  responseReadyMs: 18,
  serverTotalMs: 18,
  execution: 'parallel'
}
```

Assert the same metadata is returned with errors when all bicycle modes fail, and assert no request URL changes.

- [ ] **Step 2: Run server timing tests and verify RED**

```powershell
node --test --test-isolation=none --test-name-pattern="performance|parallel" tests/regression.test.mjs
```

Expected: failures because performance metadata does not exist.

- [ ] **Step 3: Add server-relative timing without changing execution**

Capture one monotonic server start before validation completes. Inside the existing `one()` function, record start and completion offsets for its mode around the unchanged Kakao `fetch`. Keep the existing `Promise.all(defs.map(one))` expression. Immediately before each response, finalize `responseReadyMs`, `serverTotalMs`, and `execution:'parallel'`, and include the metadata in both success and total-failure JSON bodies.

- [ ] **Step 4: Run server timing tests and verify GREEN**

Run the command from Step 2. Expected: timing and parallelism tests pass.

- [ ] **Step 5: Write failing browser timeline tests**

Inject a controllable monotonic clock and `requestAnimationFrame`. Exercise one successful `loadRoutes()` and assert the console report contains:

```text
[Route Performance]
BIKE_ONLY Kakao
SHORTEST Kakao
ACCESSIBLE Kakao
API total
Frontend processing
Map rendering
TOTAL
```

Assert the recorded milestones are ordered from route-search start through rendered UI completion. Assert no timing element is added to `index.html`.

- [ ] **Step 6: Run browser timing tests and verify RED**

```powershell
node --test --test-isolation=none navigation.test.cjs
```

Expected: failures because route performance recording and reporting are absent.

- [ ] **Step 7: Add browser timing and console reporting**

At `loadRoutes()` entry create a record with a monotonic `routeSearchStart`. In `fetchRoutes()` record request start and response receipt and retain returned server metadata without altering the returned routes contract. Record processing completion after `prepareRoutes()`. Record map/UI completion after `drawRoutes()` and `renderRouteCards()`, using `requestAnimationFrame` with a timeout fallback for the final console report.

Print one collapsed `[Route Performance]` group with per-mode Kakao durations, API total, frontend processing, map rendering, total, and a milestone table. Store a bounded `window.__rideMateRoutePerformance` history for short/long comparison. Do not display any timing in DOM and do not add caching or change mode concurrency.

- [ ] **Step 8: Run browser timing tests and verify GREEN**

Run the command from Step 6. Expected: route timing tests pass with no navigation UI changes.

### Task 4: External road-validation research

**Files:**
- No product files.
- Final response: research report with direct official-source links.

**Interfaces:**
- Consumes: Kakao-returned WGS84 route geometry.
- Produces: recommendation only; no runtime integration.

- [ ] **Step 1: Research South Korean public road-network sources**

Check authoritative Korean government portals and road/transport data providers for downloadable or API road-link data, link classification, motorway/expressway flags, automobile-only-road flags, bicycle restrictions, update frequency, licence, and commercial-use conditions.

- [ ] **Step 2: Research OpenStreetMap data and map matching**

Verify ODbL obligations and the semantics of `highway=motorway`, `motorroad=yes`, `bicycle=no`, `bicycle=designated`, and access inheritance. Compare self-hosted OSRM/Valhalla/GraphHopper and hosted matching APIs for South Korean coverage, geometry limits, pricing, and returned edge attributes.

- [ ] **Step 3: Produce an eight-part comparison**

For each viable option, report:

1. usable data/API;
2. free or paid status;
3. licence;
4. South Korea data quality;
5. ability to identify bicycle restrictions and motorway/motorroad;
6. how to match Kakao WGS84 geometry;
7. server and performance burden; and
8. files/services that this app would need to add or change.

Recommend a staged path that makes uncertainty explicit and does not claim 100% safety without authoritative coverage.

### Task 5: Final verification

**Files:**
- Test: all existing and modified test files.

**Interfaces:**
- Consumes: completed place plan and Tasks 1–3.
- Produces: final evidence and report.

- [ ] **Step 1: Run the complete regression set**

```powershell
node --test --test-isolation=none navigation.test.cjs tests/map-place-waypoint.test.mjs tests/navigation.test.mjs tests/regression.test.mjs
node tests/full-audit.mjs
```

Expected: zero failures.

- [ ] **Step 2: Check syntax and diff scope**

```powershell
node --check app.js
node --check api/place-search.js
node --check api/bicycle-route.js
git diff --check
git status --short
```

Expected: syntax and diff checks succeed; modified files are limited to the spec, plans, requested product files, and requested tests.
