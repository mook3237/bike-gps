const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateBestKilometer,
  createGpsSource,
  createRideSession,
  finishRide,
  ingestRideFix,
  pauseRide,
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
