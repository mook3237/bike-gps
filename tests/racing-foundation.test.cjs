const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Racing = require('../racing-foundation.js');
const Ride = require('../ride-foundation.js');

const metersPoint = meters => ({ latitude: 0, longitude: meters / 111195 });
const raceRoute = [metersPoint(0), metersPoint(100), metersPoint(200)];

function savedRideTargetRecord() {
  return {
    ghostDataVersion: 1,
    route: [
      { ...metersPoint(0), timestamp: 1000, distance: 0, movingTime: 0, filteredSpeed: 0, moving: false },
      { ...metersPoint(100), timestamp: 11000, distance: 100, movingTime: 10000, filteredSpeed: 10, moving: true },
      { ...metersPoint(100), timestamp: 16000, distance: 100, movingTime: 10000, filteredSpeed: 0, moving: false },
      { ...metersPoint(200), timestamp: 36000, distance: 200, movingTime: 30000, filteredSpeed: 5, moving: true },
    ],
  };
}

test('saved ride target rejects old records without mutating them', () => {
  const oldRide = { distance: 200, route: [{ ...metersPoint(0), timestamp: 1000, distance: 0 }] };
  const before = JSON.stringify(oldRide);
  assert.equal(Racing.createSavedRideTarget(oldRide), null);
  assert.equal(JSON.stringify(oldRide), before);

  const backward = savedRideTargetRecord();
  backward.route[2].distance = 90;
  assert.equal(Racing.createSavedRideTarget(backward), null);
});

test('saved ride interpolation preserves historical variable-speed progress and duplicate samples', () => {
  const target = Racing.createSavedRideTarget(savedRideTargetRecord());
  assert.equal(target.type, 'SAVED_RIDE');
  assert.equal(Racing.targetProgressAtTime(target, 10000), 100);
  assert.equal(Racing.targetProgressAtTime(target, 20000), 150);
  assert.equal(Racing.targetTimeAtProgress(target, 150), 20000);
  assert.equal(Number.isFinite(Racing.targetProgressAtTime(target, 10000)), true);
  assert.equal(Number.isFinite(Racing.targetTimeAtProgress(target, 100)), true);
});

test('constant-speed target progresses along the route in canonical units', () => {
  const race = Racing.createRaceSession({ route: raceRoute, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const snapshot = Racing.updateRace(race, { currentProgressDistance: 80, currentMovingTime: 10000 });
  assert.ok(Math.abs(snapshot.targetRouteProgress - 50) < 0.1);
  assert.ok(Math.abs(snapshot.targetPosition.longitude - metersPoint(50).longitude) < 1e-8);
  assert.ok(Math.abs(snapshot.distanceDifference - 30) < 0.1);
  assert.ok(Math.abs(snapshot.timeDifference - 6000) < 1);
  assert.equal(snapshot.status, 'ahead');
});

test('shared Ride moving time advances, freezes while stopped or paused, and resumes without stopped time', () => {
  const race = Racing.createRaceSession({ route: raceRoute, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 5000 });
  const moving = Racing.updateRace(race, { currentProgressDistance: 20, currentMovingTime: 7000 });
  const stopped = Racing.updateRace(race, { currentProgressDistance: 20, currentMovingTime: 7000 });
  const paused = Racing.updateRace(race, { currentProgressDistance: 20, currentMovingTime: 9000, manuallyPaused: true });
  const backward = Racing.updateRace(race, { currentProgressDistance: 20, currentMovingTime: 8000 });
  const resumed = Racing.updateRace(race, { currentProgressDistance: 40, currentMovingTime: 11000 });

  assert.equal(moving.raceElapsedTime, 2000);
  assert.equal(stopped.raceElapsedTime, 2000);
  assert.equal(paused.raceElapsedTime, 2000);
  assert.equal(backward.raceElapsedTime, 2000);
  assert.equal(resumed.raceElapsedTime, 4000);
  assert.equal(resumed.targetRouteProgress, 20);
});

test('saved-ride comparison uses historical time at the current along-route progress', () => {
  const race = Racing.createRaceSession({ route: raceRoute, target: Racing.createSavedRideTarget(savedRideTargetRecord()), currentMovingTime: 0 });
  const ahead = Racing.updateRace(race, { currentPosition: metersPoint(150), currentMovingTime: 15000 });
  assert.ok(Math.abs(ahead.currentRouteProgress - 150) < 0.2);
  assert.ok(Math.abs(ahead.targetRouteProgress - 125) < 0.2);
  assert.ok(Math.abs(ahead.distanceDifference - 25) < 0.2);
  assert.ok(Math.abs(ahead.timeDifference - 5000) < 1);
  assert.equal(ahead.status, 'ahead');

  const behind = Racing.updateRace(race, { currentProgressDistance: 160, currentMovingTime: 26000 });
  assert.ok(behind.distanceDifference < 0);
  assert.ok(behind.timeDifference < 0);
  assert.equal(behind.status, 'behind');
});

test('Racing foundation owns no GPS watcher, Ride recorder, motion detector, or independent timer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'racing-foundation.js'), 'utf8');
  assert.doesNotMatch(source, /watchPosition|geolocation|createRideSession|ingestRideFix|processMotionFix|setInterval|setTimeout/);
});

test('Navigation and future Racing visuals share one FAST observation while official progress stays authoritative', () => {
  let starts=0,emit;
  const source=Ride.createGpsSource({
    watchPosition(success){starts+=1;emit=success;return 1},
    clearWatch(){},
  },undefined,{now:()=>1000});
  const visual=[];
  source.subscribe('navigation',(fix,fast)=>visual.push(['navigation',fast]));
  source.subscribe('racing-visual',(fix,fast)=>visual.push(['racing',fast]));
  emit({timestamp:1000,coords:{...metersPoint(100),accuracy:3,speed:10,heading:90}});

  const race=Racing.createRaceSession({route:raceRoute,target:Racing.createTargetSpeedTarget(5),currentMovingTime:0});
  const official=Racing.updateRace(race,{currentProgressDistance:0,currentMovingTime:0});
  assert.equal(starts,1);
  assert.strictEqual(visual[0][1],visual[1][1]);
  assert.equal(visual[0][1].position.longitude,metersPoint(100).longitude);
  assert.equal(official.currentRouteProgress,0);
});
