(function exposeRideFoundation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateRide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRideFoundationApi() {
  const GPS_JUMP_MAX_M = 200;

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
      movingTimePath: 0,
    };
  }

  function resetMotionState(motion, resetPosition = true) {
    motion.speedWindow = [];
    motion.speedSamples = [];
    motion.moving = false;
    motion.filteredSpeed = 0;
    motion.distanceAnchor = null;
    motion.distancePath = 0;
    motion.movingTimePath = 0;
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

  function processMotionFix(motion, fix) {
    const position = { latitude: fix.latitude, longitude: fix.longitude };
    const timestamp = Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now();
    const distance = motion.lastPosition ? haversineDistance(motion.lastPosition, position) : 0;
    const elapsedMs = motion.lastTimestamp == null ? 0 : Math.max(0, timestamp - motion.lastTimestamp);
    const rawSpeed = resolveSpeed(fix, distance, elapsedMs);
    let acceptedDistance = 0;
    let acceptedMovingTime = 0;

    motion.speedWindow.push({ position, timestamp, accuracy: Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null });
    while (motion.speedWindow.length > 2 && timestamp - motion.speedWindow[0].timestamp > 6000) motion.speedWindow.shift();
    const evidence = movementWindowEvidence(motion.speedWindow);

    if (!motion.moving) {
      if (evidence.moving) {
        motion.moving = true;
        motion.speedSamples = [];
        motion.distanceAnchor = position;
        acceptedDistance = evidence.pathDistance;
        acceptedMovingTime = evidence.duration;
      }
    } else {
      motion.distancePath += Math.max(0, distance);
      motion.movingTimePath += elapsedMs;
      if (!evidence.moving && evidence.duration >= 5000) {
        motion.moving = false;
        motion.speedSamples = [];
        motion.filteredSpeed = 0;
        motion.distanceAnchor = position;
        motion.distancePath = 0;
        motion.movingTimePath = 0;
        motion.speedWindow = [{ position, timestamp, accuracy: Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null }];
      } else if (evidence.moving && motion.distanceAnchor && haversineDistance(motion.distanceAnchor, position) > evidence.uncertainty) {
        acceptedDistance = motion.distancePath;
        acceptedMovingTime = motion.movingTimePath;
        motion.distanceAnchor = position;
        motion.distancePath = 0;
        motion.movingTimePath = 0;
      }
    }

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
    return { position, timestamp, rawSpeed, speed: filteredSpeed, moving: motion.moving, acceptedDistance, acceptedMovingTime, evidence };
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

  function pauseRide(ride, now = Date.now()) {
    if (ride.recordingState !== 'recording') return false;
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

  function ingestRideFix(ride, fix) {
    if (!ride || ride.recordingState === 'idle' || ride.recordingState === 'completed') return null;
    const timestamp = Math.max(ride.startedAt, Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now());
    if (ride.recordingState === 'paused') {
      ride.detailedSamples.push({ ...fix, timestamp, recordingState: 'paused', moving: false, acceptedDistance: 0 });
      return null;
    }
    const result = processMotionFix(ride.motion, { ...fix, timestamp });
    ride.currentSpeed = result.speed;
    if (result.moving) ride.maxSpeed = Math.max(ride.maxSpeed, result.speed);
    if (result.acceptedDistance > 0) {
      ride.distance += result.acceptedDistance;
      ride.movingTime += result.acceptedMovingTime;
      ride.distanceHistory.push({ distance: ride.distance, movingTime: ride.movingTime });
      ride.routePoints.push({ latitude: result.position.latitude, longitude: result.position.longitude, timestamp: result.timestamp, distance: ride.distance });
    } else if (!ride.routePoints.length) {
      ride.routePoints.push({ latitude: result.position.latitude, longitude: result.position.longitude, timestamp: result.timestamp, distance: 0 });
    }
    ride.detailedSamples.push({ ...fix, timestamp, filteredSpeed: result.speed, moving: result.moving, acceptedDistance: result.acceptedDistance, acceptedMovingTime: result.acceptedMovingTime });
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
      route: completedRide.route.map(point => ({ ...point })),
      ...(retainDetailed ? { detailedSamples: completedRide.detailedSamples.map(sample => ({ ...sample })) } : {}),
    };
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

  function createGpsSource(geolocation, watchOptions = { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }) {
    const consumers = new Map();
    let watchId = null;
    let latest = null;
    let status = 'idle';
    function notifyStatus(next, error = null) {
      status = next;
      consumers.forEach(consumer => consumer.onStatus?.(status, error));
    }
    function ensureWatch() {
      if (watchId != null || !consumers.size) return;
      notifyStatus('requesting');
      watchId = geolocation.watchPosition(position => {
        const fix = normalizePosition(position);
        if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return;
        latest = fix;
        notifyStatus('ready');
        consumers.forEach(consumer => consumer.onFix(latest));
      }, error => {
        notifyStatus(error?.code === 1 ? 'denied' : 'error', error);
      }, watchOptions);
    }
    function subscribe(key, onFix, onStatus) {
      const consumer = typeof onFix === 'function' ? { onFix, onStatus } : onFix;
      consumers.set(key, consumer);
      consumer.onStatus?.(status);
      if (latest) consumer.onFix(latest);
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
    return { subscribe, unsubscribe, getLatest: () => latest, getStatus: () => status, getWatchId: () => watchId };
  }

  return {
    GPS_JUMP_MAX_M,
    calculateBestKilometer,
    createGpsSource,
    createMotionState,
    createRideSession,
    elapsedRideTime,
    finishRide,
    haversineDistance,
    ingestRideFix,
    movementWindowEvidence,
    pauseRide,
    permanentRideRecord,
    processMotionFix,
    resetMotionState,
    resolveSpeed,
    resumeRide,
    rideMetrics,
    startRide,
  };
});
