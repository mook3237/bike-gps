const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('./profile-browser-flow.cjs');

test('record actions use real IndexedDB completion and stable profile-owned keys',{timeout:60000},async t=>{
  await run({check:async(evaluate,client)=>{
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      globalThis.actionOwner=activeProfileId;globalThis.actionOther=profileRepository.addProfile('다른 프로필').id;
      globalThis.actionRecord={name:'원래 이름',distance:400,movingTime:80000,averageSpeed:5,maxSpeed:6,ghostDataVersion:1,completed:true,
        route:[{latitude:37,longitude:127,distance:0,movingTime:0,timestamp:0,moving:false,filteredSpeed:0},{latitude:37,longitude:127.0036,distance:400,movingTime:80000,timestamp:80000,moving:true,filteredSpeed:5}],
        detailedSamples:[{timestamp:1000,accuracy:3}],kilometerSplits:[{startDistanceM:0,endDistanceM:400,distanceM:400,movingTimeMs:80000,averageSpeedMps:5,paceMsPerKm:200000}]};
      await profileRepository.prependRide(actionOwner,actionRecord,{retainDetailed:true});
      await profileRepository.prependRide(actionOther,{...actionRecord,name:'다른 프로필 기록'},{retainDetailed:true});
      await profileRepository.prependRacing(actionOwner,{...actionRecord,name:'Ghost 원본'});
      globalThis.actionErrors=[];toast=message=>actionErrors.push(message);
      globalThis.actionRename=async name=>{if(!document.querySelector('#recordRenameBtn').onclick())return false;document.querySelector('#recordNameInput').value=name;return submitRecordAction()};globalThis.actionDelete=async(confirm=true)=>{if(!document.querySelector('#recordDeleteBtn').onclick())return false;if(!confirm){document.querySelector('#recordActionCancel').click();return false}return submitRecordAction()};window.prompt=window.confirm=()=>{throw Error('Native dialogs must not be used')};
      globalThis.actionSelect=(kind='riding',index=0)=>{activeProfileId=actionOwner;openRecordsScreen(kind);document.querySelectorAll('[data-record-detail]')[index].click()};
      globalThis.actionRead=async()=>{const repo=RideMateProfiles.createProfileRepository(localStorage,{recordStore:RideMateProfiles.createIndexedRecordStore(indexedDB)});repo.initialize();await repo.initializeRecords();return repo};
      globalThis.actionOtherBefore=JSON.stringify(profileRepository.readRides(actionOther));
      globalThis.actionRaceBefore=JSON.stringify(profileRepository.readRacing(actionOwner));
    })()`);

    await t.test('thirteen-character names are allowed and a fourteenth is rejected at input paste and save',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();renameSelectedRecord();const input=document.querySelector('#recordNameInput'),before=JSON.stringify(profileRepository.readRides(actionOwner));
        input.value='가'.repeat(13);input.dispatchEvent(new Event('input'));input.setSelectionRange(13,13);
        const typing=new InputEvent('beforeinput',{inputType:'insertText',data:'x',bubbles:true,cancelable:true});input.dispatchEvent(typing);
        input.select();const clipboard=new DataTransfer();clipboard.setData('text','가'.repeat(14));const paste=new ClipboardEvent('paste',{clipboardData:clipboard,cancelable:true,bubbles:true});input.dispatchEvent(paste);
        const allowed=!recordNameError(input.value),hint=document.querySelector('#recordNameHint').textContent;input.value='가'.repeat(14);const saved=await submitRecordAction();document.querySelector('#recordActionCancel').click();
        return{allowed,hint,typingBlocked:typing.defaultPrevented,pasteBlocked:paste.defaultPrevented,saved,unchanged:JSON.stringify(profileRepository.readRides(actionOwner))===before};
      })()`);
      assert.equal(result.allowed,true);assert.match(result.hint,/최대 13자/);assert.equal(result.typingBlocked,true);assert.equal(result.pasteBlocked,true);assert.equal(result.saved,false);assert.equal(result.unchanged,true);
    });

    await t.test('old long names wrap without rewriting storage and rename cancellation never saves',async()=>{
      const result=await evaluate(`(()=>{
        actionSelect();const before=JSON.stringify(profileRepository.readRides(actionOwner));renameSelectedRecord();document.querySelector('#recordNameInput').value='취소 이름';document.querySelector('#recordActionCancel').click();
        const original=recordDetailSelection.record,long={...original,name:'오래된 긴 기록 이름 '.repeat(10)};renderRecordDetail(long);
        const node=document.querySelector('#recordName');return{sameStorage:JSON.stringify(profileRepository.readRides(actionOwner))===before,name:node.textContent,expected:long.name,style:getComputedStyle(node).whiteSpace,scrollable:node.scrollWidth>node.clientWidth,ellipsis:getComputedStyle(node).textOverflow};
      })()`);
      assert.equal(result.sameStorage,true);assert.equal(result.name,result.expected);assert.equal(result.style,'normal');assert.equal(result.scrollable,false);assert.notEqual(result.ellipsis,'ellipsis');
    });

    await t.test('rename persists across detail reentry and a fresh repository while preserving every other field',async()=>{
      const value=await evaluate(`(async()=>{
        actionSelect();setRecordDetailTab('splits');const before=recordDetailSelection.record;
        const ok=await actionRename('변경 이름');
        const shown=document.querySelector('#recordName').textContent,list=document.querySelector('#recordsList').textContent,tab=recordDetailSelection.tab;
        renderRecords('riding');document.querySelector('[data-record-detail]').click();const reentry=recordDetailSelection.record.name;
        const fresh=await actionRead(),saved=fresh.readRides(actionOwner)[0];
        return{ok,shown,list,reentry,tab,saved,original:before,other:JSON.stringify(fresh.readRides(actionOther))===actionOtherBefore,race:JSON.stringify(fresh.readRacing(actionOwner))===actionRaceBefore};
      })()`);
      assert.equal(value.ok,true);assert.equal(value.shown,'변경 이름');assert.match(value.list,/변경 이름/);assert.equal(value.reentry,'변경 이름');assert.equal(value.tab,'splits');
      assert.deepEqual(value.saved,{...value.original,name:'변경 이름'});assert.equal(value.other,true);assert.equal(value.race,true);
    });

    await t.test('put failure rolls back disk and cache and keeps the original detail',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();const before=JSON.stringify(profileRepository.readRides(actionOwner)),name=recordDetailSelection.record.name;
        const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw Error('forced put failure')};
        let ok;
        try{ok=await actionRename('실패할 이름')}finally{IDBObjectStore.prototype.put=put}
        const fresh=await actionRead();return{ok,name:recordDetailSelection.record.name,expected:name,cache:JSON.stringify(profileRepository.readRides(actionOwner))===before,disk:JSON.stringify(fresh.readRides(actionOwner))===before,error:actionErrors.at(-1),detail:!document.querySelector('#recordDetail').classList.contains('hidden')};
      })()`);
      assert.equal(result.ok,false);assert.equal(result.name,result.expected);assert.equal(result.cache,true);assert.equal(result.disk,true);assert.match(result.error,/forced put failure/);assert.equal(result.detail,true);
    });

    await t.test('duplicate actions are blocked and late rename completion cannot update another record or profile',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();const selected=recordDetailSelection,target=selected.target,original=profileRepository.changeRecord.bind(profileRepository);let resume,calls=0;
        profileRepository.changeRecord=(...args)=>{calls++;return new Promise(resolve=>resume=()=>resolve(original(...args)))};
        const pending=actionRename('첫 기록만 변경'),duplicate=await renameSelectedRecord();
        const unchanged=recordDetailSelection.record.name==='변경 이름';activeProfileId=actionOther;renderRecords('riding');document.querySelector('[data-record-detail]').click();const other=recordDetailSelection;
        resume();const ok=await pending;profileRepository.changeRecord=original;const fresh=await actionRead();
        return{ok,calls,duplicate,unchanged,sameScreen:recordDetailSelection===other,otherName:other.record.name,ownerName:fresh.readRides(actionOwner)[0].name,otherUnchanged:JSON.stringify(fresh.readRides(actionOther))===actionOtherBefore,keySame:fresh.recordTarget(actionOwner,'rides',fresh.readRides(actionOwner)[0]).key===target.key};
      })()`);
      assert.deepEqual(result,{ok:true,calls:1,duplicate:false,unchanged:true,sameScreen:true,otherName:'다른 프로필 기록',ownerName:'첫 기록만 변경',otherUnchanged:true,keySame:true});
    });

    await t.test('racing rename preserves Ghost data and deletion is blocked without a policy',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect('racing');const before=recordDetailSelection.record;const ok=await actionRename('레이싱 이름 변경');
        const fresh=await actionRead(),saved=fresh.readRacing(actionOwner)[0],disabled=document.querySelector('#recordDeleteBtn').disabled;
        let rejected=false;try{await fresh.changeRecord(fresh.recordTarget(actionOwner,'racing',saved),null)}catch{rejected=true}
        return{ok,disabled,rejected,saved,before,progress:Racing.targetProgressAtTime(Racing.createSavedRideTarget(saved),80000)};
      })()`);
      assert.equal(result.ok,true);assert.equal(result.disabled,true);assert.equal(result.rejected,true);assert.deepEqual(result.saved,{...result.before,name:'레이싱 이름 변경'});assert.ok(result.progress>390);
    });

    await t.test('delete confirmation and transaction abort keep the record and detail intact',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();const before=JSON.stringify(profileRepository.readRides(actionOwner));
        const cancelled=await actionDelete(false);
        const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite'){const store=tx.objectStore('records'),remove=store.delete.bind(store);store.delete=key=>{const request=remove(key);request.onsuccess=()=>tx.abort();return request};tx.objectStore=()=>store}return tx};
        let ok;try{ok=await actionDelete()}finally{IDBDatabase.prototype.transaction=transaction}
        const fresh=await actionRead();return{cancelled,ok,cache:JSON.stringify(profileRepository.readRides(actionOwner))===before,disk:JSON.stringify(fresh.readRides(actionOwner))===before,detail:!!recordDetailSelection,error:actionErrors.at(-1)};
      })()`);
      assert.equal(result.cancelled,false);assert.equal(result.ok,false);assert.equal(result.cache,true);assert.equal(result.disk,true);assert.equal(result.detail,true);assert.ok(result.error);
    });

    await t.test('late delete uses the captured key once without navigating another profile',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();const original=profileRepository.changeRecord.bind(profileRepository);let resume,calls=0;
        profileRepository.changeRecord=(...args)=>{calls++;return new Promise(resolve=>resume=()=>resolve(original(...args)))};
        const pending=actionDelete(),duplicate=await deleteSelectedRecord();const retained=profileRepository.readRides(actionOwner).length===1;
        activeProfileId=actionOther;renderRecords('riding');document.querySelector('[data-record-detail]').click();const other=recordDetailSelection;
        resume();const ok=await pending;profileRepository.changeRecord=original;const fresh=await actionRead();
        return{ok,calls,duplicate,retained,sameScreen:recordDetailSelection===other,count:fresh.readRides(actionOwner).length,otherUnchanged:JSON.stringify(fresh.readRides(actionOther))===actionOtherBefore,races:fresh.readRacing(actionOwner).length};
      })()`);
      assert.deepEqual(result,{ok:true,calls:1,duplicate:false,retained:true,sameScreen:true,count:0,otherUnchanged:true,races:1});
    });

    await t.test('successful current-record deletion returns to its list only after commit and identical records use distinct keys',async()=>{
      const result=await evaluate(`(async()=>{
        await profileRepository.prependRide(actionOwner,actionRecord,{retainDetailed:true});await profileRepository.prependRide(actionOwner,actionRecord,{retainDetailed:true});actionSelect();
        const entries=profileRepository.recordDetails(actionOwner,'rides'),distinct=entries[0].target.key!==entries[1].target.key,selected=recordDetailSelection.target.key;
        const ok=await actionDelete();await new Promise(resolve=>setTimeout(resolve,30));const fresh=await actionRead();
        return{ok,distinct,list:!document.querySelector('#recordsList').classList.contains('hidden'),detail:recordDetailSelection,count:fresh.readRides(actionOwner).length,remainingKey:fresh.recordDetails(actionOwner,'rides')[0].target.key,selected};
      })()`);
      assert.equal(result.ok,true);assert.equal(result.distinct,true);assert.equal(result.list,true);assert.equal(result.detail,null);assert.equal(result.count,1);assert.notEqual(result.remainingKey,result.selected);
    });

    await t.test('invalid names and stale targets are rejected and list scrolling survives detail back',async()=>{
      const result=await evaluate(`(async()=>{
        actionSelect();const empty=await actionRename('   ');closeRecordActionDialog();const long=await actionRename('x'.repeat(101));closeRecordActionDialog();
        const target=recordDetailSelection.target;await profileRepository.changeRecord(target,'외부 변경');let stale=false;try{await profileRepository.changeRecord(target,'덮어쓰기')}catch{stale=true}
        for(let i=0;i<12;i++)await profileRepository.prependRide(actionOwner,{...actionRecord,name:'스크롤 '+i});
        renderRecords('riding');const screen=document.querySelector('#recordsScreen');screen.scrollTop=300;const top=screen.scrollTop;
        document.querySelector('[data-record-detail]').click();
        await new Promise(resolve=>{window.addEventListener('popstate',()=>setTimeout(resolve,0),{once:true});document.querySelector('#recordsBack').click()});
        return{empty,long,stale,top,returned:screen.scrollTop,detail:recordDetailSelection};
      })()`);
      assert.equal(result.empty,false);assert.equal(result.long,false);assert.equal(result.stale,true);assert.ok(result.top>0);assert.equal(result.returned,result.top);assert.equal(result.detail,null);
    });
  }});
});

test('legacy records use unique full-value identity and ambiguous copies are never mutated',async()=>{
  const {createProfileRepository,PROFILE_STORE_KEY}=require('../profile-system.js');
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const repo=createProfileRepository(storage,{createId:()=> 'legacy-owner'});repo.initialize();
  const store=JSON.parse(values.get(PROFILE_STORE_KEY)),record={name:'legacy',route:[{latitude:37,longitude:127}],kilometerSplits:[]};
  store.dataByProfileId['legacy-owner'].rides=[record,{...record,name:'other'}];storage.setItem(PROFILE_STORE_KEY,JSON.stringify(store));
  const target=repo.recordTarget('legacy-owner','rides',record);await repo.changeRecord(target,'renamed');
  assert.deepEqual(repo.readRides('legacy-owner'),[{...record,name:'renamed'},{...record,name:'other'}]);
  const next=JSON.parse(values.get(PROFILE_STORE_KEY));next.dataByProfileId['legacy-owner'].rides=[record,record];storage.setItem(PROFILE_STORE_KEY,JSON.stringify(next));
  const before=values.get(PROFILE_STORE_KEY);assert.equal(repo.recordTarget('legacy-owner','rides',record),null);
  await assert.rejects(repo.changeRecord({profileId:'legacy-owner',kind:'rides',key:null,expected:JSON.stringify(record)},null),/안전하게 식별/);
  assert.equal(values.get(PROFILE_STORE_KEY),before);
});

test('unique legacy ride deletion persists after reopening and preserves other rides profiles and races',async()=>{
  const {createProfileRepository,PROFILE_STORE_KEY}=require('../profile-system.js');
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  let id=0;const repo=createProfileRepository(storage,{createId:()=> 'legacy-'+(++id)});repo.initialize();repo.addProfile('다른 프로필');
  const store=JSON.parse(values.get(PROFILE_STORE_KEY)),removed={name:'삭제 대상',route:[{latitude:37,longitude:127}],distance:100},kept={name:'다른 기록',kilometerSplits:[]},race={name:'Ghost 원본',ghostDataVersion:1,route:[{latitude:37,longitude:127}]};
  store.dataByProfileId['legacy-1'].rides=[removed,kept];store.dataByProfileId['legacy-1'].racing=[race];store.dataByProfileId['legacy-2'].rides=[removed];storage.setItem(PROFILE_STORE_KEY,JSON.stringify(store));
  const otherBefore=JSON.stringify(store.dataByProfileId['legacy-2']);
  await repo.changeRecord(repo.recordTarget('legacy-1','rides',removed),null);
  const reopened=createProfileRepository(storage);reopened.initialize();
  assert.deepEqual(reopened.readRides('legacy-1'),[kept]);assert.deepEqual(reopened.readRacing('legacy-1'),[race]);
  assert.equal(JSON.stringify(JSON.parse(values.get(PROFILE_STORE_KEY)).dataByProfileId['legacy-2']),otherBefore);
  assert.deepEqual(reopened.readRides('legacy-2'),[removed]);
});
