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

  function projectOnRoute(route, position) {
    if (!Array.isArray(route) || !route.length || !validPoint(position)) {
      return { alongDistance: 0, totalDistance: 0, offRouteDistance: Infinity, projectedPoint: null };
    }
    let walked = 0;
    let bestAlong = 0;
    let bestDistance = Infinity;
    let projectedPoint = route[0];
    for (let index = 1; index < route.length; index += 1) {
      const start = route[index - 1];
      const end = route[index];
      const segment = distanceBetween(start, end);
      const latitudeScale = Math.cos(((start.latitude + end.latitude + position.latitude) / 3) * Math.PI / 180);
      const vectorX = (end.longitude - start.longitude) * latitudeScale;
      const vectorY = end.latitude - start.latitude;
      const pointX = (position.longitude - start.longitude) * latitudeScale;
      const pointY = position.latitude - start.latitude;
      const denominator = vectorX * vectorX + vectorY * vectorY;
      const ratio = denominator ? Math.max(0, Math.min(1, (pointX * vectorX + pointY * vectorY) / denominator)) : 0;
      const projected = {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
      const offRouteDistance = distanceBetween(position, projected);
      if (offRouteDistance < bestDistance) {
        bestDistance = offRouteDistance;
        bestAlong = walked + segment * ratio;
        projectedPoint = projected;
      }
      walked += segment;
    }
    return { alongDistance: bestAlong, totalDistance: walked, offRouteDistance: bestDistance, projectedPoint };
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

  function createTargetSpeedTarget(speedMps) {
    if (!finite(speedMps) || speedMps <= 0) throw new TypeError('speedMps must be greater than zero');
    return { type: TARGET_SPEED, speedMps };
  }

  function targetProgressAtTime(target, movingTime) {
    const time = Math.max(0, finite(movingTime) ? movingTime : 0);
    if (target.type === TARGET_SPEED) return target.speedMps * (time / 1000);
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
    if (target.type === TARGET_SPEED) return distance / target.speedMps * 1000;
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

  function createRaceSession({ route, target, currentMovingTime = 0 } = {}) {
    if (!Array.isArray(route) || route.length < 2 || !route.every(validPoint)) throw new TypeError('race route requires at least two valid points');
    if (!target || ![SAVED_RIDE, TARGET_SPEED].includes(target.type)) throw new TypeError('valid Racing target required');
    const baseline = Math.max(0, finite(currentMovingTime) ? currentMovingTime : 0);
    const raceRoute = route.map(point => ({ latitude: point.latitude, longitude: point.longitude }));
    return {
      route: raceRoute,
      routeDistance: routeDistance(raceRoute),
      target,
      lastMovingTime: baseline,
      raceElapsedTime: 0,
    };
  }

  function updateRace(session, observation = {}) {
    const suppliedMovingTime = finite(observation.currentMovingTime) ? Math.max(0, observation.currentMovingTime) : session.lastMovingTime;
    const monotonicMovingTime = Math.max(session.lastMovingTime, suppliedMovingTime);
    if (observation.manuallyPaused !== true) session.raceElapsedTime += monotonicMovingTime - session.lastMovingTime;
    session.lastMovingTime = monotonicMovingTime;

    const projected = finite(observation.currentProgressDistance)
      ? null
      : projectOnRoute(session.route, observation.currentPosition);
    const rawCurrentProgress = finite(observation.currentProgressDistance)
      ? observation.currentProgressDistance
      : projected.alongDistance;
    const currentRouteProgress = Math.max(0, Math.min(session.routeDistance, rawCurrentProgress));
    const targetRouteProgress = Math.max(0, Math.min(session.routeDistance, targetProgressAtTime(session.target, session.raceElapsedTime)));
    const distanceDifference = currentRouteProgress - targetRouteProgress;
    const historicalTimeAtCurrentProgress = targetTimeAtProgress(session.target, currentRouteProgress);
    const timeDifference = historicalTimeAtCurrentProgress - session.raceElapsedTime;
    return {
      currentRouteProgress,
      targetRouteProgress,
      distanceDifference,
      timeDifference,
      historicalTimeAtCurrentProgress,
      status: distanceDifference > 0 ? 'ahead' : distanceDifference < 0 ? 'behind' : 'even',
      targetPosition: pointAtRouteDistance(session.route, targetRouteProgress),
      raceElapsedTime: session.raceElapsedTime,
    };
  }

  return {
    GHOST_DATA_VERSION,
    SAVED_RIDE,
    TARGET_SPEED,
    createRaceSession,
    createSavedRideTarget,
    createTargetSpeedTarget,
    pointAtRouteDistance,
    projectOnRoute,
    targetProgressAtTime,
    targetTimeAtProgress,
    updateRace,
  };
});
