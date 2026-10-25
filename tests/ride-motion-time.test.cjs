const test = require('node:test');
const assert = require('node:assert/strict');
const Ride = require('../ride-foundation.js');
const Racing = require('../racing-foundation.js');

function recording() {
  let receive, now = 100000;
  const source = Ride.createGpsSource({
    watchPosition(callback) { receive = callback; return 1; },
    clearWatch() {},
  }, undefined, { now: () => now });
  const ride = Ride.createRideSession();
  Ride.startRide(ride, now);
  const race = Racing.createRaceSession({
    route: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 3000 / 111195 }],
    target: Racing.createTargetSpeedTarget(20 / 3.6), currentMovingTime: 0,
  });
  const rows = [];
  source.subscribe('recording', { onFix(fix, fast) {
    const motion = Ride.ingestRideFix(ride, fix, fast);
    if (motion?.moving && fast.quality.fresh && fast.quality.monotonic && fast.quality.plausiblePosition) {
      Racing.updateRace(race, { currentPosition: fix, currentMovingTime: ride.movingTime,
        currentTimestamp: fix.timestamp, currentAccuracy: fix.accuracy, currentSpeedMps: fix.speed });
    }
    rows.push({ motion, movingTime: ride.movingTime, ghostTime: race.raceElapsedTime,
      ghostDistance: Racing.targetProgressAtTime(race.target, race.raceElapsedTime) });
  } });
  return { ride, race, rows, send(seconds, meters, speed = 5, accuracy = 3, receivedSeconds = seconds) {
    now = 100000 + Math.round(receivedSeconds * 1000);
    receive({ timestamp: 100000 + Math.round(seconds * 1000),
      coords: { latitude: 0, longitude: meters / 111195, speed, accuracy, heading: 90 } });
    return rows.at(-1);
  } };
}

test('Ghost moving time advances on every evidenced fix without waiting for distance approval', () => {
  const run = recording();
  for (let sec = 0; sec <= 20; sec++) {
    const row = run.send(sec, sec * 15 / 3.6, 15 / 3.6, 15);
    if (sec >= 5) {
      assert.equal(row.movingTime, sec * 1000, `ride at ${sec}s`);
      assert.equal(row.ghostTime, sec * 1000, `Ghost at ${sec}s`);
      assert.ok(Math.abs(row.ghostDistance - sec * 50 / 9) < 1e-6);
    }
  }
});

test('ten seconds riding then ten stopped then one riding credits eleven seconds', () => {
  const run = recording();
  for (let sec = 0; sec <= 10; sec++) run.send(sec, sec * 5);
  for (let sec = 11; sec <= 20; sec++) run.send(sec, 50, 0);
  assert.equal(run.ride.movingTime, 10000);
  const resumed = run.send(21, 55);
  assert.equal(resumed.movingTime, 11000);
  assert.equal(resumed.ghostTime, 11000);
  assert.ok(Math.abs(resumed.ghostDistance - 61.1111111111) < 1e-6);
});

test('restart confirmation retains only moving intervals across GPS cadences', () => {
  for (const step of [100, 500, 1000, 2000]) {
    const run = recording();
    for (let ms = 0; ms <= 20000; ms += step) {
      run.send(ms / 1000, Math.min(ms / 1000, 10) * 5, ms <= 10000 ? 5 : 0);
    }
    for (let ms = step; ms < 1000; ms += step) run.send(20 + ms / 1000, 50 + ms / 1000 * 5);
    const resumed = run.send(21, 55);
    assert.equal(resumed.movingTime, 11000, `cadence ${step}ms`);
    assert.equal(resumed.ghostTime, 11000);
  }
  const slow = recording();
  for (let sec = 0; sec <= 10; sec++) slow.send(sec, sec * 5);
  for (let sec = 11; sec <= 20; sec++) slow.send(sec, 50, 0);
  for (let sec = 21; sec <= 24; sec++) slow.send(sec, 50 + sec - 20, 1);
  assert.equal(slow.ride.movingTime, 14000);
  assert.equal(slow.race.raceElapsedTime, 14000);
});

test('an eighty-second GPS outage is never credited on the following moving fixes', () => {
  const run = recording();
  for (let sec = 0; sec <= 20; sec++) run.send(sec, sec * 5);
  run.send(100, 100, 0);
  run.send(101, 105);
  const recovered = run.send(102, 110);
  assert.equal(recovered.movingTime, 22000);
  assert.equal(recovered.ghostTime, 22000);
  assert.ok(Math.abs(recovered.ghostDistance - 122.2222222222) < 1e-6);
  assert.equal(run.ride.detailedSamples.length, 24);
});

test('GPS cadence changes do not change twenty seconds of evidenced riding or Ghost time', () => {
  const cases = [100, 500, 1000, 2000].map(step => Array.from({ length: 20000 / step + 1 }, (_, i) => i * step));
  cases.push([0, 200, 1100, 2400, 3000, 4700, 5100, 6800, 7900, 9300, 10000, 11900, 13300, 14500, 16100, 17000, 18800, 20000]);
  for (const times of cases) {
    const run = recording();
    for (const ms of times) run.send(ms / 1000, ms / 1000 * 15 / 3.6, 15 / 3.6, 15);
    assert.equal(run.ride.movingTime, 20000, JSON.stringify(times));
    assert.equal(run.race.raceElapsedTime, 20000);
    assert.ok(Math.abs(run.rows.at(-1).ghostDistance - 111.1111111111) < 1e-6);
    assert.equal(run.ride.detailedSamples.length, times.length);
  }
});

test('thirty seconds of slow continuous riding does not lose short GPS intervals', () => {
  for (const speed of [1, 5 / 3.6, 15 / 3.6]) {
    const run = recording();
    run.send(0, 0, speed);
    for (let sec = 0; sec < 30; sec++) {
      run.send(sec + 0.1, (sec + 0.1) * speed, speed);
      run.send(sec + 1, (sec + 1) * speed, speed);
    }
    assert.equal(run.ride.movingTime, 30000, `rider speed ${speed}m/s`);
    assert.equal(run.race.raceElapsedTime, 30000);
    assert.ok(Math.abs(run.rows.at(-1).ghostDistance - 166.6666666667) < 1e-6);
    assert.equal(run.ride.detailedSamples.length, 61);
  }
});

test('stale and inaccurate GPS stays in raw samples without contaminating accepted time', () => {
  for (const kind of ['stale', 'inaccurate']) {
    const run = recording();
    for (let sec = 0; sec <= 10; sec++) run.send(sec, sec * 5);
    const rejected = run.send(11, 55, 5, kind === 'inaccurate' ? 100 : 3, kind === 'stale' ? 16 : 11);
    assert.equal(rejected.movingTime, 10000, kind);
    assert.equal(rejected.motion.acceptedMovingTime, 0, kind);
    const raw = run.ride.detailedSamples.at(-1);
    assert.equal(raw.timestamp, 111000);
    assert.equal(raw.longitude, 55 / 111195);
    assert.equal(raw.accuracy, kind === 'inaccurate' ? 100 : 3);
    assert.equal(raw.acceptedMovingTime, 0);
    for (let sec = 17; sec <= 19; sec++) run.send(sec, 60 + (sec - 17) * 5);
    assert.equal(run.ride.movingTime, 12000, kind);
    assert.equal(run.race.raceElapsedTime, 12000, kind);
    assert.equal(run.ride.detailedSamples.length, 15);
  }
});

test('duplicate and reversed GPS is preserved but never counted twice', () => {
  const run = recording();
  for (let sec = 0; sec <= 10; sec++) run.send(sec, sec * 5);
  run.send(10, 50, 5, 3, 10.1);
  run.send(9, 45, 5, 3, 10.2);
  assert.equal(run.ride.movingTime, 10000);
  const next = run.send(11, 55);
  assert.equal(next.movingTime, 11000);
  assert.equal(next.ghostTime, 11000);
  assert.equal(run.ride.detailedSamples.length, 14);
});

test('an invalid first GPS fix is retained as raw evidence without anchoring the accepted route', () => {
  for (const kind of ['stale', 'inaccurate']) {
    const run = recording();
    run.send(0, 50, 5, kind === 'inaccurate' ? 100 : 3, kind === 'stale' ? 5 : 0);
    assert.equal(run.ride.detailedSamples.length, 1);
    assert.equal(run.ride.detailedSamples[0].longitude, 50 / 111195);
    assert.equal(run.ride.movingTime, 0);
    assert.equal(run.ride.routePoints.length, 0, kind);
  }
});

test('elapsed time and a reported speed alone do not turn stationary GPS jitter into moving time', () => {
  const run = recording();
  for (let sec = 0; sec <= 20; sec++) run.send(sec, sec % 2, 5, 15);
  assert.equal(run.ride.movingTime, 0);
  assert.equal(run.race.raceElapsedTime, 0);
  assert.equal(run.ride.distance, 0);
  assert.equal(run.ride.detailedSamples.length, 21);
});

test('measured stops with small GPS jitter do not keep adding moving time', () => {
  const run = recording();
  for (let sec = 0; sec <= 10; sec++) run.send(sec, sec * 5);
  for (let sec = 11; sec <= 20; sec++) run.send(sec, 50 + (sec % 2 ? 0.3 : -0.3), 0);
  assert.equal(run.ride.movingTime, 10000);
  assert.equal(run.race.raceElapsedTime, 10000);
});
