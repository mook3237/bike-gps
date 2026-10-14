# Racing Completion and Save Design

## Goal

When the rider genuinely reaches the final destination, stop the active race at that GPS fix, freeze its result, and ask whether to save it. A manually stopped race follows the same freeze-and-save flow but remains distinguishable as incomplete.

The existing racing GPS, route progress, virtual rider, camera follow, manual camera suppression, rerouting, and speed-based map levels remain unchanged while a race is active.

## Existing Behavior and Root Cause

`advanceRacingCheckpoint()` already combines final-route progress with the existing GPS-accuracy-aware off-route tolerance. It sets `racingReachedDestination` and blocks later rerouting, but it does not end the active race. Consequently, later ride fixes continue changing ride metrics, the virtual rider snapshot, gaps, camera position, and automatic zoom.

`finishRacingSession()` currently combines record creation, runtime teardown, and opening the existing result/save screen. That structure cannot keep a frozen record available across a separate save decision or a retry after a storage failure. The manual menu action also calls it immediately without confirmation.

## State Model

Add a `completion-pending` racing phase and a single frozen pending record.

- `active`: racing GPS updates, virtual rider updates, rerouting, camera follow, and automatic zoom may run.
- `completion-pending`: the racing result is immutable and the save-decision card is open. Racing updates and rerouting cannot run. General map GPS may continue.
- `idle`: no running or pending race.

The transition from `active` to `completion-pending` is idempotent. Repeated GPS fixes, repeated arrival detection, and repeated stop actions return without producing a second record or card.

## Arrival Decision

Reuse the existing final checkpoint and route progress calculation. Arrival is confirmed only when:

1. `currentRouteProgress` reaches the final `checkpointAlong` distance; and
2. `offRouteDistance` is within the existing `max(RACING_CONFIG.OFF_ROUTE_DISTANCE_M, accuracy * 1.5)` tolerance.

No new proximity threshold is introduced. A near-destination GPS fix with insufficient route progress, an invalid fix, or a fix outside the accuracy-aware route corridor does not complete the race. Once confirmed, arrival is latched and cannot be cancelled by later movement.

## Freezing the Result

A shared freeze function receives `completed` and the completion timestamp. It:

1. accepts only the current `active` race;
2. creates the racing record immediately, explicitly setting `completed` to the supplied outcome;
3. stores that record as the only pending frozen result;
4. changes the phase to `completion-pending` before any further asynchronous work can apply;
5. increments `racingRouteRequestSeq` to invalidate in-flight reroutes;
6. clears off-route, target-rider, camera, and racing timers;
7. unsubscribes and discards the live race ride only after the record has been created; and
8. resumes map-movement GPS if the racing screen still needs general location updates.

The frozen record, not live ride state, is used for every later save attempt and result display.

## In-Flight Reroute Protection

Reroute application already compares its captured request sequence with `racingRouteRequestSeq` and checks the active phase. The freeze transition invalidates the sequence before cleanup.

After `fetchRoutes()` resolves, the response guard must verify all of the following before changing the race or map:

- the captured request sequence still matches;
- the phase is still `active`;
- no frozen racing record exists;
- the course still permits rerouting.

The same invalidation applies to destination arrival and manual stop. A delayed response is discarded before `rebaseRaceRoute()`, course replacement, route drawing, snapshot replacement, HUD rendering, or any map operation.

## Save Decision and Result Flow

Destination arrival opens a Ride Mate-styled card containing:

- `레이싱을 완료했습니다!`
- `목적지에 도착했습니다.`
- `기록을 저장하시겠습니까?`
- `저장`
- `저장 안 함`

Manual stop freezes the same record with `completed: false` and then opens the save-decision card. Incomplete records remain visibly incomplete and are excluded from completed-record comparisons and replay opponents.

Saving reuses the existing profile racing repository. A saving flag disables duplicate requests. On success, the record is marked saved before showing the existing racing result presentation, so additional clicks cannot create duplicates. On failure, the flag is released, the frozen record and card remain, an error is shown, and the user may retry.

Choosing `저장 안 함` performs no repository write, clears the pending race, tears down camera and temporary racing state, and returns to the default map.

## Manual Stop Confirmation

The racing menu end action opens a confirmation card:

- `여기서 레이싱을 멈추시겠습니까?`
- `계속 주행`
- `레이싱 중단`

Continuing closes only the card. Stopping calls the same idempotent freeze function with `completed: false`, then shows the save decision. No progress or record state is reset before the user chooses.

## Compatibility

The existing record schema already supports `completed`. No migration or incompatible storage change is needed. Existing records without `completed: false` retain their current completed behavior.

The active-state automatic zoom rules remain:

- 0–30 km/h: level 2
- over 30–60 km/h: level 3
- over 60 km/h: level 4

Because map-level updates require the `active` phase, they stop in `completion-pending`. Manual-map suppression and reroute zoom preservation are unchanged.

## Files

- `app.js`: state transition, result freezing, reroute response guard, save/discard actions, and manual-stop confirmation.
- `index.html`: completion/save and manual-stop cards, plus read-only use of the existing result presentation.
- `styles.css`: only the styling needed to match existing Ride Mate dialogs.
- `tests/map-place-waypoint.test.mjs`: focused arrival, false-positive, freeze, save, manual-stop, delayed-reroute, and zoom regression tests.

The `design/` directory is not read or modified.

## Verification

1. Add failing focused tests for arrival, immutability, false-positive prevention, save behavior, manual stop, and an in-flight reroute resolving after freeze.
2. Implement the minimum production changes needed for those tests.
3. Run the focused racing tests.
4. Re-run the existing automatic zoom, manual camera suppression, and reroute zoom-preservation tests.
5. Run the full Node test suite and compare failures against the recorded baseline of 311 tests, 271 passing, and 40 existing failures.
6. Run `git diff --check`.
7. Commit only relevant files with the requested message, push `main`, and verify the Vercel production HTML and JavaScript contain the new version.
