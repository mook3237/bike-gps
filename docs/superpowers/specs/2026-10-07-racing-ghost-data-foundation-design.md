# Racing Ghost Data Foundation Design

## Goal

Add a screen-independent Racing data engine that replays a compatible saved ride or a constant-speed target while continuing to use RideMate's single shared Ride/GPS pipeline.

## Persistence contract

Newly completed rides persist `ghostDataVersion: 1`. Their existing `route` array remains the sole Ghost coordinate source. Each route sample contains canonical values:

```js
{
  latitude,
  longitude,
  timestamp,
  distance,
  movingTime,
  filteredSpeed,
  moving
}
```

`distance` is cumulative accepted meters and `movingTime` is cumulative accepted moving milliseconds. Both are monotonic. Accepted-progress samples and meaningful moving/stopped transitions may share a distance or moving-time value; interpolation must handle those duplicates without division by zero or backward movement.

The full raw `detailedSamples` array remains temporary and is not permanently retained. Existing saved rides are read without migration. A ride is eligible for saved-ride Racing only when its marker and route samples satisfy the Ghost contract; missing data is never inferred.

## Racing foundation

`racing-foundation.js` is a UMD-style, DOM-free module. It owns route projection/interpolation and Racing comparison only. It creates no GPS watcher, motion detector, Ride recorder, interval, or timeout.

Public API:

- `createSavedRideTarget(savedRide)` validates and normalizes a versioned route timeline.
- `createTargetSpeedTarget(speedMps)` creates a constant-speed target in canonical m/s.
- `createRaceSession({ route, target, currentMovingTime })` establishes the shared-Ride moving-time baseline.
- `updateRace(session, observation)` returns the current comparison snapshot. The observation may provide a route position or an already calculated route-progress distance plus the shared Ride's current `movingTime` and manual-pause state.
- `projectOnRoute(route, position)` and `pointAtRouteDistance(route, distance)` provide reusable along-route geometry.

## Clock and comparisons

Race elapsed time is derived only from the shared Ride's monotonic `movingTime` relative to the session baseline. Stopping and manual pause therefore freeze both target types. A supplied paused observation cannot advance the saved race clock even if its input moving time is malformed.

For both target types:

```text
distanceDifference = currentRouteProgress - targetRouteProgress
```

Positive means the current rider is ahead; negative means behind.

For `SAVED_RIDE`, target progress is interpolated by historical moving time. Historical time at the current progress is interpolated by cumulative route distance:

```text
timeDifference = historicalTimeAtCurrentProgress - currentRaceMovingTime
```

For `TARGET_SPEED`:

```text
targetProgress = speedMps * currentRaceMovingTime / 1000
targetTimeAtCurrentProgress = currentRouteProgress / speedMps * 1000
```

All progress is clamped to the race route and target positions come from along-route interpolation. Straight-line distance between riders is never used.

## Compatibility and integration

Ride saving continues through the existing profile ride list and Save/Don't Save lifecycle. Discarded rides never reach persistence. Existing Navigation and Riding Board recording continue using the same `RideMateRide` session and shared GPS source. Racing is loaded as a separate runtime foundation for later UI consumption, with the existing no-store deployment policy.

## Verification

Focused deterministic tests cover route persistence, old-record rejection without mutation, duplicate-safe interpolation, both target types, stop/resume/pause clock behavior, along-route comparison, historical time difference, and the absence of geolocation/recording ownership in the Racing module. Existing Ride, Navigation, and Riding Board regressions remain the integration guard.
