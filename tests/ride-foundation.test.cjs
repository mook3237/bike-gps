const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GHOST_DATA_VERSION,
  calculateBestKilometer,
  createFastObservationState,
  createNavigationArrivalState,
  createGpsSource,
  createRideSession,
  discardRide,
  ensureRideStarted,
  evaluateNavigationArrival,
  finishRide,
  ingestRideFix,
  pauseRide,
  permanentRideRecord,
  processFastObservation,
  rideMetrics,
  resumeRide,
  startRide,
} = require('../ride-foundation.js');

function pointAtMeters(meters, timestamp, speed = 10, accuracy = 3) {
  return { latitude: 0, longitude: meters / 111195, timestamp, speed, accuracy, heading: 90 };
}

test('shared GPS source keeps one native watcher for multiple consumers', () => {
  let starts = 0;
  const cleared = [];
  let success;
  const geolocation = {
    watchPosition(onSuccess) { starts += 1; success = onSuccess; return 41; },
    clearWatch(id) { cleared.push(id); },
  };
  const source = createGpsSource(geolocation);
  const fixes = [];
  const stopNavigation = source.subscribe('navigation', fix => fixes.push(['navigation', fix.longitude]));
  const stopBoard = source.subscribe('riding-board', fix => fixes.push(['board', fix.longitude]));

  assert.equal(starts, 1);
  success({ timestamp: 1234, coords: { latitude: 37, longitude: 127, accuracy: 4, speed: 5, heading: 80 } });
  assert.deepEqual(fixes, [['navigation', 127], ['board', 127]]);
  assert.equal(source.getLatest().longitude, 127);
  success({ timestamp: 1500, coords: { latitude: NaN, longitude: 128, accuracy: 4, speed: 5, heading: 80 } });
  assert.equal(source.getLatest().longitude, 127);
  assert.deepEqual(fixes, [['navigation', 127], ['board', 127]]);
  stopBoard();
  assert.deepEqual(cleared, []);
  stopNavigation();
  assert.deepEqual(cleared, [41]);
});

test('FAST observation reacts immediately to acceleration deceleration and stop', () => {
  const state = createFastObservationState();
  const accelerate = processFastObservation(state, pointAtMeters(0, 1000, 8), 1000);
  const decelerate = processFastObservation(state, pointAtMeters(4, 2000, 2), 2000);
  const stop = processFastObservation(state, pointAtMeters(4, 3000, 0), 3000);

  assert.deepEqual([accelerate.speed.mps, decelerate.speed.mps, stop.speed.mps], [8, 2, 0]);
  assert.deepEqual([accelerate.speed.source, decelerate.speed.source, stop.speed.source], ['gps', 'gps', 'gps']);
  assert.equal(stop.speed.valid, true);
});

test('FAST observation derives speed from consecutive usable positions without a confirmation window', () => {
  const state = createFastObservationState();
  const first = processFastObservation(state, pointAtMeters(0, 1000, null), 1000);
  const second = processFastObservation(state, pointAtMeters(10, 2000, null), 2000);

  assert.equal(first.speed.valid, false);
  assert.equal(second.speed.source, 'position-derived');
  assert.ok(second.speed.mps > 9.9 && second.speed.mps < 10.1);
});

test('FAST observation flags stale non-monotonic and impossible position jumps without poisoning its anchor', () => {
  const state = createFastObservationState();
  const first = processFastObservation(state, pointAtMeters(0, 10000, null, 3), 10000);
  const jump = processFastObservation(state, pointAtMeters(1000, 11000, null, 3), 11000);
  const recovered = processFastObservation(state, pointAtMeters(10, 12000, null, 3), 12000);
  const stale = processFastObservation(state, pointAtMeters(11, 9000, null, 3), 13001);

  assert.deepEqual(first.quality, { fresh: true, monotonic: true, plausiblePosition: true });
  assert.equal(jump.quality.plausiblePosition, false);
  assert.equal(recovered.quality.plausiblePosition, true);
  assert.ok(recovered.speed.mps > 4.9 && recovered.speed.mps < 5.1);
  assert.equal(stale.quality.fresh, false);
  assert.equal(stale.quality.monotonic, false);
});

test('one native fix exposes the same FAST observation to every consumer with one watcher', () => {
  let starts = 0;
  let success;
  const geolocation = {
    watchPosition(onSuccess) { starts += 1; success = onSuccess; return 7; },
    clearWatch() {},
  };
  const source = createGpsSource(geolocation, undefined, { now: () => 5000 });
  const observations = [];
  source.subscribe('ride', (fix, fast) => observations.push(['ride', fix, fast]));
  source.subscribe('navigation', (fix, fast) => observations.push(['navigation', fix, fast]));
  success({ timestamp: 5000, coords: { latitude: 37, longitude: 127, accuracy: 3, speed: 6, heading: 90 } });

  assert.equal(starts, 1);
  assert.equal(observations.length, 2);
  assert.strictEqual(observations[0][1], observations[1][1]);
  assert.strictEqual(observations[0][2], observations[1][2]);
  assert.strictEqual(source.getLatestFast(), observations[0][2]);
  assert.equal(observations[0][2].sequence, 1);
});

test('replayed FAST observation recalculates age and freshness without starting another watcher', () => {
  let now=1000,success,starts=0;
  const source=createGpsSource({watchPosition(onSuccess){starts+=1;success=onSuccess;return 1},clearWatch(){}},undefined,{now:()=>now});
  source.subscribe('ride',()=>{});
  success({timestamp:1000,coords:{latitude:37,longitude:127,accuracy:3,speed:5,heading:90}});
  now=5001;
  let replay;
  source.subscribe('navigation',(fix,fast)=>{replay=fast});
  assert.equal(starts,1);
  assert.equal(replay.ageMs,4001);
  assert.equal(replay.quality.fresh,false);
});

test('ride session starts zeroed and excludes stationary time from moving metrics', () => {
  const ride = createRideSession();
  startRide(ride, 0);
  [
    pointAtMeters(0, 0),
    pointAtMeters(20, 2000),
    pointAtMeters(40, 4000),
    pointAtMeters(40, 6000, 0),
    pointAtMeters(40, 8000, 0),
    pointAtMeters(40, 10000, 0),
    pointAtMeters(40, 12000, 0),
  ].forEach(fix => ingestRideFix(ride, fix));

  const metrics = rideMetrics(ride, 12000);
  assert.equal(metrics.elapsedTime, 12000);
  assert.ok(metrics.distance > 35 && metrics.distance < 45);
  assert.equal(metrics.movingTime, 4000);
  assert.equal(metrics.stoppedTime, 8000);
  assert.ok(metrics.averageMovingSpeed > 9 && metrics.averageMovingSpeed < 11);
});

test('manual pause is excluded from elapsed time and never contributes movement', () => {
  const ride = createRideSession();
  startRide(ride, 1000);
  pauseRide(ride, 5000);
  ingestRideFix(ride, pointAtMeters(500, 7000));
  resumeRide(ride, 9000);
  assert.equal(rideMetrics(ride, 11000).elapsedTime, 6000);
  assert.equal(rideMetrics(ride, 11000).movingTime, 0);
});

test('a cached GPS fix establishes the start anchor without adding pre-recording time', () => {
  const ride = createRideSession();
  startRide(ride, 1000);
  ingestRideFix(ride, pointAtMeters(0, 500));
  assert.equal(ride.detailedSamples[0].timestamp, 1000);
});

test('best 1 km is unavailable before 1000m and uses an interpolated continuous distance segment', () => {
  assert.equal(calculateBestKilometer([
    { distance: 0, movingTime: 0 },
    { distance: 999, movingTime: 120000 },
  ]), null);

  assert.equal(calculateBestKilometer([
    { distance: 0, movingTime: 0 },
    { distance: 600, movingTime: 120000 },
    { distance: 1200, movingTime: 180000 },
  ]), 140000);
});

test('final ride separates permanent summary, simplified route, and temporary samples', () => {
  const ride = createRideSession();
  startRide(ride, 1000);
  [pointAtMeters(0, 1000), pointAtMeters(20, 3000), pointAtMeters(40, 5000)].forEach(fix => ingestRideFix(ride, fix));
  const completed = finishRide(ride, 6000);

  assert.equal(completed.summary.startedAt, new Date(1000).toISOString());
  assert.equal(completed.summary.endedAt, new Date(6000).toISOString());
  assert.ok(Array.isArray(completed.route));
  assert.ok(Array.isArray(completed.detailedSamples));
  assert.ok(completed.detailedSamples.length >= 3);
  assert.equal(ride.recordingState, 'completed');
});

test('permanent ride keeps a versioned monotonic Ghost route without raw detailed samples', () => {
  const ride = createRideSession();
  startRide(ride, 0);
  [
    pointAtMeters(0, 0),
    pointAtMeters(20, 2000),
    pointAtMeters(40, 4000),
    pointAtMeters(40, 6000, 0),
    pointAtMeters(40, 8000, 0),
    pointAtMeters(40, 10000, 0),
  ].forEach(fix => ingestRideFix(ride, fix));

  const record = permanentRideRecord(finishRide(ride, 11000));

  assert.equal(record.ghostDataVersion, GHOST_DATA_VERSION);
  assert.equal('detailedSamples' in record, false);
  assert.ok(record.route.length >= 2);
  for (const sample of record.route) {
    assert.equal(Number.isFinite(sample.latitude), true);
    assert.equal(Number.isFinite(sample.longitude), true);
    assert.equal(Number.isFinite(sample.timestamp), true);
    assert.equal(Number.isFinite(sample.distance), true);
    assert.equal(Number.isFinite(sample.movingTime), true);
    assert.equal(Number.isFinite(sample.filteredSpeed), true);
    assert.equal(typeof sample.moving, 'boolean');
  }
  for (let index = 1; index < record.route.length; index += 1) {
    assert.ok(record.route[index].distance >= record.route[index - 1].distance);
    assert.ok(record.route[index].movingTime >= record.route[index - 1].movingTime);
  }
  assert.ok(record.route.some(sample => sample.moving === false));
});

test('one shared ride starts once and later features join without resetting it', () => {
  const ride = createRideSession();
  assert.equal(ensureRideStarted(ride, 1000), true);
  ride.distance = 321;
  assert.equal(ensureRideStarted(ride, 5000), false);
  assert.equal(ride.startedAt, 1000);
  assert.equal(ride.distance, 321);
});

test('discard clears finalized temporary ride data', () => {
  const ride = createRideSession();
  startRide(ride, 1000);
  ingestRideFix(ride, pointAtMeters(0, 1000));
  finishRide(ride, 2000);
  discardRide(ride);
  assert.equal(ride.recordingState, 'idle');
  assert.equal(ride.completed, null);
  assert.deepEqual(ride.routePoints, []);
  assert.deepEqual(ride.detailedSamples, []);
});

test('motion exposes the beginning of the same low-motion period and resets it on movement', () => {
  const ride = createRideSession();
  startRide(ride, 0);
  [pointAtMeters(0, 0), pointAtMeters(20, 1000), pointAtMeters(40, 2000)].forEach(fix => ingestRideFix(ride, fix));
  [pointAtMeters(40, 3000, 0), pointAtMeters(40, 4000, 0), pointAtMeters(40, 5000, 0)].forEach(fix => ingestRideFix(ride, fix));
  assert.equal(ride.motion.stationaryCandidateSince, 3000);
  ingestRideFix(ride, pointAtMeters(80, 6000));
  assert.equal(ride.motion.stationaryCandidateSince, null);
});

test('arrival needs three candidate fixes spanning two seconds and stable low motion', () => {
  let detector = createNavigationArrivalState();
  const observe = (timestamp, distance, extra = {}) => {
    const result = evaluateNavigationArrival(detector, {
      timestamp,
      selectedDistance: distance,
      routeEndDistance: distance,
      endpointOffset: 0,
      remainingRouteDistance: distance,
      accuracy: 3,
      moving: false,
      stationaryCandidateSince: 1000,
      ...extra,
    });
    detector = result.state;
    return result;
  };
  assert.equal(observe(1000, 2).arrived, false);
  assert.equal(observe(2000, 2).arrived, false);
  assert.equal(observe(3000, 2).arrived, true);
});

test('arrival rejects jitter, traffic-light stops, and poor off-route fixes', () => {
  let detector = createNavigationArrivalState();
  const observations = [
    { timestamp: 0, selectedDistance: 2, routeEndDistance: 2, endpointOffset: 0, remainingRouteDistance: 2, accuracy: 3, moving: false, stationaryCandidateSince: 0 },
    { timestamp: 1000, selectedDistance: 30, routeEndDistance: 30, endpointOffset: 0, remainingRouteDistance: 30, accuracy: 3, moving: false, stationaryCandidateSince: 0 },
    { timestamp: 2000, selectedDistance: 2, routeEndDistance: 2, endpointOffset: 0, remainingRouteDistance: 2, accuracy: 20, moving: true, stationaryCandidateSince: null },
    { timestamp: 3000, selectedDistance: 2, routeEndDistance: 2, endpointOffset: 0, remainingRouteDistance: 200, accuracy: 50, moving: false, stationaryCandidateSince: 0 },
  ];
  for (const observation of observations) {
    const result = evaluateNavigationArrival(detector, observation);
    detector = result.state;
    assert.equal(result.arrived, false);
  }
});

test('arrival confirms a closest-point passage only after movement away exceeds uncertainty', () => {
  let detector = createNavigationArrivalState();
  const distances = [12, 6, 2, 2, 2, 4, 6];
  let arrived = false;
  distances.forEach((distance, index) => {
    const result = evaluateNavigationArrival(detector, {
      timestamp: index * 1000,
      selectedDistance: distance,
      routeEndDistance: distance,
      endpointOffset: 0,
      remainingRouteDistance: Math.min(distance, 3),
      accuracy: 3,
      moving: true,
      stationaryCandidateSince: null,
    });
    detector = result.state;
    arrived ||= result.arrived;
  });
  assert.equal(arrived, true);
});

test('arrival accepts a legitimate route endpoint offset from the selected pin', () => {
  let detector = createNavigationArrivalState();
  let result;
  for (let timestamp = 0; timestamp <= 2000; timestamp += 1000) {
    result = evaluateNavigationArrival(detector, {
      timestamp,
      selectedDistance: 18,
      routeEndDistance: 2,
      endpointOffset: 20,
      remainingRouteDistance: 2,
      accuracy: 3,
      moving: false,
      stationaryCandidateSince: 0,
    });
    detector = result.state;
  }
  assert.equal(result.arrived, true);
});
