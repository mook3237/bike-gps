const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('./profile-browser-flow.cjs');

test('saved record detail renders real values and preserves map, history and stored records', { timeout: 60000 }, async t => {
  await run({ check: async (evaluate, client) => {
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      globalThis.recordMapSpies={maps:[],lines:[],markers:[]};
      const BaseMap=kakao.maps.Map,BaseOverlay=kakao.maps.CustomOverlay;
      kakao.maps.Map=class extends BaseMap{
        constructor(...args){super(...args);recordMapSpies.maps.push(this)}
        setDraggable(value){this.draggable=value}setZoomable(value){this.zoomable=value}
        relayout(){this.layouts=(this.layouts||0)+1}setBounds(bounds){this.fits=(this.fits||0)+1;this.bounds=bounds}
      };
      kakao.maps.Polyline=class {constructor(options){Object.assign(this,options);recordMapSpies.lines.push(this)}setMap(map){this.map=map}};
      kakao.maps.CustomOverlay=class extends BaseOverlay{constructor(options){super(options);recordMapSpies.markers.push(this)}};
      state.map.setBounds=()=>{};
      kakao.maps.LatLngBounds.prototype.isEmpty=()=>false;
      const route=[{latitude:37,longitude:127,timestamp:0,distance:0,movingTime:0,filteredSpeed:0,moving:false},
        {latitude:37.01,longitude:127.01,timestamp:5000000,distance:2400,movingTime:5000000,filteredSpeed:5,moving:true}];
      globalThis.detailFixture={name:'<img src=x onerror="window.badRecordName=true"> 실제 기록',endedAt:'2026-11-06T01:24:00Z',
        distance:2400,movingTime:5000000,averageMovingSpeed:8,maxSpeed:10,averageMovingPace:123,completed:true,ghostDataVersion:1,route,detailedSamples:[{timestamp:123}],
        kilometerSplits:[{startDistanceM:0,endDistanceM:1000,distanceM:1000,movingTimeMs:4000000,averageSpeedMps:9,paceMsPerKm:90000,startBoundaryInterpolated:false,endBoundaryInterpolated:true},
          {startDistanceM:1000,endDistanceM:2000,distanceM:1000,movingTimeMs:900000,averageSpeedMps:8,paceMsPerKm:125000,startBoundaryInterpolated:true,endBoundaryInterpolated:false},
          {startDistanceM:2000,endDistanceM:2400,distanceM:400,movingTimeMs:100000,averageSpeedMps:4,paceMsPerKm:250000,startBoundaryInterpolated:false,endBoundaryInterpolated:false}]};
      await profileRepository.prependRide(activeProfileId,detailFixture);
      globalThis.detailRace={...detailFixture,name:'실제 레이싱',finalDistanceDifference:-25,finalTimeDifference:-5000,completed:true};
      await profileRepository.prependRacing(activeProfileId,detailRace);
      globalThis.detailBefore=JSON.stringify(await RideMateProfiles.createIndexedRecordStore(indexedDB).readAll());
      globalThis.detailLive={map:state.map,center:state.map.getCenter(),level:state.map.getLevel(),routes:state.routes};
      openMainMenu();openRecordsScreen('riding');document.querySelector('[data-record-detail="0"]').click();
    })()`);
    const visible = selector => evaluate(`!document.querySelector(${JSON.stringify(selector)}).classList.contains('hidden')`);
    async function back(button) {
      await evaluate(`new Promise(resolve=>{window.addEventListener('popstate',()=>setTimeout(resolve,0),{once:true});${button?`document.querySelector(${JSON.stringify(button)}).click()`:'history.back()'}})`);
    }

    await t.test('summary starts selected; saved split values, partial distance and estimated boundaries render safely', async () => {
      const result=await evaluate(`(()=>{
        const summary=document.querySelector('#recordDetail').textContent;
        document.querySelector('#recordTabsplits').click();
        return{title:document.querySelector('#recordsTitle').textContent,summary,
          cells:[...document.querySelectorAll('.record-splits tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent)),
          detail:document.querySelector('#recordPanelsplits').textContent,xss:!!window.badRecordName,
          imageCount:document.querySelector('#recordDetail').querySelectorAll('img').length,
          selected:document.querySelector('#recordTabsplits').getAttribute('aria-selected'),
          mapVisible:!document.querySelector('#recordMapSection').classList.contains('hidden')};
      })()`);
      assert.equal(result.title,'기록 상세');assert.match(result.summary,/레이싱|일반 라이딩/);
      assert.match(result.summary,/1:23:20/);assert.match(result.summary,/2:03/);
      assert.match(result.cells[0][3],/32\.4/);assert.equal(result.cells[0][2],'1:06:40');assert.equal(result.cells[0][4],'1:30');
      assert.equal(result.cells[2][1],'0.40 km');assert.equal(result.cells[2][4],'4:10');
      assert.match(result.detail,/경계 추정/);assert.match(result.detail,/마지막 구간/);
      assert.equal(result.xss,false);assert.equal(result.imageCount,0);assert.equal(result.selected,'true');assert.equal(result.mapVisible,true);
    });

    await t.test('mobile layout contains summary, table, map and controls within the viewport', async () => {
      const layout=await evaluate(`(()=>{
        const screen=document.querySelector('#recordsScreen'),table=document.querySelector('.record-table-scroll');
        return {screenOverflow:screen.scrollWidth>screen.clientWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth,
          tableContained:table.getBoundingClientRect().right<=innerWidth,
          tableFits:table.scrollWidth===table.clientWidth,
          summaryContained:document.querySelector('.record-detail-stats').getBoundingClientRect().right<=innerWidth,
          mapContained:document.querySelector('#recordMapPreview').getBoundingClientRect().right<=innerWidth,
          buttons:[...document.querySelectorAll('.record-tabs button')].every(node=>node.getBoundingClientRect().height>=44)};
      })()`);
      assert.deepEqual(layout,{screenOverflow:false,bodyOverflow:false,tableContained:true,tableFits:true,summaryContained:true,mapContained:true,buttons:true});
      await evaluate(`document.querySelector('#recordsScreen').scrollTop=0`);
      const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(os.tmpdir(),'ridemate-record-detail-mobile.png'),Buffer.from(screenshot.data,'base64'));
    });

    await t.test('map uses only saved coordinates and SDK controls; back buttons and browser history restore tab and scroll', async () => {
      const info=await evaluate(`(()=>{
        const length=history.length;document.querySelector('#recordTabsummary').click();document.querySelector('#recordTabsplits').click();
        document.querySelector('#recordsScreen').scrollTop=180;
        const scroll=document.querySelector('#recordsScreen').scrollTop;
        document.querySelector('#recordMapExpand').click();
        const level=recordRouteMap.getLevel(),fits=recordRouteMap.fits;
        document.querySelector('#recordMapZoomIn').click();const zoomIn=recordRouteMap.getLevel();
        document.querySelector('#recordMapZoomOut').click();const zoomOut=recordRouteMap.getLevel();
        recordRouteMap.panTo(new kakao.maps.LatLng(37.1,127.1));document.querySelector('#recordMapFit').click();
        return {scroll,length,after:history.length,level,zoomIn,zoomOut,fits:recordRouteMap.fits>fits,
          draggable:recordRouteMap.draggable,zoomable:recordRouteMap.zoomable,
          path:recordRouteLine.path.map(point=>[point.getLat(),point.getLng()]),
          markers:recordRouteMarkers.map(marker=>marker.content),overlay:!document.querySelector('#recordMapOverlay').classList.contains('hidden')};
      })()`);
      assert.equal(info.after,info.length+1);assert.equal(info.overlay,true);assert.equal(info.zoomIn,info.level-1);assert.equal(info.zoomOut,info.level);
      assert.equal(info.fits,true);assert.equal(info.draggable,true);assert.equal(info.zoomable,true);
      assert.deepEqual(info.path,[[37,127],[37.01,127.01]]);assert.match(info.markers.join(' '),/출발.*도착/);
      await back('#recordMapBack');assert.equal(await visible('#recordMapOverlay'),false);assert.equal(await visible('#recordDetail'),true);
      assert.deepEqual(await evaluate(`({tab:recordDetailSelection.tab,scroll:document.querySelector('#recordsScreen').scrollTop})`),{tab:'splits',scroll:info.scroll});
      await evaluate(`document.querySelector('#recordMapExpand').click()`);await back();
      assert.equal(await visible('#recordDetail'),true);assert.equal(await visible('#recordMapOverlay'),false);
      await back('#recordsBack');assert.equal(await visible('#recordsList'),true);assert.equal(await visible('#recordDetail'),false);
      await evaluate(`document.querySelector('[data-record-detail="0"]').click()`);
      assert.equal(await evaluate(`document.querySelector('#recordTabsummary').getAttribute('aria-selected')`),'true');
      await back();assert.equal(await visible('#recordsList'),true);
      await back('#recordsBack');assert.equal(await visible('#recordsScreen'),false);
    });

    await t.test('racing comparison, legacy records, missing values, SDK absence and replaced map markers remain safe', async () => {
      const result=await evaluate(`(()=>{
        openMainMenu();openRecordsScreen('racing');document.querySelector('[data-record-detail="0"]').click();
        const completedComparison=document.querySelector('.record-comparison').textContent;
        renderRecordDetail({...detailRace,completed:false},true);
        const comparison=document.querySelector('.record-comparison').textContent;
        const oldLine=recordRouteLine,oldMarkers=[...recordRouteMarkers];
        renderRecordDetail({...detailFixture,route:[...detailFixture.route].reverse(),kilometerSplits:[detailFixture.kilometerSplits[0]]},false);
        const detached=oldLine.map===null&&oldMarkers.every(marker=>marker.map===null);
        const noPartial=!document.querySelector('#recordPanelsplits').textContent.includes('마지막 구간');
        const summary=document.querySelector('#recordTabsummary').getAttribute('aria-selected');
        renderRecordDetail({name:'과거 기록',route:[]},false);setRecordDetailTab('splits');
        const legacy=document.querySelector('#recordPanelsplits').textContent,emptyMap=document.querySelector('#recordMapMessage').textContent;
        const missing=document.querySelector('.record-detail-stats').textContent;
        renderRecordDetail({...detailFixture,averageMovingPace:undefined,kilometerSplits:[{startDistanceM:0,endDistanceM:1000,distanceM:1000,movingTimeMs:NaN,averageSpeedMps:Infinity,paceMsPerKm:null}]},false);
        const invalid=document.querySelector('#recordPanelsplits').textContent;
        const fallbackPace=document.querySelector('.record-detail-stats').textContent;
        const sdk=kakao;kakao=undefined;renderRecordDetail(detailFixture,false);
        const unavailable=document.querySelector('#recordMapMessage').textContent,detailVisible=!document.querySelector('#recordDetail').classList.contains('hidden');kakao=sdk;
        renderRecordDetail(null);renderRecords('racing');
        return {completedComparison,comparison,detached,noPartial,summary,legacy,emptyMap,missing,invalid,fallbackPace,unavailable,detailVisible,
          challengeVisible:!!document.querySelector('[data-racing-challenge]'),
          liveUnchanged:state.map===detailLive.map&&state.map.getCenter()===detailLive.center&&state.map.getLevel()===detailLive.level&&state.routes===detailLive.routes};
      })()`);
      assert.match(result.completedComparison,/완주/);assert.match(result.comparison,/미완주/);assert.match(result.comparison,/뒤처짐/);
      assert.equal(result.detached,true);assert.equal(result.noPartial,true);assert.equal(result.summary,'true');
      assert.match(result.legacy,/이 기록에는 구간 분석 데이터가 없습니다/);assert.match(result.emptyMap,/GPS/);
      assert.match(result.missing,/—/);assert.doesNotMatch(result.missing+result.invalid,/NaN|Infinity/);
      assert.match(result.fallbackPace,/34:43/);assert.match(result.unavailable,/지도를 불러올 수 없습니다/);
      assert.equal(result.detailVisible,true);assert.equal(result.challengeVisible,true);assert.equal(result.liveUnchanged,true);
      assert.equal(await evaluate(`(async()=>JSON.stringify(await RideMateProfiles.createIndexedRecordStore(indexedDB).readAll())===detailBefore)()`),true);
      const legacyChallenge=await evaluate(`(()=>{const before=JSON.stringify(profileRepository.readRacing(activeProfileId));const ok=challengeRacingRecord(0);return{ok,unchanged:before===JSON.stringify(profileRepository.readRacing(activeProfileId)),screen:state.screen}})()`);
      assert.equal(legacyChallenge.ok,true);assert.equal(legacyChallenge.unchanged,true);assert.equal(legacyChallenge.screen,'racing');
    });
  }});
});
