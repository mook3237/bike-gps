const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./profile-browser-flow.cjs');

test('real IndexedDB best-record transactions', { timeout: 60000 }, async t => {
  await run({ check: async evaluate => {
    await evaluate(`(async () => {
      const api = RideMateProfiles;
      globalThis.atomicStoreA = api.createIndexedRecordStore(indexedDB);
      globalThis.atomicStoreB = api.createIndexedRecordStore(indexedDB);
      globalThis.atomicA = api.createProfileRepository(localStorage, {recordStore: atomicStoreA});
      atomicA.initialize(); await atomicA.initializeRecords();
      globalThis.atomicOwner = atomicA.getProfiles()[0].id;
      globalThis.atomicOther = atomicA.addProfile('other').id;
      globalThis.atomicB = api.createProfileRepository(localStorage, {recordStore: atomicStoreB});
      atomicB.initialize(); await atomicB.initializeRecords();
      globalThis.raceRecord = (name, time, offset=0) => ({name, courseId:'same-id', completed:true,
        distance:100, movingTime:time, ghostDataVersion:1,
        route:[{latitude:37+offset,longitude:127,timestamp:1000,distance:0,movingTime:0,moving:false,filteredSpeed:0},
          {latitude:37+offset,longitude:127.001,timestamp:1000+time,distance:100,movingTime:time,moving:true,filteredSpeed:100000/time}],
        detailedSamples:[{timestamp:1000,accuracy:3},{timestamp:1000+time,accuracy:8}]});
      globalThis.saveAtomic = (repo, record, owner=atomicOwner) => repo.prependRacing(owner, record, {sameCourse:recordsShareCourse});
      globalThis.resetAtomic = async () => {
        await atomicStoreA.write([], (await atomicStoreA.readAll()).map(entry=>entry.key));
        await atomicA.refreshRecords(); await atomicB.refreshRecords();
      };
    })()`);

    await t.test('overlapping independent repositories retain fastest in either start order; ties keep incumbent', async () => {
      for (const times of [[9000,8000],[8000,9000],[8000,8000]]) {
        const result = await evaluate(`(async () => {
          await resetAtomic(); await saveAtomic(atomicA,raceRecord('incumbent',10000));
          const first=saveAtomic(atomicA,raceRecord('first',${times[0]}));
          const second=saveAtomic(atomicB,raceRecord('second',${times[1]}));
          const outcomes=await Promise.allSettled([first,second]);
          const entries=await atomicStoreB.readAll();
          return {records:entries.map(e=>({name:e.value.record.name,time:e.value.record.movingTime})), statuses:outcomes.map(o=>o.status)};
        })()`);
        assert.equal(result.records.length, 1);
        assert.equal(result.records[0].time, 8000);
        if (times[0] === times[1]) {
          assert.equal(result.records[0].name, 'first');
          assert.deepEqual(result.statuses, ['fulfilled','rejected']);
        }
      }
      const existingTie = await evaluate(`(async()=>{
        await resetAtomic(); await saveAtomic(atomicA,raceRecord('incumbent',8000));
        const results=await Promise.allSettled([saveAtomic(atomicA,raceRecord('a',8000)),saveAtomic(atomicB,raceRecord('b',8000))]);
        return {statuses:results.map(r=>r.status),names:(await atomicStoreA.readAll()).map(e=>e.value.record.name)};
      })()`);
      assert.deepEqual(existingTie, {statuses:['rejected','rejected'],names:['incumbent']});
    });

    await t.test('slower and equal records are rejected; distinct geometry and profiles coexist', async () => {
      const result = await evaluate(`(async()=>{
        await resetAtomic(); await saveAtomic(atomicA,raceRecord('original',8000));
        const rejected=[];
        for(const time of [9000,8000]) {try{await saveAtomic(atomicB,raceRecord('slower',time));rejected.push(false)}catch{rejected.push(true)}}
        await saveAtomic(atomicB,raceRecord('different course',10000,.1));
        await saveAtomic(atomicB,raceRecord('different profile',10000),atomicOther);
        return {rejected,names:(await atomicStoreA.readAll()).map(e=>e.value.record.name).sort()};
      })()`);
      assert.deepEqual(result, {rejected:[true,true],names:['different course','different profile','original']});
    });

    await t.test('put/delete errors and abort after both requests completely roll back and preserve cache', async () => {
      for (const failure of ['put','delete','commit']) {
        const result = await evaluate(`(async()=>{
          await resetAtomic(); const old=raceRecord('original',10000); await saveAtomic(atomicA,old);
          const before=JSON.stringify(await atomicStoreA.readAll()),cache=JSON.stringify(atomicA.readRacing(atomicOwner));
          const original=IDBDatabase.prototype.transaction, calls=[];
          IDBDatabase.prototype.transaction=function(...args){
            const tx=original.apply(this,args);
            if(args[1]==='readwrite'){
              const objectStore=tx.objectStore.bind(tx);
              tx.objectStore=(name)=>{
                const store=objectStore(name),put=store.put.bind(store),del=store.delete.bind(store);
                store.put=(entry)=>{calls.push('put');const request=put(entry);if('${failure}'==='put')throw Error('forced put failure');return request};
                store.delete=(key)=>{calls.push('delete');const request=del(key);if('${failure}'==='delete')throw Error('forced delete failure');
                  if('${failure}'==='commit')request.onsuccess=()=>{calls.push('abort-before-commit');tx.abort()};return request};
                return store;
              };
            }
            return tx;
          };
          let rejected=false;try{await saveAtomic(atomicA,raceRecord('new',8000))}catch{rejected=true}finally{IDBDatabase.prototype.transaction=original}
          const after=await atomicStoreB.readAll(),restored=after[0].value.record;
          const ghost=Racing.createSavedRideTarget(restored);
          return {rejected,calls,unchanged:before===JSON.stringify(after),cacheUnchanged:cache===JSON.stringify(atomicA.readRacing(atomicOwner)),
            fullRecordPreserved:JSON.stringify(restored)===JSON.stringify(old),ghostProgress:Racing.targetProgressAtTime(ghost,5000)};
        })()`);
        assert.equal(result.rejected, true, failure);
        assert.equal(result.unchanged, true, failure);
        assert.equal(result.cacheUnchanged, true, failure);
        assert.equal(result.fullRecordPreserved, true, failure);
        assert.equal(result.ghostProgress, 50, failure);
        if (failure === 'commit') assert.deepEqual(result.calls, ['put','delete','abort-before-commit']);
      }
    });

    await t.test('native asynchronous duplicate-key ConstraintError aborts and preserves stored record, cache and Ghost', async () => {
      const result = await evaluate(`(async()=>{
        await resetAtomic(); const old=raceRecord('original',10000);await saveAtomic(atomicA,old);
        const before=await atomicStoreA.readAll(),cache=JSON.stringify(atomicA.readRacing(atomicOwner));
        const original=IDBDatabase.prototype.transaction,calls=[];
        let requestError=null,nativeError=false,aborted=false,committed=false,putSucceeded=false,abortDone;
        const abortedPromise=new Promise(resolve=>{abortDone=resolve});
        IDBDatabase.prototype.transaction=function(...args){
          const tx=original.apply(this,args);
          if(args[1]==='readwrite'){
            tx.addEventListener('abort',()=>{aborted=true;abortDone()});
            tx.addEventListener('complete',()=>{committed=true;abortDone()});
            const objectStore=tx.objectStore.bind(tx);
            tx.objectStore=name=>{
              const store=objectStore(name),put=store.put.bind(store),add=store.add.bind(store),del=store.delete.bind(store);
              store.put=entry=>{
                calls.push('put');const request=put(entry);
                request.addEventListener('success',()=>{putSucceeded=true});
                // Native add of an existing primary key fails asynchronously, without changing the schema.
                const duplicate=add(before[0]);calls.push('duplicate-add');
                duplicate.addEventListener('error',event=>{requestError=duplicate.error.name;nativeError=event.isTrusted});
                return request;
              };
              store.delete=key=>{calls.push('delete');return del(key)};
              return store;
            };
          }
          return tx;
        };
        let rejected=false;try{await saveAtomic(atomicA,raceRecord('new',8000))}catch{rejected=true}
        finally{IDBDatabase.prototype.transaction=original}
        await abortedPromise;
        const freshStore=RideMateProfiles.createIndexedRecordStore(indexedDB),after=await freshStore.readAll();
        const restored=after[0].value.record,ghost=Racing.createSavedRideTarget(restored);
        return {rejected,requestError,nativeError,aborted,committed,putSucceeded,calls,
          unchanged:JSON.stringify(after)===JSON.stringify(before),fullRecordPreserved:JSON.stringify(restored)===JSON.stringify(old),
          cacheUnchanged:JSON.stringify(atomicA.readRacing(atomicOwner))===cache,
          ghostProgress:Racing.targetProgressAtTime(ghost,5000)};
      })()`);
      assert.deepEqual(result,{rejected:true,requestError:'ConstraintError',nativeError:true,aborted:true,committed:false,
        putSucceeded:true,calls:['put','duplicate-add','delete'],unchanged:true,fullRecordPreserved:true,cacheUnchanged:true,ghostProgress:50});
    });

    await t.test('successful replacement and reopening preserve the entire path, detailed samples and Ghost', async () => {
      const result=await evaluate(`(async()=>{
        await resetAtomic();await saveAtomic(atomicA,raceRecord('old',10000));
        const best=raceRecord('best',8000);await saveAtomic(atomicB,best);
        const reopened=RideMateProfiles.createProfileRepository(localStorage,{recordStore:RideMateProfiles.createIndexedRecordStore(indexedDB)});
        await reopened.initializeRecords();const records=reopened.readRacing(atomicOwner),ghost=Racing.createSavedRideTarget(records[0]);
        return {count:records.length,preserved:JSON.stringify(records[0])===JSON.stringify(best),progress:Racing.targetProgressAtTime(ghost,4000)};
      })()`);
      assert.deepEqual(result,{count:1,preserved:true,progress:50});
    });
    await t.test('kilometer splits follow actual normal and racing IndexedDB save paths independently of Ghost', async () => {
      const result=await evaluate(`(async()=>{
        await resetAtomic();
        const buildRide=()=>{
          const ride=Ride.startRide(Ride.createRideSession(),100000);
          for(let sec=0;sec<=480;sec++)Ride.ingestRideFix(ride,{timestamp:100000+sec*1000,latitude:0,longitude:sec*5/111195,speed:5,accuracy:8});
          return ride;
        };
        const ride=buildRide(),raceRide=structuredClone(ride),beforeHistory=JSON.stringify(ride.distanceHistory);
        profileRepository=atomicA;activeProfileId=atomicOther;rideOwnerProfileId=atomicOther;
        state.ride=ride;finishRideRecording(580000,'riding-board');
        const normalSaved=await savePendingRideResult('riding');
        const normal=atomicA.readRides(atomicOther)[0];
        // An unrelated, older general ride must never become racing analysis input.
        state.ride=Ride.startRide(Ride.createRideSession(),1);state.ride.distance=99999;state.ride.movingTime=999999;
        state.ride.distanceHistory=[{distance:0,movingTime:0},{distance:99999,movingTime:999999}];
        activeProfileId=atomicOwner;racingOwnerProfileId=atomicOwner;
        state.racingCapture={ride:raceRide,startedAt:100000,startPoint:raceRide.routePoints[0]};
        state.racingSession=Racing.createRaceSession({route:raceRide.routePoints,target:Racing.createTargetSpeedTarget(5)});
        state.racingCourse={source:'new',route:raceRide.routePoints,name:'splits',tripType:'one-way'};
        state.racingSnapshot={currentRouteProgress:raceRide.distance,targetRouteProgress:0,distanceDifference:0,timeDifference:0};
        const race=createRacingRecord(580000,{completed:true});
        state.racingSession.target=Racing.createTargetSpeedTarget(50);
        state.racingSnapshot={currentRouteProgress:999999,targetRouteProgress:999999,distanceDifference:99999,timeDifference:99999};
        const changedGhost=createRacingRecord(580000,{completed:true});
        state.racingSession.finalArrivalDetector={crossing:{timestamp:578600,distance:raceRide.distance-7,
          movingTime:raceRide.movingTime-1400,position:{latitude:0,longitude:2393/111195},filteredSpeed:5,moving:true}};
        const clipped=createRacingRecord(580000,{completed:true});
        delete state.racingSession.finalArrivalDetector;
        const historyUnchanged=beforeHistory===JSON.stringify(raceRide.distanceHistory);
        state.racingFrozenRecord=race;state.racingPhase='completion-pending';
        const raceSaved=await saveFrozenRacingRecord('racing');
        const savedRace=atomicA.readRacing(atomicOwner)[0],ghost=Racing.createSavedRideTarget(savedRace);
        state.racingFrozenRecord=race;state.racingPhase='completion-pending';state.racingFrozenSaved=false;
        const asGeneralSaved=await saveFrozenRacingRecord('riding');
        const asGeneral=atomicA.readRides(atomicOwner)[0];
        const reopened=RideMateProfiles.createProfileRepository(localStorage,{recordStore:RideMateProfiles.createIndexedRecordStore(indexedDB)});
        await reopened.initializeRecords();
        const restored=reopened.readRacing(atomicOwner)[0];
        // Read and open an existing record with no optional split field.
        const legacy=raceRecord('legacy',10000,.2);await saveAtomic(atomicA,legacy);
        const oldRecord=atomicA.readRacing(atomicOwner).find(record=>record.name==='legacy');
        kakao.maps.Polyline=class {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setPath(path){this.path=path}};
        const legacyOpened=challengeRacingRecord(atomicA.readRacing(atomicOwner).findIndex(record=>record.name==='legacy'));
        return {normalSaved,raceSaved,asGeneralSaved,normal:normal.kilometerSplits,race:savedRace.kilometerSplits,
          changed:changedGhost.kilometerSplits,asGeneral:asGeneral.kilometerSplits,restored:restored.kilometerSplits,
          distance:race.distance,time:race.movingTime,historyUnchanged,
          clipped:{distance:clipped.distance,time:clipped.movingTime,splits:clipped.kilometerSplits},
          routePreserved:JSON.stringify(savedRace.route)===JSON.stringify(race.route),
          samplesPreserved:JSON.stringify(savedRace.detailedSamples)===JSON.stringify(race.detailedSamples),
          ghostVersion:savedRace.ghostDataVersion,ghostProgress:Racing.targetProgressAtTime(ghost,race.movingTime),
          ghostHasAnalysis:Object.hasOwn(ghost,'kilometerSplits')||ghost.samples.some(sample=>Object.hasOwn(sample,'kilometerSplits')),
          legacyHasSplits:Object.hasOwn(oldRecord,'kilometerSplits'),legacyOpened};
      })()`);
      assert.equal(result.normalSaved,true);assert.equal(result.raceSaved,true);assert.equal(result.asGeneralSaved,true);
      for(const name of ['race','changed','asGeneral','restored'])assert.deepEqual(result[name],result.normal,name);
      assert.equal(result.normal.length,3);
      assert.ok(Math.abs(result.clipped.splits.reduce((sum,s)=>sum+s.distanceM,0)-result.clipped.distance)<1e-8);
      assert.ok(Math.abs(result.clipped.splits.reduce((sum,s)=>sum+s.movingTimeMs,0)-result.clipped.time)<1e-8);
      assert.equal(result.clipped.splits.at(-1).endDistanceM,result.clipped.distance);
      assert.ok(Math.abs(result.normal.reduce((sum,s)=>sum+s.distanceM,0)-result.distance)<1e-8);
      assert.ok(Math.abs(result.normal.reduce((sum,s)=>sum+s.movingTimeMs,0)-result.time)<1e-8);
      assert.equal(result.historyUnchanged,true);assert.equal(result.routePreserved,true);assert.equal(result.samplesPreserved,true);
      assert.equal(result.ghostVersion,1);assert.equal(result.ghostProgress,result.distance);
      assert.equal(result.ghostHasAnalysis,false);assert.equal(result.legacyHasSplits,false);assert.equal(result.legacyOpened,true);
    });
  }});
});
