const test = require('node:test');
const assert = require('node:assert/strict');
const Ride = require('../ride-foundation.js');

const history = rows => rows.map(([distance, movingTime]) => ({ distance, movingTime }));
function checkTotals(splits, distance, time) {
  assert.ok(Math.abs(splits.reduce((sum, s) => sum + s.distanceM, 0) - distance) < 1e-8);
  assert.ok(Math.abs(splits.reduce((sum, s) => sum + s.movingTimeMs, 0) - time) < 1e-8);
}

test('kilometer splits use exact boundaries and keep the final 400m at its actual length', () => {
  const splits = Ride.calculateKilometerSplits(history([[0,0],[1000,200000],[2000,450000],[2400,550000]]),2400,550000);
  assert.deepEqual(splits.map(s=>[s.startDistanceM,s.endDistanceM,s.distanceM,s.movingTimeMs,s.averageSpeedMps,s.paceMsPerKm]),
    [[0,1000,1000,200000,5,200000],[1000,2000,1000,250000,4,250000],[2000,2400,400,100000,4,250000]]);
  assert.ok(splits.every(s=>!s.startBoundaryInterpolated&&!s.endBoundaryInterpolated));
  checkTotals(splits,2400,550000);
  assert.equal(Ride.calculateKilometerSplits(history([[0,0],[1000,200000]]),1000,200000).length,1);
});

test('kilometer splits interpolate credited cumulative time across one or several boundaries', () => {
  const splits=Ride.calculateKilometerSplits(history([[0,0],[900,180000],[1100,220000],[2400,480000]]),2400,480000);
  assert.deepEqual(splits.map(s=>s.movingTimeMs),[200000,200000,80000]);
  assert.equal(splits[0].endBoundaryInterpolated,true);
  assert.equal(splits[1].startBoundaryInterpolated,true);
  const batch=Ride.calculateKilometerSplits(history([[0,0],[3500,700000]]),3500,700000);
  assert.deepEqual(batch.map(s=>s.movingTimeMs),[200000,200000,200000,100000]);
  checkTotals(batch,3500,700000);
});

test('kilometer splits retain sub-kilometer rides and time credited before batched distance', () => {
  const splits=Ride.calculateKilometerSplits(history([[0,0],[0,1000],[400,101000]]),400,101000);
  assert.equal(splits.length,1);
  assert.equal(splits[0].distanceM,400);
  assert.equal(splits[0].movingTimeMs,101000);
  assert.equal(splits[0].paceMsPerKm,252500);
  assert.deepEqual(Ride.calculateKilometerSplits([],0,1000),[]);
  // A completed record can have its last credited time after its last distance batch.
  checkTotals(Ride.calculateKilometerSplits(history([[0,0],[1000,200000],[1000,201000]]),1000,201000),1000,201000);
});

test('kilometer splits respect recorder stops, pauses, rejected fixes and GPS gaps without adding credit', () => {
  const ride=Ride.startRide(Ride.createRideSession(),100000);
  const send=(sec,meters,speed=5,accuracy=3)=>Ride.ingestRideFix(ride,{timestamp:100000+sec*1000,latitude:0,longitude:meters/111195,speed,accuracy});
  for(let sec=0;sec<=20;sec++)send(sec,sec*5);
  const snapshot=()=>({distance:ride.distance,movingTime:ride.movingTime});
  const before=snapshot();
  for(let sec=21;sec<=30;sec++)send(sec,100,0);
  assert.deepEqual(snapshot(),before);
  Ride.pauseRide(ride,131000);send(40,150);Ride.resumeRide(ride,150000);
  assert.deepEqual(snapshot(),before);
  for(let sec=51;sec<=60;sec++)send(sec,100+(sec-50)*5);
  const preGap=snapshot();send(140,500);assert.deepEqual(snapshot(),preGap);
  const preBad=snapshot();const rejected=send(141,510,5,100);
  assert.equal(rejected.rejectedReason,'inaccurate');assert.deepEqual(snapshot(),preBad);
  for(let sec=142;sec<=150;sec++)send(sec,510+(sec-141)*5);
  const record=Ride.permanentRideRecord(Ride.finishRide(ride,250000),{retainDetailed:true});
  checkTotals(record.kilometerSplits,ride.distance,ride.movingTime);
  assert.ok(record.movingTime<50000);
  assert.deepEqual(record.kilometerSplits,Ride.calculateKilometerSplits(ride.distanceHistory,ride.distance,ride.movingTime));
});
