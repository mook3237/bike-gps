(function exposeRideFoundation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateRide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRideFoundationApi() {
  const GPS_JUMP_MAX_M = 200;
  const GHOST_DATA_VERSION = 1;
  const FAST_FRESH_MAX_AGE_MS = 3000;
  const FAST_MAX_PLAUSIBLE_SPEED_MPS = 60;
  const FAST_MAX_ACCURACY_M = 50;
  const MOTION_WINDOW_MS = 6000;
  let gpsDiagnosticsEnabled = false;
  let gpsDiagnosticsLogger = null;

  function setGpsDiagnosticsEnabled(enabled, logger = null) {
    gpsDiagnosticsEnabled = enabled === true;
    gpsDiagnosticsLogger = typeof logger === 'function' ? logger : null;
  }

  function gpsDiagnostic(stage, values) {
    if (!gpsDiagnosticsEnabled) return;
    (gpsDiagnosticsLogger || console.debug)?.('[RideMate GPS]', stage, values);
  }

  function haversineDistance(a, b) {
    if (!a || !b) return 0;
    const radius = 6371000;
    const radians = Math.PI / 180;
    const latitude = (b.latitude - a.latitude) * radians;
    const longitude = (b.longitude - a.longitude) * radians;
    const value = Math.sin(latitude / 2) ** 2
      + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitude / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(value));
  }

  function resolveSpeed(fix, distance, elapsedMs) {
    if (Number.isFinite(fix?.speed) && fix.speed >= 0) return fix.speed;
    return elapsedMs > 0 && distance >= 0 ? distance / (elapsedMs / 1000) : 0;
  }

  function smoothHeading(previous, candidate, moving = true) {
    if (!moving || !Number.isFinite(candidate)) return Number.isFinite(previous) ? previous : null;
    const target = ((candidate % 360) + 360) % 360;
    if (!Number.isFinite(previous)) return target;
    const current = ((previous % 360) + 360) % 360;
    const delta = ((target - current + 540) % 360) - 180;
    return previous + delta * .65;
  }

  function createFastObservationState() {
    return {
      sequence: 0,
      lastPosition: null,
      lastTimestamp: null,
      lastAccuracy: null,
      lastHeading: null,
      lastDisplaySpeed: null,
      lastDisplayTimestamp: null,
    };
  }

  function fastBearing(a, b) {
    const radians = Math.PI / 180;
    const latitude1 = a.latitude * radians;
    const latitude2 = b.latitude * radians;
    const longitude = (b.longitude - a.longitude) * radians;
    const y = Math.sin(longitude) * Math.cos(latitude2);
    const x = Math.cos(latitude1) * Math.sin(latitude2)
      - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude);
    return (Math.atan2(y, x) / radians + 360) % 360;
  }

  function processFastObservation(state, fix, receivedAt = Date.now()) {
    const timestamp = Number.isFinite(fix?.timestamp) ? fix.timestamp : receivedAt;
    const position = {
      latitude: fix?.latitude,
      longitude: fix?.longitude,
      accuracy: Number.isFinite(fix?.accuracy) && fix.accuracy > 0 ? fix.accuracy : 0,
    };
    const ageMs = Math.max(0, receivedAt - timestamp);
    const fresh = ageMs <= FAST_FRESH_MAX_AGE_MS;
    const monotonic = state.lastTimestamp == null || timestamp > state.lastTimestamp;
    const elapsedMs = state.lastTimestamp == null ? 0 : timestamp - state.lastTimestamp;
    const distance = state.lastPosition ? haversineDistance(state.lastPosition, position) : 0;
    const uncertainty = Math.max(10, position.accuracy || 0, state.lastAccuracy || 0);
    const plausibleDistance = state.lastPosition == null
      || elapsedMs > 0 && distance <= FAST_MAX_PLAUSIBLE_SPEED_MPS * (elapsedMs / 1000) + uncertainty * 2
      || elapsedMs === 0 && distance <= uncertainty;
    const plausiblePosition = monotonic && plausibleDistance;

    const rawSpeedMps = Number.isFinite(fix?.speed) && fix.speed >= 0 ? fix.speed : null;
    const derivedSpeedMps = state.lastPosition && elapsedMs > 0 ? distance / (elapsedMs / 1000) : null;
    const derivedReliable = Number.isFinite(derivedSpeedMps)
      && derivedSpeedMps <= FAST_MAX_PLAUSIBLE_SPEED_MPS
      && distance >= Math.max(2, position.accuracy * .75);
    let speedMps = 0;
    let speedSource = 'unavailable';
    let speedValid = false;
    let speedReason = !fresh ? 'stale' : !monotonic ? 'non-monotonic' : !plausiblePosition ? 'implausible-position' : position.accuracy > FAST_MAX_ACCURACY_M ? 'low-accuracy' : 'unavailable';
    if (fresh && monotonic && plausiblePosition && position.accuracy <= FAST_MAX_ACCURACY_M) {
      if (derivedReliable && (rawSpeedMps == null || rawSpeedMps < .5 && derivedSpeedMps >= .8)) {
        speedMps = derivedSpeedMps;
        speedSource = 'position-derived';
        speedValid = true;
        speedReason = 'accepted-derived';
      } else if (rawSpeedMps != null && rawSpeedMps <= FAST_MAX_PLAUSIBLE_SPEED_MPS) {
        speedMps = rawSpeedMps;
        speedSource = 'gps';
        speedValid = true;
        speedReason = 'accepted-gps';
      }
      if (speedValid && Number.isFinite(state.lastDisplaySpeed) && state.lastDisplayTimestamp != null && elapsedMs > 0) {
        const allowedDelta = 2 + elapsedMs / 1000 * 4;
        if (speedMps - state.lastDisplaySpeed > allowedDelta && !derivedReliable) {
          speedMps = state.lastDisplaySpeed;
          speedSource = 'retained';
          speedReason = 'implausible-acceleration';
        }
      }
    }

    let headingDegrees = null;
    let headingSource = 'unavailable';
    if (Number.isFinite(fix?.heading) && fix.heading >= 0 && fix.heading < 360) {
      headingDegrees = fix.heading;
      headingSource = 'gps';
    } else if (state.lastPosition && plausiblePosition && distance > 2) {
      headingDegrees = fastBearing(state.lastPosition, position);
      headingSource = 'position-derived';
    } else if (Number.isFinite(state.lastHeading)) {
      headingDegrees = state.lastHeading;
      headingSource = 'retained';
    }

    state.sequence += 1;
    const observation = {
      sequence: state.sequence,
      timestamp,
      receivedAt,
      ageMs,
      position,
      speed: { mps: Math.max(0, speedMps), source: speedSource, valid: speedValid, reason: speedReason, rawMps: rawSpeedMps, derivedMps: derivedSpeedMps },
      heading: { degrees: headingDegrees, source: headingSource },
      quality: { fresh, monotonic, plausiblePosition },
    };
    if (fresh && plausiblePosition) {
      state.lastPosition = { latitude: position.latitude, longitude: position.longitude };
      state.lastTimestamp = timestamp;
      state.lastAccuracy = position.accuracy;
      if (Number.isFinite(headingDegrees)) state.lastHeading = headingDegrees;
      if (speedValid) {
        state.lastDisplaySpeed = Math.max(0, speedMps);
        state.lastDisplayTimestamp = timestamp;
      }
    }
    gpsDiagnostic('fast', { timestamp, receivedAt, ageMs, accuracy: position.accuracy, rawSpeed: rawSpeedMps, derivedSpeed: derivedSpeedMps, displaySpeed: speedValid ? speedMps : null, reason: speedReason, accepted: fresh && monotonic && plausiblePosition });
    return observation;
  }

  function createMotionState() {
    return {
      lastPosition: null,
      lastTimestamp: null,
      speedWindow: [],
      speedSamples: [],
      moving: false,
      filteredSpeed: 0,
      distanceAnchor: null,
      distancePath: 0,
      movingTimeApprovedThrough: null,
      timeInterrupted: false,
      stationaryCandidateSince: null,
      stationaryCandidatePosition: null,
      stationaryCandidateUncertainty: null,
    };
  }

  function resetMotionState(motion, resetPosition = true) {
    motion.speedWindow = [];
    motion.speedSamples = [];
    motion.moving = false;
    motion.filteredSpeed = 0;
    motion.distanceAnchor = null;
    motion.distancePath = 0;
    motion.movingTimeApprovedThrough = null;
    motion.timeInterrupted = false;
    motion.stationaryCandidateSince = null;
    motion.stationaryCandidatePosition = null;
    motion.stationaryCandidateUncertainty = null;
    if (resetPosition) {
      motion.lastPosition = null;
      motion.lastTimestamp = null;
    }
  }

  function movementWindowEvidence(samples) {
    if (!samples || samples.length < 3) return { moving: false, duration: 0, netDistance: 0, pathDistance: 0, efficiency: 0, directionConsistency: 0, uncertainty: Infinity };
    const first = samples[0];
    const last = samples.at(-1);
    const duration = Math.max(0, last.timestamp - first.timestamp);
    let pathDistance = 0;
    let vectorX = 0;
    let vectorY = 0;
    let directionCount = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const a = samples[index - 1].position;
      const b = samples[index].position;
      const segment = haversineDistance(a, b);
      pathDistance += segment;
      if (segment > 0.2) {
        const meanLatitude = (a.latitude + b.latitude) * Math.PI / 360;
        const x = (b.longitude - a.longitude) * Math.cos(meanLatitude);
        const y = b.latitude - a.latitude;
        const length = Math.hypot(x, y);
        if (length) {
          vectorX += x / length;
          vectorY += y / length;
          directionCount += 1;
        }
      }
    }
    const netDistance = haversineDistance(first.position, last.position);
    const efficiency = pathDistance ? netDistance / pathDistance : 0;
    const directionConsistency = directionCount ? Math.hypot(vectorX, vectorY) / directionCount : 0;
    const accuracies = samples.map(sample => sample.accuracy).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    const uncertainty = Math.max(3, accuracies.length ? accuracies[Math.floor(accuracies.length / 2)] : 5);
    const sustained = duration >= 5000 && netDistance > uncertainty;
    const strong = duration >= 2000 && netDistance > uncertainty * 2;
    const moving = (sustained || strong) && efficiency >= 0.72 && directionConsistency >= 0.65;
    return { moving, duration, netDistance, pathDistance, efficiency, directionConsistency, uncertainty };
  }

  function processMotionFix(motion, fix, observation = null) {
    const position = { latitude: fix.latitude, longitude: fix.longitude };
    const timestamp = Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now();
    let distance = motion.lastPosition ? haversineDistance(motion.lastPosition, position) : 0;
    let elapsedMs = motion.lastTimestamp == null ? 0 : Math.max(0, timestamp - motion.lastTimestamp);
    const pointAccuracy = Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : 5;
    const positionUncertainty = Math.max(10, pointAccuracy);
    const plausiblePosition = !motion.lastPosition || elapsedMs > 0 && distance <= FAST_MAX_PLAUSIBLE_SPEED_MPS * (elapsedMs / 1000) + positionUncertainty * 2;
    const rejectedReason = motion.lastTimestamp != null && timestamp <= motion.lastTimestamp || observation?.quality?.monotonic === false
      ? 'non-monotonic'
      : !plausiblePosition || observation?.quality?.plausiblePosition === false ? 'implausible-position'
        : observation?.quality?.fresh === false ? 'stale'
          : pointAccuracy > FAST_MAX_ACCURACY_M ? 'inaccurate' : null;
    if (rejectedReason) {
      if (rejectedReason === 'stale' || rejectedReason === 'inaccurate') motion.timeInterrupted = true;
      const rejected = { position, timestamp, rawSpeed: 0, speed: motion.filteredSpeed, moving: motion.moving, acceptedDistance: 0, acceptedMovingTime: 0, evidence: movementWindowEvidence(motion.speedWindow), rejectedReason };
      gpsDiagnostic('motion', { timestamp, accuracy: pointAccuracy, rawSpeed: fix.speed, displaySpeed: motion.filteredSpeed, reason: rejectedReason, moving: motion.moving, acceptedDistance: 0 });
      return rejected;
    }
    // A gap outside the existing evidence window cannot establish continuous motion.
    // Keep the raw fix in the recorder, but start new evidence without crediting the gap.
    if (motion.timeInterrupted || elapsedMs > MOTION_WINDOW_MS) {
      resetMotionState(motion, true);
      distance = 0;
      elapsedMs = 0;
    }
    const rawSpeed = resolveSpeed(fix, distance, elapsedMs);
    let acceptedDistance = 0;
    let acceptedMovingTime = 0;

    // The direction-evidence threshold is not a minimum distance for elapsed time.
    const intervalMoved = distance > 0 && (fix.speed !== 0 || distance >= Math.max(2, pointAccuracy * 0.75));
    motion.speedWindow.push({ position, timestamp, movingIntervalMs: intervalMoved ? elapsedMs : 0, accuracy: Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null });
    while (motion.speedWindow.length > 2 && timestamp - motion.speedWindow[0].timestamp > MOTION_WINDOW_MS) motion.speedWindow.shift();
    const evidence = movementWindowEvidence(motion.speedWindow);
    const uncertainty = Number.isFinite(evidence.uncertainty) ? evidence.uncertainty : Math.max(3, Number(fix.accuracy) || 5);

    if (!motion.lastPosition || distance > uncertainty) {
      motion.stationaryCandidateSince = null;
      motion.stationaryCandidatePosition = null;
      motion.stationaryCandidateUncertainty = null;
    } else if (motion.stationaryCandidateSince == null) {
      motion.stationaryCandidateSince = timestamp;
      motion.stationaryCandidatePosition = position;
      motion.stationaryCandidateUncertainty = uncertainty;
    } else {
      const candidateUncertainty = Math.max(uncertainty, motion.stationaryCandidateUncertainty || 3);
      if (haversineDistance(motion.stationaryCandidatePosition, position) > candidateUncertainty) {
        motion.stationaryCandidateSince = null;
        motion.stationaryCandidatePosition = null;
        motion.stationaryCandidateUncertainty = null;
      }
    }

    if (!motion.moving) {
      if (evidence.moving) {
        motion.moving = true;
        motion.speedSamples = [];
        motion.distanceAnchor = position;
        acceptedDistance = evidence.pathDistance;
      }
    } else {
      motion.distancePath += Math.max(0, distance);
      if (!evidence.moving && evidence.duration >= 5000) {
        motion.moving = false;
        motion.speedSamples = [];
        motion.filteredSpeed = 0;
        motion.distanceAnchor = position;
        motion.distancePath = 0;
        motion.speedWindow = [{ position, timestamp, accuracy: Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null }];
      } else if (evidence.moving && motion.distanceAnchor && haversineDistance(motion.distanceAnchor, position) > evidence.uncertainty) {
        acceptedDistance = motion.distancePath;
        motion.distanceAnchor = position;
        motion.distancePath = 0;
      }
    }

    // Movement evidence approves intervals; distance batching must not batch time.
    // On (re)start, stationary intervals in the evidence window contribute no time.
    if (motion.moving) {
      acceptedMovingTime = motion.speedWindow.reduce((total, sample) => {
        const duration = sample.movingIntervalMs || 0;
        const uncredited = motion.movingTimeApprovedThrough == null ? duration
          : Math.min(duration, Math.max(0, sample.timestamp - motion.movingTimeApprovedThrough));
        return total + uncredited;
      }, 0);
    }
    if (motion.moving) motion.movingTimeApprovedThrough = timestamp;

    if (acceptedDistance >= GPS_JUMP_MAX_M) {
      acceptedDistance = 0;
      acceptedMovingTime = 0;
    }

    let filteredSpeed = 0;
    if (motion.moving) {
      const sample = motion.filteredSpeed > 0 && rawSpeed > motion.filteredSpeed * 2.2 + 1.5 ? motion.filteredSpeed : Math.max(0, rawSpeed);
      motion.speedSamples.push(sample);
      if (motion.speedSamples.length > 3) motion.speedSamples.shift();
      const sorted = motion.speedSamples.slice().sort((a, b) => a - b);
      filteredSpeed = sorted[Math.floor(sorted.length / 2)] || 0;
      motion.filteredSpeed = filteredSpeed;
    }

    motion.lastPosition = position;
    motion.lastTimestamp = timestamp;
    const result = { position, timestamp, rawSpeed, speed: filteredSpeed, moving: motion.moving, acceptedDistance, acceptedMovingTime, evidence, rejectedReason: null };
    gpsDiagnostic('motion', { timestamp, accuracy: pointAccuracy, rawSpeed, displaySpeed: filteredSpeed, reason: 'accepted', moving: motion.moving, acceptedDistance });
    return result;
  }

  function reportGpsDisplay(fast, movement, displaySpeed, renderedAt = Date.now()) {
    gpsDiagnostic('display', { timestamp: fast?.timestamp, receivedAt: fast?.receivedAt, renderedAt, renderDelayMs: Number.isFinite(fast?.receivedAt) ? Math.max(0, renderedAt - fast.receivedAt) : null, accuracy: fast?.position?.accuracy, rawSpeed: fast?.speed?.rawMps, derivedSpeed: fast?.speed?.derivedMps, displaySpeed, reason: fast?.speed?.reason, moving: movement?.moving === true });
  }

  function calculateBestKilometer(distanceHistory) {
    if (!Array.isArray(distanceHistory) || distanceHistory.length < 2 || distanceHistory.at(-1).distance < 1000) return null;
    let best = Infinity;
    let startIndex = 0;
    for (let endIndex = 1; endIndex < distanceHistory.length; endIndex += 1) {
      const end = distanceHistory[endIndex];
      const targetDistance = end.distance - 1000;
      if (targetDistance < 0) continue;
      while (startIndex + 1 < endIndex && distanceHistory[startIndex + 1].distance <= targetDistance) startIndex += 1;
      const before = distanceHistory[startIndex];
      const after = distanceHistory[Math.min(startIndex + 1, endIndex)];
      const span = after.distance - before.distance;
      const ratio = span > 0 ? (targetDistance - before.distance) / span : 0;
      const startMovingTime = before.movingTime + (after.movingTime - before.movingTime) * ratio;
      const duration = end.movingTime - startMovingTime;
      if (duration > 0) best = Math.min(best, duration);
    }
    return Number.isFinite(best) ? best : null;
  }

  function createRideSession() {
    return {
      recordingState: 'idle',
      startedAt: null,
      endedAt: null,
      pausedAt: null,
      pausedDuration: 0,
      distance: 0,
      movingTime: 0,
      currentSpeed: 0,
      maxSpeed: 0,
      motion: createMotionState(),
      distanceHistory: [{ distance: 0, movingTime: 0 }],
      routePoints: [],
      detailedSamples: [],
      completed: null,
    };
  }

  function startRide(ride, now = Date.now()) {
    Object.assign(ride, createRideSession(), { recordingState: 'recording', startedAt: now });
    return ride;
  }

  function ensureRideStarted(ride, now = Date.now()) {
    if (!ride || !['recording', 'paused'].includes(ride.recordingState)) {
      startRide(ride, now);
      return true;
    }
    return false;
  }

  function discardRide(ride) {
    if (!ride) return null;
    Object.assign(ride, createRideSession());
    return ride;
  }

  function pauseRide(ride, now = Date.now()) {
    if (ride.recordingState !== 'recording') return false;
    if (ride.motion.lastPosition) appendRideRouteSample(ride, {
      position: ride.motion.lastPosition,
      timestamp: now,
      speed: 0,
      moving: false,
    });
    ride.recordingState = 'paused';
    ride.pausedAt = now;
    ride.currentSpeed = 0;
    resetMotionState(ride.motion, true);
    return true;
  }

  function resumeRide(ride, now = Date.now()) {
    if (ride.recordingState !== 'paused') return false;
    ride.pausedDuration += Math.max(0, now - ride.pausedAt);
    ride.pausedAt = null;
    ride.recordingState = 'recording';
    resetMotionState(ride.motion, true);
    return true;
  }

  function elapsedRideTime(ride, now = Date.now()) {
    if (ride.startedAt == null) return 0;
    const end = ride.endedAt == null ? now : ride.endedAt;
    const activePause = ride.pausedAt == null ? 0 : Math.max(0, end - ride.pausedAt);
    return Math.max(0, end - ride.startedAt - ride.pausedDuration - activePause);
  }

  function appendRideRouteSample(ride, result) {
    const previous = ride.routePoints.at(-1);
    const sample = {
      latitude: result.position.latitude,
      longitude: result.position.longitude,
      timestamp: result.timestamp,
      distance: Math.max(previous?.distance || 0, ride.distance),
      movingTime: Math.max(previous?.movingTime || 0, ride.movingTime),
      filteredSpeed: Number.isFinite(result.speed) ? Math.max(0, result.speed) : 0,
      moving: result.moving === true,
    };
    if (previous
      && previous.distance === sample.distance
      && previous.movingTime === sample.movingTime
      && previous.moving === sample.moving) {
      Object.assign(previous, sample);
      return previous;
    }
    ride.routePoints.push(sample);
    return sample;
  }

  function ingestRideFix(ride, fix, observation = null) {
    if (!ride || ride.recordingState === 'idle' || ride.recordingState === 'completed') return null;
    const timestamp = Math.max(ride.startedAt, Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now());
    if (ride.recordingState === 'paused') {
      ride.detailedSamples.push({ ...fix, timestamp, recordingState: 'paused', moving: false, acceptedDistance: 0 });
      return null;
    }
    const wasMoving = ride.motion.moving;
    const result = processMotionFix(ride.motion, { ...fix, timestamp }, observation);
    ride.currentSpeed = result.speed;
    if (result.moving) ride.maxSpeed = Math.max(ride.maxSpeed, result.speed);
    ride.movingTime += result.acceptedMovingTime;
    if (result.acceptedDistance > 0) ride.distance += result.acceptedDistance;
    if (result.acceptedDistance > 0 || result.acceptedMovingTime > 0) {
      ride.distanceHistory.push({ distance: ride.distance, movingTime: ride.movingTime });
      appendRideRouteSample(ride, result);
    } else if (!result.rejectedReason && (!ride.routePoints.length || wasMoving !== result.moving)) {
      appendRideRouteSample(ride, result);
    }
    ride.detailedSamples.push({ ...fix, timestamp, measurementTimestamp: fix.timestamp, receivedAt: observation?.receivedAt ?? null, filteredSpeed: result.speed, moving: result.moving, acceptedDistance: result.acceptedDistance, acceptedMovingTime: result.acceptedMovingTime, rejectedReason: result.rejectedReason });
    return result;
  }

  function rideMetrics(ride, now = Date.now()) {
    const elapsedTime = elapsedRideTime(ride, now);
    const averageMovingSpeed = ride.movingTime > 0 ? ride.distance / (ride.movingTime / 1000) : 0;
    const bestKilometerTime = calculateBestKilometer(ride.distanceHistory);
    return {
      elapsedTime,
      movingTime: ride.movingTime,
      stoppedTime: Math.max(0, elapsedTime - ride.movingTime),
      distance: ride.distance,
      currentSpeed: ride.currentSpeed,
      averageMovingSpeed,
      maxSpeed: ride.maxSpeed,
      averageMovingPace: averageMovingSpeed > 0 ? 1000 / averageMovingSpeed : null,
      bestKilometerPace: bestKilometerTime == null ? null : bestKilometerTime / 1000,
    };
  }

  function finishRide(ride, now = Date.now()) {
    if (!ride || !['recording', 'paused'].includes(ride.recordingState)) return ride?.completed || null;
    ride.endedAt = now;
    const metrics = rideMetrics(ride, now);
    ride.recordingState = 'completed';
    ride.currentSpeed = 0;
    ride.completed = {
      summary: {
        startedAt: new Date(ride.startedAt).toISOString(),
        endedAt: new Date(now).toISOString(),
        distance: metrics.distance,
        elapsedTime: metrics.elapsedTime,
        duration: metrics.elapsedTime,
        movingTime: metrics.movingTime,
        stoppedTime: metrics.stoppedTime,
        averageMovingSpeed: metrics.averageMovingSpeed,
        averageSpeed: metrics.averageMovingSpeed,
        maxSpeed: metrics.maxSpeed,
        averageMovingPace: metrics.averageMovingPace,
        bestKilometerPace: metrics.bestKilometerPace,
      },
      route: ride.routePoints.map(point => ({ ...point })),
      detailedSamples: ride.detailedSamples.map(sample => ({ ...sample })),
    };
    return ride.completed;
  }

  function permanentRideRecord(completedRide, { retainDetailed = false } = {}) {
    if (!completedRide) return null;
    return {
      ...completedRide.summary,
      ghostDataVersion: GHOST_DATA_VERSION,
      route: completedRide.route.map(point => ({ ...point })),
      ...(retainDetailed ? { detailedSamples: completedRide.detailedSamples.map(sample => ({ ...sample })) } : {}),
    };
  }

  function routePointAtDistance(route, distance) {
    if (!Array.isArray(route) || route.length < 2) return null;
    const bounded = Math.max(0, Math.min(routeDistance(route), Number(distance) || 0));
    let walked = 0;
    for (let index = 1; index < route.length; index += 1) {
      const start = route[index - 1], end = route[index], segment = haversineDistance(start, end);
      if (bounded <= walked + segment) {
        const ratio = segment ? (bounded - walked) / segment : 1;
        return { latitude: start.latitude + (end.latitude - start.latitude) * ratio, longitude: start.longitude + (end.longitude - start.longitude) * ratio };
      }
      walked += segment;
    }
    const last = route.at(-1);
    return { latitude: last.latitude, longitude: last.longitude };
  }

  function routeDistance(route) {
    if (!Array.isArray(route)) return 0;
    return route.slice(1).reduce((sum, point, index) => sum + haversineDistance(route[index], point), 0);
  }

  function bearingDegrees(start, end) {
    const radians = Math.PI / 180, latitude1 = start.latitude * radians, latitude2 = end.latitude * radians;
    const longitude = (end.longitude - start.longitude) * radians;
    const y = Math.sin(longitude) * Math.cos(latitude2);
    const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude);
    return (Math.atan2(y, x) / radians + 360) % 360;
  }

  function offsetPosition(origin, eastMeters, northMeters) {
    const latitudeScale = Math.max(0.01, Math.cos(origin.latitude * Math.PI / 180));
    return { latitude: origin.latitude + northMeters / 111195, longitude: origin.longitude + eastMeters / (111195 * latitudeScale) };
  }

  function createRouteArrivalGate(route, alongDistance = null, { gateWidthM = 3, radiusM = 5, approachLengthM = 15 } = {}) {
    if (!Array.isArray(route) || route.length < 2 || !route.every(point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))) return null;
    const totalDistance = routeDistance(route), along = Number.isFinite(alongDistance) ? Math.max(0, Math.min(totalDistance, alongDistance)) : totalDistance;
    if (totalDistance <= 0 || along <= 0) return null;
    const center = routePointAtDistance(route, along), approachStart = routePointAtDistance(route, Math.max(0, along - Math.min(15, approachLengthM)));
    if (!center || !approachStart || haversineDistance(center, approachStart) < 0.5) return null;
    const bearing = bearingDegrees(approachStart, center), radians = bearing * Math.PI / 180;
    const forward = { east: Math.sin(radians), north: Math.cos(radians) }, side = { east: Math.cos(radians), north: -Math.sin(radians) };
    const halfWidth = gateWidthM / 2;
    const lineStart = offsetPosition(center, -side.east * halfWidth, -side.north * halfWidth);
    const lineEnd = offsetPosition(center, side.east * halfWidth, side.north * halfWidth);
    const arcPoints = Array.from({ length: 19 }, (_, index) => {
      const angle = -Math.PI / 2 + Math.PI * index / 18;
      return offsetPosition(center, radiusM * (forward.east * Math.cos(angle) + side.east * Math.sin(angle)), radiusM * (forward.north * Math.cos(angle) + side.north * Math.sin(angle)));
    });
    return { center, lineStart, lineEnd, arcPoints, alongDistance: along, approachStartAlong: Math.max(0, along - Math.min(15, approachLengthM)), direction: forward, side, gateWidthM, radiusM, totalDistance };
  }

  function createRouteArrivalState() {
    return { approached: false, arrived: false, previous: null, crossing: null };
  }

  function evaluateRouteArrival(detectorState, gate, observation = {}) {
    const state = { ...createRouteArrivalState(), ...(detectorState || {}) };
    if (state.arrived) return { state, arrived: true, reason: 'already-arrived' };
    const position = observation.position;
    const routeProgress = Number(observation.routeProgress), offRouteDistance = Number(observation.offRouteDistance);
    const timestamp = observation.timestamp, accuracy = observation.accuracy;
    const usable = gate && Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
      && Number.isFinite(routeProgress) && Number.isFinite(offRouteDistance) && Number.isFinite(timestamp)
      && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= FAST_MAX_ACCURACY_M && !observation.rejectedReason;
    if (!usable) return { state: createRouteArrivalState(), arrived: false, reason: 'uncertain-observation' };
    const radians = Math.PI / 180, latitudeScale = Math.cos(gate.center.latitude * radians);
    const local = point => ({ east: (point.longitude - gate.center.longitude) * 111195 * latitudeScale, north: (point.latitude - gate.center.latitude) * 111195 });
    const coordinates = local(position), forwardDistance = coordinates.east * gate.direction.east + coordinates.north * gate.direction.north;
    const lateralDistance = coordinates.east * gate.side.east + coordinates.north * gate.side.north;
    const tolerance = 0.05;
    const onSelectedRoute = offRouteDistance <= 5;
    const inApproach = onSelectedRoute
      && routeProgress >= gate.approachStartAlong - tolerance
      && routeProgress <= gate.alongDistance + tolerance
      && forwardDistance <= tolerance;
    let previous = state.previous;
    if (previous) {
      const elapsed = timestamp - previous.timestamp, displacement = haversineDistance(previous.position, position);
      const speedLimit = Number.isFinite(previous.filteredSpeed) && Number.isFinite(observation.filteredSpeed)
        ? Math.min(FAST_MAX_PLAUSIBLE_SPEED_MPS, Math.max(previous.filteredSpeed, observation.filteredSpeed)) : FAST_MAX_PLAUSIBLE_SPEED_MPS;
      // Use the recorder's continuity window; never bridge outages or GPS jumps.
      if (elapsed <= 0 || elapsed > MOTION_WINDOW_MS || displacement >= GPS_JUMP_MAX_M
        || displacement > speedLimit * elapsed / 1000 + 2 * Math.max(3, accuracy, previous.accuracy)) {
        previous = null;
        state.approached = false;
      }
    }
    if (inApproach) state.approached = true;
    const progressAtGate = routeProgress >= gate.alongDistance - gate.gateWidthM;
    const span = previous ? forwardDistance - previous.forwardDistance : 0;
    if (previous?.inApproach && previous.forwardDistance <= 0 && forwardDistance >= -1e-6 && span > 0 && progressAtGate) {
      const ratio = Math.max(0, Math.min(1, -previous.forwardDistance / span));
      const lateralAtGate = previous.lateralDistance + (lateralDistance - previous.lateralDistance) * ratio;
      // Keep the existing 5m route corridor even when the next fix is past its end.
      if (Math.abs(lateralAtGate) <= gate.radiusM + tolerance && Math.abs(lateralDistance) <= gate.radiusM + tolerance) {
        const interpolate = key => Number.isFinite(previous[key]) && Number.isFinite(observation[key])
          ? previous[key] + (observation[key] - previous[key]) * ratio : undefined;
        const movingTime = interpolate('movingTime');
        state.crossing = {
          position: { latitude: previous.position.latitude + (position.latitude - previous.position.latitude) * ratio,
            longitude: previous.position.longitude + (position.longitude - previous.position.longitude) * ratio },
          timestamp: Math.round(previous.timestamp + (timestamp - previous.timestamp) * ratio),
          distance: interpolate('distance'), movingTime: Number.isFinite(movingTime) ? Math.round(movingTime) : undefined, filteredSpeed: interpolate('filteredSpeed'),
          moving: observation.moving === true, estimated: ratio > 0 && ratio < 1,
        };
        state.arrived = true;
      }
    }
    state.previous = { position: { latitude: position.latitude, longitude: position.longitude }, timestamp, accuracy,
      forwardDistance, lateralDistance, inApproach, distance: observation.distance, movingTime: observation.movingTime, filteredSpeed: observation.filteredSpeed };
    return { state, arrived: state.arrived, reason: state.arrived ? 'crossed-arrival-line' : inApproach ? 'approaching' : 'outside' };
  }

  function createNavigationArrivalState() {
    return {
      candidateCount: 0,
      candidateSince: null,
      candidateQualified: false,
      approached: false,
      previousDistance: null,
      previousUncertainty: null,
      bestCandidateDistance: Infinity,
      bestCandidateUncertainty: Infinity,
      arrived: false,
    };
  }

  function evaluateNavigationArrival(detectorState, observation) {
    const state = { ...createNavigationArrivalState(), ...(detectorState || {}) };
    if (state.arrived) return { state, arrived: true, candidate: true, reason: 'already-arrived' };
    const timestamp = Number(observation?.timestamp);
    const selectedDistance = Math.max(0, Number(observation?.selectedDistance));
    const routeEndDistance = Math.max(0, Number(observation?.routeEndDistance));
    const endpointOffset = Math.max(0, Number(observation?.endpointOffset));
    const remainingRouteDistance = Math.max(0, Number(observation?.remainingRouteDistance));
    const reportedAccuracy = Number(observation?.accuracy);
    if (![timestamp, selectedDistance, routeEndDistance, endpointOffset, remainingRouteDistance, reportedAccuracy].every(Number.isFinite)) {
      return { state, arrived: false, candidate: false, reason: 'invalid-observation' };
    }
    const uncertainty = Math.max(3, reportedAccuracy);
    const targetDistance = Math.min(selectedDistance, routeEndDistance);
    if (state.previousDistance != null && state.previousDistance - targetDistance > Math.max(uncertainty, state.previousUncertainty || 3)) state.approached = true;
    state.previousDistance = targetDistance;
    state.previousUncertainty = uncertainty;

    const physicalCandidate = selectedDistance <= endpointOffset + uncertainty || routeEndDistance <= uncertainty;
    const routeCandidate = remainingRouteDistance <= endpointOffset + uncertainty * 2;
    const candidate = physicalCandidate && routeCandidate;
    if (candidate) {
      if (!state.candidateCount) state.candidateSince = timestamp;
      state.candidateCount += 1;
      if (targetDistance < state.bestCandidateDistance) {
        state.bestCandidateDistance = targetDistance;
        state.bestCandidateUncertainty = uncertainty;
      }
      if (state.candidateCount >= 3 && timestamp - state.candidateSince >= 2000) state.candidateQualified = true;
    } else if (!state.candidateQualified) {
      state.candidateCount = 0;
      state.candidateSince = null;
      state.bestCandidateDistance = Infinity;
      state.bestCandidateUncertainty = Infinity;
    }

    const stable = state.candidateQualified
      && observation.moving === false
      && Number.isFinite(observation.stationaryCandidateSince)
      && timestamp - observation.stationaryCandidateSince >= 2000;
    const passed = state.candidateQualified
      && state.approached
      && routeCandidate
      && targetDistance - state.bestCandidateDistance > Math.max(uncertainty, state.bestCandidateUncertainty);
    state.arrived = stable || passed;
    return { state, arrived: state.arrived, candidate, reason: stable ? 'stable' : passed ? 'passed' : candidate ? 'candidate' : 'outside' };
  }


  function normalizePosition(position) {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp || Date.now(),
    };
  }

  function createGpsSource(geolocation, watchOptions = { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }, runtime = {}) {
    const consumers = new Map();
    const fastState = createFastObservationState();
    const now = typeof runtime.now === 'function' ? runtime.now : Date.now;
    const reportError = typeof runtime.reportError === 'function'
      ? runtime.reportError
      : (error, details) => console.error?.('[RideMate GPS consumer]', details, error);
    let watchId = null;
    let latest = null;
    let latestFast = null;
    let status = 'idle';
    function notifyConsumer(consumerKey, consumer, callback, args) {
      try {
        consumer[callback]?.(...args);
      } catch (error) {
        try { reportError(error, { consumerKey, callback }); } catch {}
      }
    }
    function notifyStatus(next, error = null) {
      status = next;
      consumers.forEach((consumer, key) => notifyConsumer(key, consumer, 'onStatus', [status, error]));
    }
    function ensureWatch() {
      if (watchId != null || !consumers.size) return;
      notifyStatus('requesting');
      watchId = geolocation.watchPosition(position => {
        const fix = normalizePosition(position);
        if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return;
        latest = fix;
        latestFast = processFastObservation(fastState, fix, now());
        notifyStatus('ready');
        consumers.forEach((consumer, key) => notifyConsumer(key, consumer, 'onFix', [latest, latestFast]));
      }, error => {
        notifyStatus(error?.code === 1 ? 'denied' : 'error', error);
      }, watchOptions);
    }
    function subscribe(key, onFix, onStatus) {
      const consumer = typeof onFix === 'function' ? { onFix, onStatus } : onFix;
      consumers.set(key, consumer);
      notifyConsumer(key, consumer, 'onStatus', [status]);
      if (latest) {
        const replayAge = Math.max(0, now() - latestFast.timestamp);
        const replayFast = {
          ...latestFast,
          ageMs: replayAge,
          quality: { ...latestFast.quality, fresh: replayAge <= FAST_FRESH_MAX_AGE_MS },
        };
        notifyConsumer(key, consumer, 'onFix', [latest, replayFast]);
      }
      ensureWatch();
      return () => unsubscribe(key);
    }
    function unsubscribe(key) {
      consumers.delete(key);
      if (!consumers.size && watchId != null) {
        geolocation.clearWatch(watchId);
        watchId = null;
        notifyStatus('idle');
      }
    }
    return { subscribe, unsubscribe, getLatest: () => latest, getLatestFast: () => latestFast, getStatus: () => status, getWatchId: () => watchId };
  }

  return {
    GHOST_DATA_VERSION,
    GPS_JUMP_MAX_M,
    calculateBestKilometer,
    createFastObservationState,
    createGpsSource,
    createNavigationArrivalState,
    createRouteArrivalGate,
    createRouteArrivalState,
    createMotionState,
    createRideSession,
    discardRide,
    ensureRideStarted,
    evaluateNavigationArrival,
    evaluateRouteArrival,
    elapsedRideTime,
    finishRide,
    haversineDistance,
    ingestRideFix,
    movementWindowEvidence,
    pauseRide,
    permanentRideRecord,
    processFastObservation,
    processMotionFix,
    reportGpsDisplay,
    resetMotionState,
    resolveSpeed,
    setGpsDiagnosticsEnabled,
    smoothHeading,
    resumeRide,
    rideMetrics,
    startRide,
  };
});
