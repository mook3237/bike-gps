# Racing Completion and Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically freeze a race at confirmed destination arrival, ask whether to save it, support confirmed manual interruption, and prevent every later GPS or reroute response from mutating the frozen result.

**Architecture:** Keep the existing route-progress arrival calculation and introduce one idempotent `active` to `completion-pending` transition that owns record creation, reroute invalidation, and racing-update shutdown. A dedicated save-decision card persists the frozen record at most once, while the existing result presentation is reused after successful storage.

**Tech Stack:** Browser JavaScript, HTML/CSS, Node.js built-in test runner, VM-based DOM test harness, existing RideMate ride/racing/profile modules.

**Spec:** `docs/superpowers/specs/2026-10-14-racing-completion-save-design.md`

## Global Constraints

- Reuse final checkpoint route progress and the existing `max(20m, accuracy * 1.5)` route tolerance; add no arrival threshold.
- Preserve racing automatic zoom levels 2, 3, and 4 at 0–30, over 30–60, and over 60 km/h.
- Preserve the ten-second manual map suppression and reroute zoom level.
- Preserve existing GPS, virtual rider, route, navigation, and record compatibility.
- Do not read or modify `design/`.
- Do not deploy if a failure is new relative to the 311-test baseline with 271 passing and 40 existing failures.
- Stage only the files named in this plan and use the requested single commit message.

## Review Focus

- A valid endpoint projection with insufficient final route progress must remain active; Task 1 adds this test.
- A valid arrival followed by ten GPS fixes must leave the frozen record and virtual-rider snapshot unchanged; Task 1 adds this test.
- A reroute started while active and resolved after arrival or manual stop must not rebase, redraw, alter destination, or change zoom; Task 2 adds both delayed-response tests.
- A storage exception must keep the frozen record and re-enable the save button without creating a record; Task 3 adds this test.
- Repeated arrival fixes and repeated save clicks must show one card and persist one record; Tasks 1 and 3 add these tests.

---

### Task 1: Freeze a Confirmed Arrival

**Files:**
- Modify: `tests/map-place-waypoint.test.mjs`
- Modify: `app.js`

**Interfaces:**
- Consumes: existing `advanceRacingCheckpoint(snapshot, fast)`, `createRacingRecord(now)`, `updateActiveRacing(fast, movement)`, and ride GPS subscription.
- Produces: `freezeRacingSession({completed, now}) -> boolean`, `state.racingFrozenRecord`, and phase `completion-pending`.

- [ ] **Step 1: Write failing arrival and false-positive tests**

Add focused tests asserting confirmed final progress freezes once, endpoint proximity with insufficient progress stays active, invalid/ inaccurate GPS cannot complete, ten later fixes do not change the record or snapshot, and later off-route observations do not reroute.

- [ ] **Step 2: Run the focused tests and confirm they fail for missing completion behavior**

Run: `node --test --test-name-pattern="Racing confirmed arrival|Racing destination false positives" tests/map-place-waypoint.test.mjs`

- [ ] **Step 3: Implement the freeze transition**

In `app.js`, add frozen-record state, allow `createRacingRecord(now, {completed})` to set the explicit outcome, and implement `freezeRacingSession({completed, now})`. Change `advanceRacingCheckpoint()` to return whether arrival was newly confirmed and have `updateActiveRacing()` freeze immediately after the final snapshot is computed.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run the Step 2 command; expect all selected tests to pass.

### Task 2: Invalidate Delayed Reroutes and Protect Active Map Behavior

**Files:**
- Modify: `tests/map-place-waypoint.test.mjs`
- Modify: `app.js`

**Interfaces:**
- Consumes: `freezeRacingSession({completed, now})`, `state.racingRouteRequestSeq`, and existing `recalculateRacingRoute(fast)`.
- Produces: a post-fetch response guard that applies routes only to the same still-active, unfrozen race.

- [ ] **Step 1: Write delayed-response tests**

Create controllable `fetchRoutes()` promises. Start rerouting while active, freeze by arrival in one case and manual interruption in another, resolve the promise, then assert zero rebase/redraw calls and unchanged route, destination, zoom, phase, frozen record, and snapshot.

- [ ] **Step 2: Run the delayed-response tests and confirm the stale response currently mutates state**

Run: `node --test --test-name-pattern="Racing delayed reroute" tests/map-place-waypoint.test.mjs`

- [ ] **Step 3: Harden reroute guards**

Increment `racingRouteRequestSeq` during freeze and require matching sequence, `active` phase, no frozen record, and the same reroutable course after `fetchRoutes()` resolves and again before error handling mutates UI.

- [ ] **Step 4: Run delayed-response and existing zoom/camera tests**

Run: `node --test --test-name-pattern="Racing delayed reroute|Racing reroute redraws|Racing live speed changes map levels|Racing manual map interaction" tests/map-place-waypoint.test.mjs`

### Task 3: Save Decision, Retry Safety, and Manual Stop

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `tests/map-place-waypoint.test.mjs`

**Interfaces:**
- Consumes: `freezeRacingSession({completed, now})`, existing `profileRepository.prependRacing()`, `openRideResult(record, options)`, and `resetRacingRuntime()`.
- Produces: `openRacingSaveDecision(completed)`, `saveFrozenRacingRecord()`, `discardFrozenRacingRecord()`, `requestManualRacingEnd()`, and `cleanupFrozenRacingSession()`.

- [ ] **Step 1: Write failing UI, save, discard, failure/retry, and manual-stop tests**

Assert exact Korean copy and buttons, one visible completion card, one persisted record after repeated clicks, no write on discard, retained record and enabled retry after storage failure, read-only result display after success, continue-riding preservation, and `completed:false` on interruption.

- [ ] **Step 2: Run the new save/manual tests and confirm they fail**

Run: `node --test --test-name-pattern="Racing completion save|Racing manual stop" tests/map-place-waypoint.test.mjs`

- [ ] **Step 3: Add the two dialog cards and minimal matching styles**

Add `#racingSaveDecisionDialog` and `#racingEndConfirmDialog` to `index.html`. Reuse `.dialog`, `.primary-btn`, `.secondary-btn`, and `.danger-btn`; add only action grouping/disabled-state CSS that existing classes do not provide.

- [ ] **Step 4: Implement save/discard/manual actions**

Use a synchronous saving lock around the existing repository call, mark success before showing the result, keep state on exceptions, and make cleanup return to the default map. Reuse the existing result sheet in read-only mode after a successful racing save. Exclude `completed:false` records from racing replay choices.

- [ ] **Step 5: Run the Task 3 tests and all focused racing completion tests**

Run: `node --test --test-name-pattern="Racing confirmed arrival|Racing destination false positives|Racing delayed reroute|Racing completion save|Racing manual stop" tests/map-place-waypoint.test.mjs`

### Task 4: Regression Verification and Deployment

**Files:**
- Verify: `app.js`
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `tests/map-place-waypoint.test.mjs`
- Verify: `docs/superpowers/specs/2026-10-14-racing-completion-save-design.md`
- Verify: `docs/superpowers/plans/2026-10-14-racing-completion-save.md`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified commit, pushed `origin/main`, and production deployment evidence.

- [ ] **Step 1: Run focused racing, FAST GPS, virtual rider, reroute, camera, and zoom tests**

Run the relevant test-name patterns in `tests/map-place-waypoint.test.mjs` plus `tests/racing-foundation.test.cjs` and `tests/ride-foundation.test.cjs`; expect no selected failure.

- [ ] **Step 2: Run the full suite once and compare exact failure names with the 40-test baseline**

Run: `node --test`

Proceed only when every failure belongs to the recorded baseline and no new test fails.

- [ ] **Step 3: Check patch integrity and scope**

Run: `git diff --check`, `git diff --stat`, and `git status --short`. Confirm `design/` remains untracked and untouched.

- [ ] **Step 4: Commit only planned files**

Stage the six planned files explicitly and commit with `feat: complete racing on destination arrival with save prompt`.

- [ ] **Step 5: Push and verify production**

Push `main` to `origin/main`, identify the Vercel production deployment for the commit, and verify the production HTML and JavaScript expose the new dialog IDs/copy and completion logic. Report the production URL as the iPhone test URL.
