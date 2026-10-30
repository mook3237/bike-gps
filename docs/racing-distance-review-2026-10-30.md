# Racing distance correction review

Baseline uploaded: bb5f37c.

## Changes

- `app.js / racingArrivalObservation`: pass credited distance plus the moving recorder's pending `motion.distancePath` into crossing interpolation. Pending distance resets when credited, so it is not added twice. This uses actual recorded travel, not course length.
- `app.js / ingestSharedGpsObservation` (near `raceMovement`): retain distance at each accepted racing sample timestamp as `racingDistance`, without changing the recorder's batched totals.
- `app.js / createRacingRecord`: use these timestamp-aligned distances in the saved Ghost route; remove the internal helper field from exported route points.
- `tests/map-place-waypoint.test.mjs`: add dense 1m fixes at 200ms intervals, accuracy 3m, speed 5m/s. Cross from 99m to 101m. Assert 20s finish, 100m endpoint and total distance, Ghost 95m at 19s and 100m at finish.

## Verification

`node --test --test-name-pattern="Racing arrival audit" tests/map-place-waypoint.test.mjs`

14 passed, including rejected fixes, long gaps, premature finish prevention, turnaround, and round-trip overshoot. No real iPhone ride was performed.

Reviewer: inspect the three app.js locations above and repeat the focused command. Check that pending distance is not double-counted after the recorder credits it and that extra turnaround travel is retained.
