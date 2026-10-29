const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Racing = require('../racing-foundation.js');
const Ride = require('../ride-foundation.js');

const metersPoint = meters => ({ latitude: 0, longitude: meters / 111195 });
const metersPoint2D = (x, y) => ({ latitude: y / 111195, longitude: x / 111195 });
const raceRoute = [metersPoint(0), metersPoint(100), metersPoint(200)];

test('speed Ghost ramps for three seconds on start and restart with consistent distance and time comparison', () => {
  const target=Racing.createTargetSpeedTarget(30/3.6,3000);
  const session=Racing.createRaceSession({route:raceRoute,target});
  for(const time of [0,1000,2000,3000,5000]){
    const expected=time<3000?(30/3.6)*(time/1000)**2/6:(30/3.6)*(time/1000-1.5);
    assert.ok(Math.abs(Racing.targetProgressAtTime(session.target,time)-expected)<1e-8);
    assert.ok(Math.abs(Racing.targetTimeAtProgress(session.target,expected)-time)<1e-6);
  }
  Racing.updateRace(session,{currentMovingTime:5000,currentProgressDistance:20});
  const stopped=Racing.targetProgressAtTime(session.target,5000);
  Racing.stopTargetSpeed(session);Racing.stopTargetSpeed(session);
  Racing.updateRace(session,{currentMovingTime:5000,currentProgressDistance:20,manuallyPaused:true});
  assert.equal(Racing.targetProgressAtTime(session.target,5000),stopped);
  Racing.updateRace(session,{currentMovingTime:6000,currentProgressDistance:20});
  assert.deepEqual(session.target.restartTimes,[0,5000]);
  const restarted=Racing.targetProgressAtTime(session.target,6000);
  assert.ok(Math.abs(restarted-stopped-(30/3.6)/6)<1e-8);
  for(const time of [5500,6000,8000,10000])assert.ok(Math.abs(Racing.targetTimeAtProgress(session.target,Racing.targetProgressAtTime(session.target,time))-time)<1e-6);
  assert.deepEqual(target.restartTimes,[0],'session must not change the target used for another challenge');
  assert.equal(Racing.targetProgressAtTime(Racing.createTargetSpeedTarget(5),1000),5);
});

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

test('round trip start matches the outbound leg when the return leg is closer', () => {
  const route = [metersPoint2D(0, 0), metersPoint2D(900, 0), metersPoint2D(0, 10)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5) });
  const start = Racing.updateRace(race, {
    currentPosition: metersPoint2D(0, 10),
    currentMovingTime: 0,
    currentProgressLimit: 900,
  });
  assert.ok(start.currentRouteProgress < 20);
  assert.ok(start.distanceDifference < 20);
});

test('race preparation starts both riders at the real GPS and rebases only the outbound prefix', () => {
  const route=[metersPoint2D(0,0),metersPoint2D(1000,0),metersPoint2D(0,10)];
  const before=JSON.stringify(route),position=metersPoint2D(100,9);
  const prepared=Racing.prepareRaceStart(route,Racing.createTargetSpeedTarget(5),position,1000);
  assert.deepEqual(prepared.route[0],position);
  assert.ok(prepared.progressShift>80&&prepared.progressShift<110);
  assert.deepEqual(prepared.route.at(-1),route.at(-1));
  const session=Racing.createRaceSession(prepared);
  const snapshot=Racing.updateRace(session,{currentPosition:position,currentMovingTime:0,currentProgressLimit:0});
  assert.deepEqual(snapshot.targetPosition,position);
  assert.equal(snapshot.currentRouteProgress,0);
  assert.equal(snapshot.targetRouteProgress,0);
  assert.equal(snapshot.distanceDifference,0);
  assert.equal(JSON.stringify(route),before);
});

test('saved target start rebases historical time and distance without editing the saved record', () => {
  const record=savedRideTargetRecord(),before=JSON.stringify(record);
  const target=Racing.createSavedRideTarget(record);
  const prepared=Racing.prepareRaceStart(record.route,target,metersPoint(50));
  const session=Racing.createRaceSession(prepared);
  const start=Racing.updateRace(session,{currentProgressDistance:0,currentMovingTime:0});
  const later=Racing.updateRace(session,{currentProgressDistance:0,currentMovingTime:10000});
  assert.equal(start.targetRouteProgress,0);
  assert.deepEqual(start.targetPosition,metersPoint(50));
  assert.ok(Math.abs(later.targetRouteProgress-75)<0.2);
  assert.ok(Math.abs(prepared.target.movingTime-25000)<1);
  assert.equal(JSON.stringify(record),before);
});

test('round trip phase bounds clip matching inside a segment and keep both riders on the full 2000m course', () => {
  const route = [0, 1000, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5) });
  const observe = (meters, time, options) => Racing.updateRace(race, {
    currentPosition: metersPoint(meters), currentMovingTime: time,
    currentTimestamp: time, currentAccuracy: 3, ...options,
  });
  assert.equal(observe(10, 0, { currentProgressLimit: 0 }).currentRouteProgress, 0);
  let outbound;
  for (let meters = 100; meters <= 500; meters += 100) outbound = observe(meters, meters * 200, { currentProgressLimit: 1000 });
  assert.ok(Math.abs(outbound.currentRouteProgress - 500) < 0.01);
  assert.ok(Math.abs(outbound.targetRouteProgress - 500) < 0.01);
  for (let meters = 600; meters <= 1000; meters += 100) observe(meters, meters * 200, { currentProgressLimit: 1000 });
  let returning;
  for (let meters = 900; meters >= 500; meters -= 100) returning = observe(meters, (2000 - meters) * 200, { minimumCurrentProgress: 1000 });
  assert.ok(Math.abs(returning.currentRouteProgress - 1500) < 0.01);
  assert.ok(Math.abs(returning.targetRouteProgress - 1500) < 0.01);
  let finish;
  for (let meters = 400; meters >= 0; meters -= 100) finish = observe(meters, (2000 - meters) * 200, { minimumCurrentProgress: 1000 });
  assert.ok(Math.abs(finish.currentRouteProgress - 2000) < 0.01);
  assert.ok(Math.abs(finish.targetRouteProgress - 2000) < 0.01);
  for (const [time, sign] of [[350000, 1], [450000, -1]]) {
    const contender = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5) });
    const result = Racing.updateRace(contender, { currentProgressDistance: contender.routeDistance, currentMovingTime: time });
    assert.equal(Math.sign(result.timeDifference), sign);
  }
});

test('virtual rider heading follows north outbound and south return including the finish', () => {
  const route = [metersPoint2D(0, 0), metersPoint2D(0, 1000), metersPoint2D(0, 0)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5) });
  for (const [time, heading] of [[0, 0], [100000, 0], [300000, 180], [400001, 180]]) {
    const snapshot = Racing.updateRace(race, { currentProgressDistance: 0, currentMovingTime: time });
    assert.ok(Math.abs(snapshot.targetHeading - heading) < 0.01);
  }
});

test('GPS map matching advances through the return leg of an out-and-back route', () => {
  const route = [0, 100, 200, 100, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0, movingTime: 0 },
    { meters: 100, timestamp: 20000, movingTime: 20000 },
    { meters: 200, timestamp: 40000, movingTime: 40000 },
    { meters: 150, timestamp: 50000, movingTime: 50000 },
    { meters: 100, timestamp: 60000, movingTime: 60000 },
    { meters: 50, timestamp: 70000, movingTime: 70000 },
    { meters: 0, timestamp: 80000, movingTime: 80000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 200, 250, 300, 350, 400]);
});

test('GPS map matching recognizes the return leg when the turnaround sample is skipped', () => {
  const route = [metersPoint(0), metersPoint(200), metersPoint(0)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0 },
    { meters: 100, timestamp: 20000 },
    { meters: 190, timestamp: 38000 },
    { meters: 185, timestamp: 43000 },
    { meters: 180, timestamp: 44000 },
    { meters: 100, timestamp: 60000 },
    { meters: 0, timestamp: 80000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.timestamp,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 190, 215, 220, 300, 400]);
});

test('a long GPS gap cannot infer progress from speed multiplied by the gap', () => {
  const route = [metersPoint(0), metersPoint(200), metersPoint(0)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const observe = (timestamp, meters = 0) => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(meters), accuracy: 3 },
    currentMovingTime: timestamp,
    currentTimestamp: timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  });

  observe(0);
  const afterGap = observe(80000);
  const repeated = observe(81000);
  const resumed = observe(82000, 5);

  assert.equal(Math.round(afterGap.currentRouteProgress), 0);
  assert.equal(Math.round(repeated.currentRouteProgress), 0);
  assert.equal(Math.round(resumed.currentRouteProgress), 5);
});

test('same-position GPS resumes never credit a closed-route lap across gaps, speeds, or accuracy levels', () => {
  const gaps = [5000, 15000, 29000, 30000, 31000, 80000];
  const speeds = [0, 5, 15];
  const accuracies = [3, 10, 30, 40, 50];

  for (const gap of gaps) {
    for (const speed of speeds) {
      for (const accuracy of accuracies) {
        const route = [metersPoint(0), metersPoint(200), metersPoint(0)];
        const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
        const observe = (timestamp) => Racing.updateRace(race, {
          currentPosition: { ...metersPoint(0), accuracy },
          currentMovingTime: timestamp,
          currentTimestamp: timestamp,
          currentAccuracy: accuracy,
          currentSpeedMps: speed,
        });

        observe(0);
        const resumedAtSameLocation = observe(gap);
        assert.equal(Math.round(resumedAtSameLocation.currentRouteProgress), 0, `gap=${gap}, speed=${speed}, accuracy=${accuracy}`);
      }
    }
  }
});

test('a long GPS gap at a unique forward point stays uncredited until new movement is observed', () => {
  const route = [metersPoint(0), metersPoint(200), metersPoint(400)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const observe = (timestamp, meters) => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(meters), accuracy: 3 },
    currentMovingTime: timestamp,
    currentTimestamp: timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  });

  observe(0, 0);
  const afterGap = observe(80000, 200);
  const repeated = observe(81000, 200);
  const resumed = observe(82000, 205);

  assert.equal(Math.round(afterGap.currentRouteProgress), 0);
  assert.equal(Math.round(repeated.currentRouteProgress), 0);
  assert.equal(Math.round(resumed.currentRouteProgress), 5);
});

test('wide GPS accuracy near a repeated turnaround coordinate does not jump to the finish', () => {
  const route = [metersPoint(0), metersPoint(200), metersPoint(0)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0 },
    { meters: 150, timestamp: 30000 },
    { meters: 190, timestamp: 38000 },
    { meters: 185, timestamp: 43000 },
  ];
  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 40 },
    currentMovingTime: fix.timestamp,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 40,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.equal(Math.round(progress.at(-1)), 215);
});

test('GPS map matching does not enter the return leg when reversing before the turnaround', () => {
  const route = [0, 100, 200, 100, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0, movingTime: 0 },
    { meters: 100, timestamp: 20000, movingTime: 20000 },
    { meters: 180, timestamp: 36000, movingTime: 36000 },
    { meters: 140, timestamp: 44000, movingTime: 44000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 180, 180]);
});

test('GPS map matching keeps moving forward through a repeated crossing coordinate', () => {
  const route = [metersPoint2D(-100, 0), metersPoint2D(0, 0), metersPoint2D(100, 0), metersPoint2D(0, 0), metersPoint2D(0, 100)];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { position: metersPoint2D(-100, 0), timestamp: 0, movingTime: 0 },
    { position: metersPoint2D(0, 0), timestamp: 20000, movingTime: 20000 },
    { position: metersPoint2D(100, 0), timestamp: 40000, movingTime: 40000 },
    { position: metersPoint2D(0, 0), timestamp: 60000, movingTime: 60000 },
    { position: metersPoint2D(0, 100), timestamp: 80000, movingTime: 80000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...fix.position, accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 200, 300, 400]);
});

test('GPS map matching completes a closed loop at its repeated start coordinate only after traversing the loop', () => {
  const route = [
    metersPoint2D(0, 0),
    metersPoint2D(100, 0),
    metersPoint2D(100, 100),
    metersPoint2D(0, 100),
    metersPoint2D(0, 0),
  ];
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { position: metersPoint2D(0, 0), timestamp: 0 },
    { position: metersPoint2D(100, 0), timestamp: 20000 },
    { position: metersPoint2D(100, 100), timestamp: 40000 },
    { position: metersPoint2D(0, 100), timestamp: 60000 },
    { position: metersPoint2D(0, 0), timestamp: 80000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...fix.position, accuracy: 3 },
    currentMovingTime: fix.timestamp,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 200, 300, 400]);
});

test('GPS noise near the turnaround does not pin progress to the outbound segment', () => {
  const route = [0, 100, 200, 100, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0, movingTime: 0 },
    { meters: 100, timestamp: 20000, movingTime: 20000 },
    { meters: 195, timestamp: 39000, movingTime: 39000 },
    { meters: 198, timestamp: 40000, movingTime: 40000 },
    { meters: 196, timestamp: 41000, movingTime: 41000 },
    { meters: 190, timestamp: 43000, movingTime: 43000 },
    { meters: 150, timestamp: 51000, movingTime: 51000 },
    { meters: 100, timestamp: 61000, movingTime: 61000 },
    { meters: 50, timestamp: 71000, movingTime: 71000 },
    { meters: 0, timestamp: 81000, movingTime: 81000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.slice(-5).map(value => Math.round(value)), [210, 250, 300, 350, 400]);
});

test('GPS spike cannot teleport progress to a distant repeated route segment', () => {
  const route = [0, 100, 200, 100, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const fixes = [
    { meters: 0, timestamp: 0, movingTime: 0 },
    { meters: 100, timestamp: 20000, movingTime: 20000 },
    { meters: 200, timestamp: 40000, movingTime: 40000 },
    { meters: 0, timestamp: 41000, movingTime: 41000 },
    { meters: 150, timestamp: 51000, movingTime: 51000 },
  ];

  const progress = fixes.map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }).currentRouteProgress);

  assert.deepEqual(progress.map(value => Math.round(value)), [0, 100, 200, 200, 250]);
});

test('GPS map matching remains aligned to progressBase after rerouting from a return leg', () => {
  const originalRoute = [0, 100, 200, 100, 0].map(metersPoint);
  const race = Racing.createRaceSession({ route: originalRoute, target: Racing.createTargetSpeedTarget(5), currentMovingTime: 0 });
  const beforeReroute = [
    { meters: 0, timestamp: 0, movingTime: 0 },
    { meters: 100, timestamp: 20000, movingTime: 20000 },
    { meters: 200, timestamp: 40000, movingTime: 40000 },
    { meters: 150, timestamp: 50000, movingTime: 50000 },
  ].map(fix => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(fix.meters), accuracy: 3 },
    currentMovingTime: fix.movingTime,
    currentTimestamp: fix.timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  }));
  const rerouted = [150, 250, 350].map(metersPoint);

  assert.equal(Racing.rebaseRaceRoute(race, {
    route: rerouted,
    currentPosition: metersPoint(150),
    snapshot: beforeReroute.at(-1),
    oldBoundaries: [0, 100],
    newBoundaries: [0, 100],
    rerouteSequence: 1,
  }), true);

  const afterReroute = Racing.updateRace(race, {
    currentPosition: { ...metersPoint(200), accuracy: 3 },
    currentMovingTime: 60000,
    currentTimestamp: 60000,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  });

  assert.equal(Math.round(afterReroute.currentRouteProgress), 300);
  assert.ok(Math.abs(race.progressBase - 250) < 0.01);
  assert.equal(race.routeVersions.length, 1);
});

test('GPS map matching remains continuous through three reroutes on an out-and-back return leg', () => {
  const race = Racing.createRaceSession({
    route: [metersPoint(0), metersPoint(200), metersPoint(0)],
    target: Racing.createTargetSpeedTarget(5),
    currentMovingTime: 0,
  });
  const observe = (meters, timestamp) => Racing.updateRace(race, {
    currentPosition: { ...metersPoint(meters), accuracy: 3 },
    currentMovingTime: timestamp,
    currentTimestamp: timestamp,
    currentAccuracy: 3,
    currentSpeedMps: 5,
  });
  observe(0, 0);
  observe(200, 20000);
  let snapshot = observe(150, 30000);

  for (const [sequence, start, nextMeters, timestamp] of [
    [1, 150, 120, 36000],
    [2, 120, 100, 40000],
    [3, 100, 50, 50000],
  ]) {
    assert.equal(Racing.rebaseRaceRoute(race, {
      route: [metersPoint(start), metersPoint(0)],
      currentPosition: metersPoint(start),
      snapshot,
      oldBoundaries: [0, 100],
      newBoundaries: [0, 100],
      rerouteSequence: sequence,
    }), true);
    snapshot = observe(nextMeters, timestamp);
  }

  const finish = observe(0, 60000);
  assert.ok(Math.abs(snapshot.currentRouteProgress - 350) < 0.01);
  assert.ok(Math.abs(finish.currentRouteProgress - 400) < 0.01);
  assert.equal(race.routeVersions.length, 3);
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
