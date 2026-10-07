# Racing Ghost Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Ghost-compatible route timelines and add a DOM-free engine for saved-ride and constant-speed Racing.

**Architecture:** Enrich the existing permanent route samples instead of retaining raw GPS detail or adding duplicate coordinates. A new pure Racing module derives its clock from shared Ride moving time and performs only along-route geometry and comparisons.

**Tech Stack:** Browser/CommonJS JavaScript, Node test runner, localStorage-backed profile repository.

**Spec:** `docs/superpowers/specs/2026-10-07-racing-ghost-data-foundation-design.md`

## Global Constraints

- No Racing UI, new GPS watcher, motion detector, Ride recorder, or independent timer.
- Canonical units remain meters, m/s, and milliseconds.
- Existing records remain readable and are never fabricated or migrated.
- `reference/` is untouched.

## Review Focus

- Duplicate distance/time samples must never produce NaN or backward target progress.
- A decreasing or malformed observation must not rewind Racing time.
- Old or partially enriched records must be rejected as Ghost targets without mutation.
- Route projection must compare along-route progress, not rider-to-rider distance.
- Manual pause must freeze the race clock even if an inconsistent moving-time input is supplied.

---

### Task 1: Ghost-compatible saved route

**Files:**
- Modify: `ride-foundation.js`
- Modify: `tests/ride-foundation.test.cjs`

**Interfaces:**
- Produces: `GHOST_DATA_VERSION`, enriched `completedRide.route`, versioned `permanentRideRecord()`.

- [ ] Write tests proving monotonic enriched route samples and permanent exclusion of raw `detailedSamples`.
- [ ] Run the focused tests and confirm they fail for missing Ghost fields/version.
- [ ] Enrich route samples at accepted progress and movement transitions; add the version marker to new permanent records.
- [ ] Run `node --test tests/ride-foundation.test.cjs` and confirm it passes.

### Task 2: DOM-free Racing engine

**Files:**
- Create: `racing-foundation.js`
- Create: `tests/racing-foundation.test.cjs`

**Interfaces:**
- Consumes: versioned enriched saved routes and shared Ride `movingTime` observations.
- Produces: `createSavedRideTarget`, `createTargetSpeedTarget`, `createRaceSession`, `updateRace`, `projectOnRoute`, `pointAtRouteDistance`.

- [ ] Write deterministic tests for compatibility, interpolation, both targets, clock freezing, comparisons, duplicate samples, and no GPS/recording ownership.
- [ ] Run the Racing tests and confirm they fail because the module is absent.
- [ ] Implement the minimal pure Racing foundation.
- [ ] Run `node --test tests/racing-foundation.test.cjs` and confirm it passes.

### Task 3: Save/runtime integration and regressions

**Files:**
- Modify: `index.html`
- Modify: `vercel.json`
- Modify: `tests/map-place-waypoint.test.mjs`

**Interfaces:**
- Consumes: the new Racing global and versioned permanent ride record.
- Produces: production-loaded no-store Racing foundation and unchanged shared Save/Discard behavior.

- [ ] Add focused integration assertions that Save persists Ghost-compatible route data while Don't Save does not.
- [ ] Run the integration test and confirm it fails before runtime integration.
- [ ] Load/version the Racing foundation and apply the existing no-store convention.
- [ ] Run Racing, Ride, Navigation, and Riding Board focused regressions plus syntax and `git diff --check`.
- [ ] Inspect the final diff, commit with `Add Racing ghost data foundation`, and push `main`.
