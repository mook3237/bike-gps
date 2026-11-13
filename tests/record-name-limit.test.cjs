const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('./profile-browser-flow.cjs');
const {createProfileRepository,recordNameLength}=require('../profile-system.js');

const names=['가'.repeat(13),'W'.repeat(13),'1234567890123','가 A1😀👨‍👩‍👧‍👦'+'x'.repeat(7),'🇰🇷'.repeat(13),'👍🏽'.repeat(13),'e\u0301'.repeat(13)];
test('record name storage accepts 13 graphemes including spaces and rejects 14 without changing saved values',async()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const repo=createProfileRepository(storage,{createId:()=> 'owner'});repo.initialize();await repo.prependRide('owner',{name:'기존 이름',route:[]});
  for(const name of names){
    assert.equal(recordNameLength(name),13);assert.equal(recordNameLength(name+'x'),14);
    const target=repo.recordTarget('owner','rides',repo.readRides('owner')[0]);await repo.changeRecord(target,name);
    const before=JSON.stringify(repo.readRides('owner'));
    await assert.rejects(repo.changeRecord(repo.recordTarget('owner','rides',repo.readRides('owner')[0]),name+'x'),/최대 13자/);
    assert.equal(JSON.stringify(repo.readRides('owner')),before);
  }
});

test('record name dialog enforces 13 visible characters and reports mobile one-line overflow',{timeout:45000},async t=>{
  await run({check:async(evaluate,client)=>{
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      await profileRepository.prependRide(activeProfileId,{name:'기존 이름',route:[]});openRecordsScreen('riding');document.querySelector('[data-record-detail]').click();renameSelectedRecord();
      globalThis.nameOwner=activeProfileId;globalThis.nameErrors=[];toast=message=>nameErrors.push(message);
    })()`);
    await t.test('13 graphemes can be typed while a fourteenth and oversized paste are blocked',async()=>{
      for(const name of names){
        await evaluate(`(()=>{const input=document.querySelector('#recordNameInput');input.value='';input.dispatchEvent(new Event('input'));input.focus()})()`);
        await client.send('Input.insertText',{text:name});
        assert.equal(await evaluate(`document.querySelector('#recordNameInput').value`),name);
        await client.send('Input.insertText',{text:'x'});
        assert.equal(await evaluate(`document.querySelector('#recordNameInput').value`),name);
        const paste=await evaluate(`(()=>{const input=document.querySelector('#recordNameInput');input.select();const data=new DataTransfer();data.setData('text','가'.repeat(14));const event=new ClipboardEvent('paste',{clipboardData:data,cancelable:true,bubbles:true});input.dispatchEvent(event);return{blocked:event.defaultPrevented,value:input.value,hint:document.querySelector('#recordNameHint').textContent}})()`);
        assert.equal(paste.blocked,true);assert.equal(paste.value,name);assert.match(paste.hint,/최대 13자/);
      }
    });
    await t.test('submit validates 14 characters again and saves a 13-character emoji name',async()=>{
      const result=await evaluate(`(async()=>{
        const input=document.querySelector('#recordNameInput'),before=JSON.stringify(profileRepository.readRides(nameOwner));input.value='😀'.repeat(14);const rejected=await submitRecordAction(),unchanged=JSON.stringify(profileRepository.readRides(nameOwner))===before;
        input.value='👨‍👩‍👧‍👦'.repeat(13);const saved=await submitRecordAction();
        const repo=RideMateProfiles.createProfileRepository(localStorage,{recordStore:RideMateProfiles.createIndexedRecordStore(indexedDB)});repo.initialize();await repo.initializeRecords();
        return{rejected,unchanged,saved,name:repo.readRides(nameOwner)[0].name};
      })()`);
      assert.equal(result.rejected,false);assert.equal(result.unchanged,true);assert.equal(result.saved,true);assert.equal(result.name,'👨‍👩‍👧‍👦'.repeat(13));
    });
    await t.test('full-width mobile titles keep the rename button below and wrap only legacy long names',async()=>{
      for(const width of [390,320]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      const result=await evaluate(`(()=>{
        const stored=JSON.stringify(profileRepository.readRides(nameOwner)),base=recordDetailSelection.record;
        return ['가'.repeat(13),'W'.repeat(13),'👨‍👩‍👧‍👦'.repeat(13),'이전에 저장된 긴 이름'.repeat(4)].map(name=>{
          renderRecordDetail({...base,name});const node=document.querySelector('#recordName'),button=document.querySelector('#recordRenameBtn'),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect(),box=node.getBoundingClientRect(),style=getComputedStyle(node);
          const buttonBox=button.getBoundingClientRect(),row=document.querySelector('.record-name-row').getBoundingClientRect();
          return{name,shown:node.textContent,viewport:innerWidth,nowrap:style.whiteSpace,overflow:style.overflowX,ellipsis:style.textOverflow,available:box.width,textWidth:text.width,overflows:text.right>box.right+.5,buttonBelow:buttonBox.top>=box.bottom,buttonVisible:buttonBox.right<=innerWidth,fullWidth:Math.abs(row.width-box.width)<1,unchanged:stored===JSON.stringify(profileRepository.readRides(nameOwner))};
        });
      })()`);
      for(const value of result){const legacy=recordNameLength(value.name)>13;assert.equal(value.viewport,width);assert.equal(value.name,value.shown);assert.equal(value.nowrap,legacy?'normal':'nowrap');assert.equal(value.overflow,'visible');assert.notEqual(value.ellipsis,'ellipsis');assert.equal(value.buttonVisible,true);assert.equal(value.buttonBelow,true);assert.equal(value.fullWidth,true);assert.equal(value.unchanged,true);if(width===390||legacy)assert.equal(value.overflows,false)}
      t.diagnostic(JSON.stringify(result.map(({name,available,textWidth,overflows})=>({viewport:width,graphemes:recordNameLength(name),sample:name.slice(0,12),available,textWidth,overflows}))));
      }
    });
  }});
});
