(function exposeRacingFoundation(root, factory) {
  const rideFoundation = typeof module === 'object' && module.exports
    ? require('./ride-foundation.js')
    : root?.RideMateRide;
  const api = factory(rideFoundation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateRacing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRacingFoundationApi(Ride) {
  const SAVED_RIDE = 'SAVED_RIDE';
  const TARGET_SPEED = 'TARGET_SPEED';
  const MAX_CONTIGUOUS_GPS_GAP_MS = 30000;
  const GHOST_DATA_VERSION = Ride?.GHOST_DATA_VERSION;
  const distanceBetween = Ride?.haversineDistance;

  if (!Number.isInteger(GHOST_DATA_VERSION) || typeof distanceBetween !== 'function') {
    throw new Error('RideMateRide foundation is required');
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function validPoint(point) {
    return finite(point?.latitude) && finite(point?.longitude);
  }

  function routeDistance(route) {
    let total = 0;
    for (let index = 1; index < route.length; index += 1) total += distanceBetween(route[index - 1], route[index]);
    return total;
  }

  function pointAtRouteDistance(route, distance) {
    if (!Array.isArray(route) || !route.length) return null;
    const target = Math.max(0, finite(distance) ? distance : 0);
    if (target === 0) return { latitude: route[0].latitude, longitude: route[0].longitude };
    let walked = 0;
    for (let index = 1; index < route.length; index += 1) {
      const start = route[index - 1];
      const end = route[index];
      const segment = distanceBetween(start, end);
      if (target <= walked + segment) {
        const ratio = segment > 0 ? Math.max(0, Math.min(1, (target - walked) / segment)) : 1;
        return {
          latitude: start.latitude + (end.latitude - start.latitude) * ratio,
          longitude: start.longitude + (end.longitude - start.longitude) * ratio,
        };
      }
      walked += segment;
    }
    const last = route.at(-1);
    return { latitude: last.latitude, longitude: last.longitude };
  }

  function routeBearing(start, end) {
    const radians = Math.PI / 180;
    const latitude1 = start.latitude * radians;
    const latitude2 = end.latitude * radians;
    const longitude = (end.longitude - start.longitude) * radians;
    const y = Math.sin(longitude) * Math.cos(latitude2);
    const x = Math.cos(latitude1) * Math.sin(latitude2)
      - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude);
    return (Math.atan2(y, x) / radians + 360) % 360;
  }

  function headingDifference(first, second) {
    return Math.abs(((first - second + 540) % 360) - 180);
  }

  function projectOnRoute(route, position, options = {}) {
    if (!Array.isArray(route) || route.length < 2 || !validPoint(position)) {
      return { alongDistance: 0, totalDistance: 0, offRouteDistance: Infinity, projectedPoint: null, progressAccepted: false };
    }
    // Restrict the route to the active leg before comparing GPS proximity.
    const totalDistance = routeDistance(route);
    const minimumAlong = finite(options.minimumAlong) ? Math.max(0, Math.min(totalDistance, options.minimumAlong)) : 0;
    const maximumAlong = finite(options.maximumAlong) ? Math.max(minimumAlong, Math.min(totalDistance, options.maximumAlong)) : totalDistance;
    let walked = 0;
    const candidates = [];
    for (let index = 1; index < route.length; index += 1) {
      const start = route[index - 1];
      const end = route[index];
      const segment = distanceBetween(start, end);
      if (walked + segment < minimumAlong || walked > maximumAlong) {
        walked += segment;
        continue;
      }
      const latitudeScale = Math.cos(((start.latitude + end.latitude + position.latitude) / 3) * Math.PI / 180);
      const vectorX = (end.longitude - start.longitude) * latitudeScale;
      const vectorY = end.latitude - start.latitude;
      const pointX = (position.longitude - start.longitude) * latitudeScale;
      const pointY = position.latitude - start.latitude;
      const denominator = vectorX * vectorX + vectorY * vectorY;
      const minimumRatio = segment > 0 ? Math.max(0, (minimumAlong - walked) / segment) : 0;
      const maximumRatio = segment > 0 ? Math.min(1, (maximumAlong - walked) / segment) : 0;
      const ratio = denominator ? Math.max(minimumRatio, Math.min(maximumRatio, (pointX * vectorX + pointY * vectorY) / denominator)) : 0;
      const projected = {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
      const offRouteDistance = distanceBetween(position, projected);
      candidates.push({
        alongDistance: walked + segment * ratio,
        offRouteDistance,
        projectedPoint: projected,
        heading: routeBearing(start, end),
      });
      walked += segment;
    }

    const nearestDistance = Math.min(...candidates.map(candidate => candidate.offRouteDistance));
    const accuracy = finite(options.accuracy) && options.accuracy > 0 ? options.accuracy : 0;
    const previousAccuracy = finite(options.previousAccuracy) && options.previousAccuracy > 0 ? options.previousAccuracy : 0;
    const spatialAllowance = Math.max(3, accuracy * 0.75);
    let spatialCandidates = candidates.filter(candidate => candidate.offRouteDistance <= nearestDistance + spatialAllowance);
    const previousAlong = finite(options.previousAlong) ? options.previousAlong : null;
    const previousPosition = validPoint(options.previousPosition) ? options.previousPosition : null;
    let expectedMovement = 0;
    let movementBearing = null;
    let movementLimit = Infinity;

    if (previousAlong != null && previousPosition) {
      const displacement = distanceBetween(previousPosition, position);
      const elapsed = finite(options.timestamp) && finite(options.previousTimestamp)
        ? Math.max(0, options.timestamp - options.previousTimestamp) / 1000
        : 0;
      const longGpsGap = elapsed * 1000 > MAX_CONTIGUOUS_GPS_GAP_MS;
      // Speed is only a tie-break hint for overlapping route segments; the
      // movement limit below is based on GPS displacement, not speed × gap.
      const speedDistanceHint = finite(options.speedMps) && options.speedMps >= 0 ? options.speedMps * elapsed : 0;
      expectedMovement = longGpsGap ? 0 : Math.max(displacement, speedDistanceHint);
      movementLimit = longGpsGap
        ? Infinity
        : displacement <= 2
          ? 8
          : Math.max(displacement * 1.35 + Math.max(8, accuracy + previousAccuracy), displacement + 21);
      if (!longGpsGap && elapsed > 0) movementLimit = Math.min(movementLimit, elapsed * 60 + Math.max(8, accuracy + previousAccuracy));
      if (displacement > Math.max(2, accuracy * 0.5)) movementBearing = routeBearing(previousPosition, position);

      spatialCandidates = spatialCandidates.filter(candidate => {
        const delta = candidate.alongDistance - previousAlong;
        return delta <= movementLimit && delta >= -movementLimit;
      });

      if (longGpsGap) {
        const nearestAlong = spatialCandidates.reduce((selected, candidate) =>
          !selected || Math.abs(candidate.alongDistance - previousAlong) < Math.abs(selected.alongDistance - previousAlong)
            ? candidate
            : selected, null);
        if (nearestAlong) {
          return {
            alongDistance: nearestAlong.alongDistance,
            matchAlongDistance: nearestAlong.alongDistance,
            totalDistance: walked,
            offRouteDistance: nearestAlong.offRouteDistance,
            projectedPoint: nearestAlong.projectedPoint,
            progressAccepted: false,
            anchorAccepted: true,
            reanchorWithoutCredit: true,
          };
        }
      }
    }

    if (!spatialCandidates.length && previousAlong != null && previousPosition) {
      const nearest = candidates.reduce((best, candidate) => !best || candidate.offRouteDistance < best.offRouteDistance ? candidate : best, null);
      return {
        alongDistance: previousAlong,
        matchAlongDistance: nearest.alongDistance,
        totalDistance: walked,
        offRouteDistance: nearest.offRouteDistance,
        projectedPoint: pointAtRouteDistance(route, previousAlong),
        progressAccepted: false,
        anchorAccepted: false,
      };
    }

    const best = spatialCandidates.reduce((selected, candidate) => {
      if (!selected) return candidate;
      const candidateDelta = previousAlong == null ? 0 : candidate.alongDistance - previousAlong;
      const selectedDelta = previousAlong == null ? 0 : selected.alongDistance - previousAlong;
      const candidateDirection = candidateDelta < 0 ? (candidate.heading + 180) % 360 : candidate.heading;
      const selectedDirection = selectedDelta < 0 ? (selected.heading + 180) % 360 : selected.heading;
      const reverseThreshold = Math.max(5, accuracy + previousAccuracy);
      const candidateScore = candidate.offRouteDistance * 2
        + Math.abs(Math.abs(candidateDelta) - expectedMovement) * 0.25
        + (candidateDelta < -reverseThreshold ? 12 : 0)
        + (movementBearing == null || Math.abs(candidateDelta) < 2 ? 0 : headingDifference(candidateDirection, movementBearing) * 0.08);
      const selectedScore = selected.offRouteDistance * 2
        + Math.abs(Math.abs(selectedDelta) - expectedMovement) * 0.25
        + (selectedDelta < -reverseThreshold ? 12 : 0)
        + (movementBearing == null || Math.abs(selectedDelta) < 2 ? 0 : headingDifference(selectedDirection, movementBearing) * 0.08);
      return candidateScore < selectedScore ? candidate : selected;
    }, null);

    return {
      alongDistance: best.alongDistance,
      matchAlongDistance: best.alongDistance,
      totalDistance: walked,
      offRouteDistance: best.offRouteDistance,
      projectedPoint: best.projectedPoint,
      progressAccepted: true,
      anchorAccepted: true,
    };
  }

  function createSavedRideTarget(savedRide) {
    if (savedRide?.ghostDataVersion !== GHOST_DATA_VERSION || !Array.isArray(savedRide.route) || savedRide.route.length < 2) return null;
    const samples = [];
    for (const source of savedRide.route) {
      if (!validPoint(source)
        || !finite(source.timestamp)
        || !finite(source.distance)
        || !finite(source.movingTime)
        || !finite(source.filteredSpeed)
        || typeof source.moving !== 'boolean'
        || source.distance < 0
        || source.movingTime < 0
        || source.filteredSpeed < 0) return null;
      const previous = samples.at(-1);
      if (previous && (source.distance < previous.distance || source.movingTime < previous.movingTime)) return null;
      samples.push({
        latitude: source.latitude,
        longitude: source.longitude,
        timestamp: source.timestamp,
        distance: source.distance,
        movingTime: source.movingTime,
        filteredSpeed: source.filteredSpeed,
        moving: source.moving,
      });
    }
    if (samples.at(-1).distance <= 0) return null;
    return { type: SAVED_RIDE, samples, distance: samples.at(-1).distance, movingTime: samples.at(-1).movingTime };
  }

  function createTargetSpeedTarget(speedMps, accelerationMs = 0) {
    if (!finite(speedMps) || speedMps <= 0) throw new TypeError('speedMps must be greater than zero');
    if (!finite(accelerationMs) || accelerationMs < 0) throw new TypeError('accelerationMs must be nonnegative');
    return { type: TARGET_SPEED, speedMps, ...(accelerationMs ? { accelerationMs, restartTimes: [0] } : {}) };
  }

  function speedRunDistance(target, duration) {
    const seconds = Math.max(0, duration) / 1000, ramp = (target.accelerationMs || 0) / 1000;
    return target.speedMps * (ramp && seconds < ramp ? seconds * seconds / (2 * ramp) : seconds - ramp / 2);
  }

  function stopTargetSpeed(session) {
    if (session.target.type === TARGET_SPEED && session.target.accelerationMs) session.targetNeedsRestart = true;
  }

  function targetProgressAtTime(target, movingTime) {
    const time = Math.max(0, finite(movingTime) ? movingTime : 0);
    if (target.type === TARGET_SPEED) {
      const starts = target.restartTimes || [0];
      return starts.reduce((distance, start, index) => distance + (time > start ? speedRunDistance(target, Math.min(time, starts[index + 1] ?? time) - start) : 0), 0);
    }
    const samples = target.samples;
    if (time <= samples[0].movingTime) return samples[0].distance;
    let before = samples[0];
    for (let index = 1; index < samples.length; index += 1) {
      const after = samples[index];
      if (after.movingTime <= time) {
        before = after;
        continue;
      }
      const span = after.movingTime - before.movingTime;
      if (span <= 0) continue;
      const ratio = Math.max(0, Math.min(1, (time - before.movingTime) / span));
      return before.distance + (after.distance - before.distance) * ratio;
    }
    return samples.at(-1).distance;
  }

  function targetTimeAtProgress(target, progressDistance) {
    const distance = Math.max(0, finite(progressDistance) ? progressDistance : 0);
    if (target.type === TARGET_SPEED) {
      const starts = target.restartTimes || [0], ramp = (target.accelerationMs || 0) / 1000;
      let remaining = distance;
      for (let index = 0; index < starts.length; index++) {
        const available = index + 1 < starts.length ? speedRunDistance(target, starts[index + 1] - starts[index]) : Infinity;
        if (remaining > available) { remaining -= available; continue; }
        const seconds = ramp && remaining < target.speedMps * ramp / 2 ? Math.sqrt(2 * remaining * ramp / target.speedMps) : remaining / target.speedMps + ramp / 2;
        return starts[index] + seconds * 1000;
      }
    }
    const samples = target.samples;
    if (distance <= samples[0].distance) return samples[0].movingTime;
    let before = samples[0];
    for (let index = 1; index < samples.length; index += 1) {
      const after = samples[index];
      if (after.distance < distance) {
        before = after;
        continue;
      }
      if (after.distance === distance) return after.movingTime;
      const span = after.distance - before.distance;
      if (span <= 0) continue;
      const ratio = Math.max(0, Math.min(1, (distance - before.distance) / span));
      return before.movingTime + (after.movingTime - before.movingTime) * ratio;
    }
    return samples.at(-1).movingTime;
  }

  function prepareRaceStart(route, target, position, maximumProgress) {
    if (!validPoint(position)) throw new TypeError('valid start GPS required');
    const total = routeDistance(route);
    const projection = projectOnRoute(route, position, { maximumAlong: maximumProgress });
    const tail = raceRoutePath({ route, routeDistance: total, progressBase: 0 }, projection.alongDistance);
    tail[tail.length - 1] = { latitude: route.at(-1).latitude, longitude: route.at(-1).longitude };
    const connector = distanceBetween(position, tail[0]);
    const startedRoute = [{ latitude: position.latitude, longitude: position.longitude }, ...tail.slice(connector < 0.01 ? 1 : 0)];
    const distance = routeDistance(startedRoute);
    if (startedRoute.length < 2 || distance < 1) throw new TypeError('race requires a remaining course');
    let startedTarget = target;
    if (target.type === SAVED_RIDE) {
      let walked = 0;
      let startDistance = 0;
      for (let index = 1; index < route.length; index += 1) {
        const segment = distanceBetween(route[index - 1], route[index]);
        if (projection.alongDistance <= walked + segment) {
          const ratio = segment > 0 ? (projection.alongDistance - walked) / segment : 0;
          startDistance = target.samples[index - 1].distance + (target.samples[index].distance - target.samples[index - 1].distance) * ratio;
          break;
        }
        walked += segment;
      }
      const startTime = targetTimeAtProgress(target, startDistance);
      const remaining = target.distance - startDistance;
      if (remaining <= 0) throw new TypeError('saved target has no remaining course');
      const samples = [{ ...target.samples[0], ...position, distance: 0, movingTime: 0 },
        ...target.samples.filter(sample => sample.distance > startDistance).map(sample => ({
          ...sample, distance: (sample.distance - startDistance) * distance / remaining,
          movingTime: Math.max(0, sample.movingTime - startTime),
        }))];
      startedTarget = { ...target, samples, distance, movingTime: samples.at(-1).movingTime };
    }
    return { route: startedRoute, target: startedTarget, distance, progressShift: projection.alongDistance - connector };
  }

  function createRaceSession({ route, target, currentMovingTime = 0 } = {}) {
    if (!Array.isArray(route) || route.length < 2 || !route.every(validPoint)) throw new TypeError('race route requires at least two valid points');
    if (!target || ![SAVED_RIDE, TARGET_SPEED].includes(target.type)) throw new TypeError('valid Racing target required');
    const baseline = Math.max(0, finite(currentMovingTime) ? currentMovingTime : 0);
    const raceRoute = route.map(point => ({ latitude: point.latitude, longitude: point.longitude }));
    return {
      route: raceRoute,
      routeDistance: routeDistance(raceRoute),
      target: target.accelerationMs ? { ...target, restartTimes: [0] } : target,
      lastMovingTime: baseline,
      raceElapsedTime: 0,
      progressBase: 0,
      targetProgressOffset: 0,
      lastCurrentProgress: 0,
      lastRouteMatchProgress: 0,
      routeMatchProgressOffset: 0,
      lastMatchedPosition: null,
      lastMatchedTimestamp: null,
      lastMatchedAccuracy: 0,
      activeRouteStartProgress: 0,
      routeVersions: [],
      rerouteSequence: 0,
    };
  }

  function targetPositionAtProgress(session, targetProgress) {
    const activeStart = finite(session.activeRouteStartProgress) ? session.activeRouteStartProgress : session.progressBase || 0;
    if (targetProgress >= activeStart) {
      return pointAtRouteDistance(session.route, targetProgress - (session.progressBase || 0));
    }
    const versions = Array.isArray(session.routeVersions) ? session.routeVersions : [];
    for (let index = versions.length - 1; index >= 0; index -= 1) {
      const version = versions[index];
      if (targetProgress >= version.activeStartProgress && targetProgress <= version.endProgress) {
        return pointAtRouteDistance(version.route, targetProgress - version.progressBase);
      }
    }
    const oldest = versions[0];
    return oldest
      ? pointAtRouteDistance(oldest.route, targetProgress - oldest.progressBase)
      : pointAtRouteDistance(session.route, targetProgress - (session.progressBase || 0));
  }

  function targetStateAtProgress(session, progress) {
    const targetRouteProgress = Math.max(0, Math.min((session.progressBase || 0) + session.routeDistance, progress));
    const targetPosition = targetPositionAtProgress(session, targetRouteProgress);
    const next = targetPositionAtProgress(session, targetRouteProgress + 1);
    const targetHeading = distanceBetween(targetPosition, next) > 0.01
      ? routeBearing(targetPosition, next)
      : routeBearing(targetPositionAtProgress(session, Math.max(0, targetRouteProgress - 1)), targetPosition);
    return { targetRouteProgress, targetPosition, targetHeading };
  }

  // A trailing target can still occupy a preserved segment after a reroute.
  function raceRoutePath(session, fromProgress = 0) {
    const activeStart = finite(session.activeRouteStartProgress) ? session.activeRouteStartProgress : session.progressBase || 0;
    const points = [];
    const sections = [...(session.routeVersions || []), {
      route: session.route, progressBase: session.progressBase || 0,
      activeStartProgress: activeStart, endProgress: (session.progressBase || 0) + session.routeDistance,
    }];
    for (const section of sections) {
      const start = Math.max(fromProgress, section.activeStartProgress);
      const end = section.endProgress;
      if (!finite(start) || !finite(end) || end <= start) continue;
      const localStart = start - section.progressBase;
      const localEnd = end - section.progressBase;
      points.push(pointAtRouteDistance(section.route, localStart));
      let walked = 0;
      for (let index = 1; index < section.route.length; index += 1) {
        walked += distanceBetween(section.route[index - 1], section.route[index]);
        if (walked > localStart && walked < localEnd) points.push(section.route[index]);
      }
      points.push(pointAtRouteDistance(section.route, localEnd));
    }
    return points.length ? points : [session.route.at(-1)];
  }

  function validRerouteBoundaries(boundaries) {
    if (!Array.isArray(boundaries) || boundaries.length < 2 || boundaries[0] !== 0) return false;
    return boundaries.every((value, index) => finite(value) && value >= 0 && (index === 0 || value > boundaries[index - 1]));
  }

  function mapRerouteOffset(targetOffset, oldBoundaries, newBoundaries) {
    if (targetOffset < 0) {
      const oldLength = oldBoundaries[1] - oldBoundaries[0];
      const newLength = newBoundaries[1] - newBoundaries[0];
      return targetOffset * (newLength / oldLength);
    }
    const oldEnd = oldBoundaries.at(-1);
    if (targetOffset >= oldEnd) return newBoundaries.at(-1);
    for (let index = 0; index < oldBoundaries.length - 1; index += 1) {
      if (targetOffset > oldBoundaries[index + 1]) continue;
      const oldLength = oldBoundaries[index + 1] - oldBoundaries[index];
      const newLength = newBoundaries[index + 1] - newBoundaries[index];
      const ratio = (targetOffset - oldBoundaries[index]) / oldLength;
      return newBoundaries[index] + ratio * newLength;
    }
    return newBoundaries.at(-1);
  }

  function updateRace(session, observation = {}) {
    if (observation.manuallyPaused === true) stopTargetSpeed(session);
    const suppliedMovingTime = finite(observation.currentMovingTime) ? Math.max(0, observation.currentMovingTime) : session.lastMovingTime;
    const monotonicMovingTime = Math.max(session.lastMovingTime, suppliedMovingTime);
    if (session.targetNeedsRestart && observation.manuallyPaused !== true && monotonicMovingTime > session.lastMovingTime) {
      if (session.target.restartTimes.at(-1) < session.raceElapsedTime) session.target.restartTimes.push(session.raceElapsedTime);
      session.targetNeedsRestart = false;
    }
    if (observation.manuallyPaused !== true) session.raceElapsedTime += monotonicMovingTime - session.lastMovingTime;
    session.lastMovingTime = monotonicMovingTime;

    const projected = finite(observation.currentProgressDistance)
      ? null
      : projectOnRoute(session.route, observation.currentPosition, {
        previousAlong: session.lastRouteMatchProgress,
        previousPosition: session.lastMatchedPosition,
        previousTimestamp: session.lastMatchedTimestamp,
        previousAccuracy: session.lastMatchedAccuracy,
        minimumAlong: finite(observation.minimumCurrentProgress)
          ? Math.max(0, observation.minimumCurrentProgress - (finite(session.progressBase) ? session.progressBase : 0))
          : null,
        maximumAlong: finite(observation.currentProgressLimit)
          ? Math.max(0, observation.currentProgressLimit - (finite(session.progressBase) ? session.progressBase : 0))
          : null,
        timestamp: observation.currentTimestamp,
        accuracy: observation.currentAccuracy ?? observation.currentPosition?.accuracy,
        speedMps: observation.currentSpeedMps,
        heading: observation.currentHeading,
      });
    if (projected?.anchorAccepted) {
      session.lastRouteMatchProgress = projected.matchAlongDistance;
      session.lastMatchedPosition = { latitude: observation.currentPosition.latitude, longitude: observation.currentPosition.longitude };
      session.lastMatchedTimestamp = finite(observation.currentTimestamp) ? observation.currentTimestamp : null;
      session.lastMatchedAccuracy = finite(observation.currentAccuracy ?? observation.currentPosition?.accuracy)
        ? Math.max(0, observation.currentAccuracy ?? observation.currentPosition.accuracy)
        : 0;
    }
    const routeStartProgress = finite(session.progressBase) ? session.progressBase : 0;
    if (projected?.reanchorWithoutCredit) {
      const currentProgress = finite(session.lastCurrentProgress) ? session.lastCurrentProgress : routeStartProgress;
      session.routeMatchProgressOffset = currentProgress - routeStartProgress - projected.matchAlongDistance;
    }
    const rawLocalProgress = finite(observation.currentProgressDistance)
      ? observation.currentProgressDistance
      : projected.alongDistance + (session.routeMatchProgressOffset || 0);
    const routeEndProgress = routeStartProgress + session.routeDistance;
    const rawCurrentProgress = routeStartProgress + Math.max(0, rawLocalProgress);
    const progressLimit = finite(observation.currentProgressLimit)
      ? Math.max(routeStartProgress, Math.min(routeEndProgress, observation.currentProgressLimit))
      : routeEndProgress;
    const currentRouteProgress = Math.min(progressLimit, Math.max(session.lastCurrentProgress || routeStartProgress, Math.min(routeEndProgress, rawCurrentProgress)));
    session.lastCurrentProgress = currentRouteProgress;
    const rawTargetProgress = targetProgressAtTime(session.target, session.raceElapsedTime) + (session.targetProgressOffset || 0);
    const targetRouteProgress = Math.max(0, Math.min(routeEndProgress, rawTargetProgress));
    const distanceDifference = currentRouteProgress - targetRouteProgress;
    const historicalTimeAtCurrentProgress = targetTimeAtProgress(session.target, Math.max(0, currentRouteProgress - (session.targetProgressOffset || 0)));
    const timeDifference = historicalTimeAtCurrentProgress - session.raceElapsedTime;
    const activeRouteStartProgress = finite(session.activeRouteStartProgress) ? session.activeRouteStartProgress : routeStartProgress;
    const { targetPosition, targetHeading } = targetStateAtProgress(session, targetRouteProgress);
    return {
      currentRouteProgress,
      targetRouteProgress,
      distanceDifference,
      timeDifference,
      historicalTimeAtCurrentProgress,
      status: distanceDifference > 0 ? 'ahead' : distanceDifference < 0 ? 'behind' : 'even',
      targetPosition,
      targetHeading,
      targetBeforeRouteStart: Math.max(0, activeRouteStartProgress - targetRouteProgress),
      offRouteDistance: projected?.offRouteDistance ?? 0,
      projectedPosition: projected?.projectedPoint || null,
      raceElapsedTime: session.raceElapsedTime,
    };
  }

  function rebaseRaceRoute(session, { route, currentPosition, snapshot, oldLength, newLength, oldBoundaries, newBoundaries, rerouteSequence } = {}) {
    if (!session || session.target?.type !== TARGET_SPEED || !Array.isArray(route) || route.length < 2 || !route.every(validPoint) || !snapshot) return false;
    const sequence = finite(rerouteSequence) ? rerouteSequence : (session.rerouteSequence || 0) + 1;
    if (sequence <= (session.rerouteSequence || 0)) return false;
    const suppliedBoundaries = oldBoundaries !== undefined || newBoundaries !== undefined;
    const previousBoundaries = suppliedBoundaries ? oldBoundaries : [0, oldLength];
    const nextBoundaries = suppliedBoundaries ? newBoundaries : [0, newLength];
    if (!validRerouteBoundaries(previousBoundaries)
      || !validRerouteBoundaries(nextBoundaries)
      || previousBoundaries.length !== nextBoundaries.length) return false;
    const nextRoute = route.map(point => ({ latitude: point.latitude, longitude: point.longitude }));
    const projection = projectOnRoute(nextRoute, currentPosition || nextRoute[0]);
    const currentProgress = Math.max(0, finite(snapshot.currentRouteProgress) ? snapshot.currentRouteProgress : session.lastCurrentProgress || 0);
    const targetProgress = Math.max(0, finite(snapshot.targetRouteProgress) ? snapshot.targetRouteProgress : targetProgressAtTime(session.target, session.raceElapsedTime));
    const previousRoute = session.route.map(point => ({ latitude: point.latitude, longitude: point.longitude }));
    const previousProgressBase = finite(session.progressBase) ? session.progressBase : 0;
    const previousActiveStart = finite(session.activeRouteStartProgress) ? session.activeRouteStartProgress : previousProgressBase;
    const oldGap = targetProgress - currentProgress;
    const mappedGap = mapRerouteOffset(oldGap, previousBoundaries, nextBoundaries);
    const desiredTargetProgress = currentProgress + mappedGap;
    const nextProgressBase = currentProgress - projection.alongDistance;
    const nextRouteDistance = routeDistance(nextRoute);
    const nextRouteEnd = nextProgressBase + nextRouteDistance;
    const correctedTargetProgress = Math.max(0, Math.min(nextRouteEnd, desiredTargetProgress));
    const correctionDistance = correctedTargetProgress - targetProgress;
    if (!Array.isArray(session.routeVersions)) session.routeVersions = [];
    session.routeVersions.push({
      route: previousRoute,
      progressBase: previousProgressBase,
      activeStartProgress: previousActiveStart,
      endProgress: currentProgress,
      sequence: session.rerouteSequence || 0,
    });
    session.route = nextRoute;
    session.routeDistance = nextRouteDistance;
    session.progressBase = nextProgressBase;
    session.activeRouteStartProgress = currentProgress;
    session.lastRouteMatchProgress = projection.alongDistance;
    session.routeMatchProgressOffset = 0;
    session.lastMatchedPosition = { latitude: (currentPosition || nextRoute[0]).latitude, longitude: (currentPosition || nextRoute[0]).longitude };
    session.lastMatchedTimestamp = null;
    session.lastMatchedAccuracy = 0;
    session.targetProgressOffset = (session.targetProgressOffset || 0) + correctionDistance;
    session.lastCurrentProgress = currentProgress;
    session.rerouteSequence = sequence;
    session.lastRerouteAdjustment = {
      sequence,
      currentProgress,
      oldLength: previousBoundaries[1],
      newLength: nextBoundaries[1],
      oldBoundaries: previousBoundaries.slice(),
      newBoundaries: nextBoundaries.slice(),
      scale: nextBoundaries[1] / previousBoundaries[1],
      oldGap,
      newGap: correctedTargetProgress - currentProgress,
      correctionDistance,
      targetProgressBefore: targetProgress,
      targetProgressAfter: correctedTargetProgress,
    };
    return true;
  }

  return {
    GHOST_DATA_VERSION,
    SAVED_RIDE,
    TARGET_SPEED,
    createRaceSession,
    createSavedRideTarget,
    createTargetSpeedTarget,
    stopTargetSpeed,
    pointAtRouteDistance,
    prepareRaceStart,
    projectOnRoute,
    raceRoutePath,
    rebaseRaceRoute,
    targetProgressAtTime,
    targetTimeAtProgress,
    targetStateAtProgress,
    updateRace,
  };
});
