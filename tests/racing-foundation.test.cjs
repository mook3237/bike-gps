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

test('rerouting scales a behind target once and keeps it on the preserved route until A', () => {
  const oldRoute = [metersPoint(0), metersPoint(1500)];
  const race = Racing.createRaceSession({ route: oldRoute, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const before = Racing.updateRace(race, { currentProgressDistance: 500, currentMovingTime: 20000 });
  const rerouted = [metersPoint(500), metersPoint(1600)];
  const rebased = Racing.rebaseRaceRoute(race, { route: rerouted, currentPosition: rerouted[0], snapshot: before, oldLength: 1000, newLength: 1100, rerouteSequence: 1 });
  const frozen = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 20000 });
  const reachedA = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 108000 });

  assert.equal(rebased, true);
  assert.equal(frozen.raceElapsedTime, before.raceElapsedTime);
  assert.ok(Math.abs(frozen.targetRouteProgress - 60) < 0.5);
  assert.ok(Math.abs(frozen.distanceDifference - 440) < 0.5);
  assert.ok(Math.abs(frozen.targetPosition.longitude - metersPoint(60).longitude) < 1e-8);
  assert.notDeepEqual(frozen.targetPosition, rerouted[0]);
  assert.ok(Math.abs(reachedA.targetRouteProgress - 500) < 0.5);
  assert.ok(Math.abs(reachedA.targetPosition.longitude - rerouted[0].longitude) < 1e-8);
});

test('rerouting moves an ahead target to the scaled position on the new route without scaling twice', () => {
  const oldRoute = [metersPoint(0), metersPoint(1000)];
  const race = Racing.createRaceSession({ route: oldRoute, target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
  const before = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 60000 });
  const rerouted = [metersPoint(0), metersPoint(1100)];

  assert.equal(Racing.rebaseRaceRoute(race, { route: rerouted, currentPosition: rerouted[0], snapshot: before, oldLength: 1000, newLength: 1100, rerouteSequence: 1 }), true);
  const after = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 60000 });
  const resumed = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 61000 });

  assert.ok(Math.abs(after.targetRouteProgress - 660) < 0.5);
  assert.ok(Math.abs(after.targetPosition.longitude - metersPoint(660).longitude) < 1e-8);
  assert.ok(Math.abs(after.distanceDifference + 660) < 0.5);
  assert.ok(Math.abs(resumed.targetRouteProgress - 670) < 0.5);
});

test('rerouting applies signed scaling for shorter routes and consecutive route versions', () => {
  const ahead = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
  const aheadBefore = Racing.updateRace(ahead, { currentProgressDistance: 0, currentMovingTime: 60000 });
  Racing.rebaseRaceRoute(ahead, { route: [metersPoint(0), metersPoint(800)], currentPosition: metersPoint(0), snapshot: aheadBefore, oldLength: 1000, newLength: 800, rerouteSequence: 1 });
  const aheadAfter = Racing.updateRace(ahead, { currentProgressDistance: 0, currentMovingTime: 60000 });
  assert.ok(Math.abs(aheadAfter.targetRouteProgress - 480) < 0.5);

  Racing.rebaseRaceRoute(ahead, { route: [metersPoint(0), metersPoint(880)], currentPosition: metersPoint(0), snapshot: aheadAfter, oldLength: 800, newLength: 880, rerouteSequence: 2 });
  const consecutive = Racing.updateRace(ahead, { currentProgressDistance: 0, currentMovingTime: 60000 });
  assert.ok(Math.abs(consecutive.targetRouteProgress - 528) < 0.5);
  assert.equal(ahead.routeVersions.length, 2);

  const behind = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1000)], target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const behindBefore = Racing.updateRace(behind, { currentProgressDistance: 500, currentMovingTime: 20000 });
  Racing.rebaseRaceRoute(behind, { route: [metersPoint(500), metersPoint(1300)], currentPosition: metersPoint(500), snapshot: behindBefore, oldLength: 1000, newLength: 800, rerouteSequence: 1 });
  const behindAfter = Racing.updateRace(behind, { currentProgressDistance: 0, currentMovingTime: 20000 });
  assert.ok(Math.abs(behindAfter.targetRouteProgress - 180) < 0.5);
  assert.ok(Math.abs(behindAfter.distanceDifference - 320) < 0.5);
  assert.ok(Math.abs(behindAfter.targetPosition.longitude - metersPoint(180).longitude) < 1e-8);

  const even = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1000)], target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const evenBefore = Racing.updateRace(even, { currentProgressDistance: 100, currentMovingTime: 20000 });
  Racing.rebaseRaceRoute(even, { route: [metersPoint(100), metersPoint(1200)], currentPosition: metersPoint(100), snapshot: evenBefore, oldLength: 1000, newLength: 1100, rerouteSequence: 1 });
  assert.equal(even.lastRerouteAdjustment.correctionDistance, 0);
});

test('rerouting clamps a corrected target to the new finish and ignores duplicate sequences', () => {
  const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
  const before = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 90000 });
  const route = [metersPoint(0), metersPoint(500)];
  assert.equal(Racing.rebaseRaceRoute(race, { route, currentPosition: route[0], snapshot: before, oldLength: 1000, newLength: 2000, rerouteSequence: 7 }), true);
  const clamped = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 90000 });
  const offset = race.targetProgressOffset;
  assert.ok(Math.abs(clamped.targetRouteProgress - 500) < 0.5);
  assert.ok(Math.abs(clamped.targetPosition.longitude - route[1].longitude) < 1e-8);
  assert.equal(Racing.rebaseRaceRoute(race, { route, currentPosition: route[0], snapshot: clamped, oldLength: 1000, newLength: 2000, rerouteSequence: 7 }), false);
  assert.equal(race.targetProgressOffset, offset);
});

test('rerouting maps an ahead target within its matching checkpoint segment', () => {
  const cases = [
    { target: 600, oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250, 2250], want: 750 },
    { target: 1500, oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250, 2250], want: 1750 },
    { target: 1500, oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250, 2300], want: 1775 },
    { target: 1500, oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 800, 1800], want: 1300 },
    { target: 2500, oldBoundaries: [0, 1000, 2000, 3000], newBoundaries: [0, 1100, 2300, 3500], want: 2900 },
  ];
  for (const entry of cases) {
    const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(4000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
    const before = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: entry.target * 100 });
    const nextRoute = [metersPoint(0), metersPoint(entry.newBoundaries.at(-1))];
    assert.equal(Racing.rebaseRaceRoute(race, { route: nextRoute, currentPosition: nextRoute[0], snapshot: before, oldBoundaries: entry.oldBoundaries, newBoundaries: entry.newBoundaries, rerouteSequence: 1 }), true);
    const after = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: entry.target * 100 });
    assert.ok(Math.abs(after.targetRouteProgress - entry.want) < 0.5, JSON.stringify(entry));
    assert.ok(Math.abs(after.targetPosition.longitude - metersPoint(entry.want).longitude) * 111195 < 0.5, JSON.stringify(entry));
  }
});

test('rerouting handles exact boundaries and rejects mismatched or zero-length segments without mutation', () => {
  const exact = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(2000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
  const exactBefore = Racing.updateRace(exact, { currentProgressDistance: 0, currentMovingTime: 100000 });
  assert.equal(Racing.rebaseRaceRoute(exact, { route: [metersPoint(0), metersPoint(2250)], currentPosition: metersPoint(0), snapshot: exactBefore, oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250, 2250], rerouteSequence: 1 }), true);
  assert.ok(Math.abs(Racing.updateRace(exact, { currentProgressDistance: 0, currentMovingTime: 100000 }).targetRouteProgress - 1250) < 0.5);

  for (const invalid of [
    { oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250] },
    { oldBoundaries: [0, 0, 1000], newBoundaries: [0, 100, 1100] },
    { oldBoundaries: [0, 1000, 2000], newBoundaries: [0, 1250, 1200] },
  ]) {
    const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(2000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
    const before = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 60000 });
    const originalRoute = race.route;
    assert.equal(Racing.rebaseRaceRoute(race, { route: [metersPoint(0), metersPoint(2200)], currentPosition: metersPoint(0), snapshot: before, ...invalid, rerouteSequence: 1 }), false);
    assert.strictEqual(race.route, originalRoute);
    assert.equal(race.targetProgressOffset, 0);
  }
});

test('alternating reroutes use the immediately previous valid route for 3, 10, and 100 changes', () => {
  for (const count of [3, 10, 100]) {
    const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
    let snapshot = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 60000 });
    let oldLength = 1000;
    for (let sequence = 1; sequence <= count; sequence += 1) {
      const newLength = oldLength === 1000 ? 1250 : 1000;
      const route = [metersPoint(0), metersPoint(newLength)];
      assert.equal(Racing.rebaseRaceRoute(race, { route, currentPosition: route[0], snapshot, oldBoundaries: [0, oldLength], newBoundaries: [0, newLength], rerouteSequence: sequence }), true);
      snapshot = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 60000 });
      oldLength = newLength;
    }
    const want = count % 2 ? 750 : 600;
    assert.ok(Math.abs(snapshot.targetRouteProgress - want) < 0.5, `count=${count}`);
    assert.ok(Math.abs(snapshot.targetPosition.longitude - metersPoint(want).longitude) < 1e-8, `count=${count}`);
    assert.equal(race.routeVersions.length, count);
  }
});

test('a repeatedly rerouted behind target stays on the matching preserved version and can cross A', () => {
  const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(1500)], target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  let snapshot = Racing.updateRace(race, { currentProgressDistance: 500, currentMovingTime: 20000 });
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const oldLength = sequence % 2 ? 1000 : 1250;
    const newLength = sequence % 2 ? 1250 : 1000;
    const route = [metersPoint(500), metersPoint(500 + newLength)];
    assert.equal(Racing.rebaseRaceRoute(race, { route, currentPosition: route[0], snapshot, oldBoundaries: [0, oldLength], newBoundaries: [0, newLength], rerouteSequence: sequence }), true);
    snapshot = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 20000 });
    assert.notDeepEqual(snapshot.targetPosition, route[0]);
  }
  assert.ok(Math.abs(snapshot.targetRouteProgress - 0) < 0.5);
  const crossed = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 120000 });
  assert.ok(crossed.targetRouteProgress >= 500);
  assert.ok(crossed.targetPosition.longitude >= metersPoint(500).longitude);
});

test('normal rider and target progress can cross from ahead to behind and back across reroutes', () => {
  const race = Racing.createRaceSession({ route: [metersPoint(0), metersPoint(3000)], target: Racing.createTargetSpeedTarget(10), currentMovingTime: 0 });
  let snapshot = Racing.updateRace(race, { currentProgressDistance: 500, currentMovingTime: 100000 });
  assert.ok(snapshot.targetRouteProgress - snapshot.currentRouteProgress > 0);
  assert.equal(Racing.rebaseRaceRoute(race, { route: [metersPoint(500), metersPoint(3000)], currentPosition: metersPoint(500), snapshot, oldBoundaries: [0, 1000, 2500], newBoundaries: [0, 1250, 2500], rerouteSequence: 1 }), true);

  snapshot = Racing.updateRace(race, { currentProgressDistance: 1000, currentMovingTime: 100000 });
  assert.ok(snapshot.targetRouteProgress - snapshot.currentRouteProgress < 0);
  assert.equal(Racing.rebaseRaceRoute(race, { route: [metersPoint(1500), metersPoint(3000)], currentPosition: metersPoint(1500), snapshot, oldBoundaries: [0, 750, 1500], newBoundaries: [0, 600, 1500], rerouteSequence: 2 }), true);

  snapshot = Racing.updateRace(race, { currentProgressDistance: 1000, currentMovingTime: 240000 });
  assert.ok(snapshot.targetRouteProgress - snapshot.currentRouteProgress > 0);
  assert.ok(snapshot.targetPosition.longitude >= metersPoint(1500).longitude);
});

test('rerouting keeps every session route version needed by a later backward correction', () => {
  const initialRoute = [metersPoint(0), metersPoint(1500)];
  const race = Racing.createRaceSession({ route: initialRoute, target: Racing.createTargetSpeedTarget(6), currentMovingTime: 0 });
  let snapshot = Racing.updateRace(race, { currentProgressDistance: 500, currentMovingTime: 100000 });
  const firstReroute = [metersPoint(500), metersPoint(1500)];
  Racing.rebaseRaceRoute(race, { route: firstReroute, currentPosition: firstReroute[0], snapshot, oldBoundaries: [0, 1000], newBoundaries: [0, 1000], rerouteSequence: 1 });
  snapshot = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 100000 });
  assert.equal(race.routeVersions.length, 1);

  snapshot = Racing.updateRace(race, { currentProgressDistance: 300, currentMovingTime: 100000 });
  const secondReroute = [metersPoint(800), metersPoint(2200)];
  Racing.rebaseRaceRoute(race, { route: secondReroute, currentPosition: secondReroute[0], snapshot, oldBoundaries: [0, 700], newBoundaries: [0, 1400], rerouteSequence: 2 });
  const corrected = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: 100000 });

  assert.equal(race.routeVersions.length, 2);
  assert.ok(Math.abs(corrected.targetRouteProgress - 400) < 0.5);
  assert.ok(Math.abs(corrected.distanceDifference - 400) < 0.5);
  assert.ok(Math.abs(corrected.targetPosition.longitude - metersPoint(400).longitude) * 111195 < 0.5);
  assert.deepEqual(initialRoute, [metersPoint(0), metersPoint(1500)]);
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
