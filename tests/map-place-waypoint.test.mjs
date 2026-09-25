import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

async function apiHandler() {
  const source = fs.readFileSync(new URL('../api/place-search.js', import.meta.url), 'utf8');
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`)).default;
}

function mockResponse() {
  const output = { status: null, body: null };
  return {
    output,
    response: {
      status(code) { output.status = code; return this; },
      json(body) { output.body = body; return this; },
    },
  };
}

function loadApp(search = '', deferTimers = false) {
  const elements = new Map();
  const pendingTimers = [];
  const makeElement = () => {
    const classes = new Set(['hidden']);
    const listeners = new Map();
    return {
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name),
      },
      style: { setProperty() {} },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatch(type, event = {}) { return listeners.get(type)?.({stopPropagation() {},preventDefault() {},pointerId:1,clientY:0,...event}); },
      querySelectorAll() { return []; },
      querySelector() { return makeElement(); },
      setPointerCapture() {}, focus() {}, blur() {},
      offsetHeight: 600, value: '', innerHTML: '', textContent: '',
    };
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {}, body: makeElement(), documentElement: makeElement(),
  };
  const context = vm.createContext({
    console, document, localStorage: { getItem() { return null; }, setItem() {} },
    AbortController, URLSearchParams, innerHeight: 800,
    setTimeout(fn) { if (typeof fn !== 'function') return 1; if (deferTimers) pendingTimers.push(fn); else fn(); return pendingTimers.length || 1; }, clearTimeout() {},
    history: { pushState() {}, back() {} },
    navigator: { geolocation: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } },
    fetch: async () => ({ ok: false, json: async () => ({ error: 'test' }) }),
  });
  context.window = { addEventListener() {}, visualViewport: null, location: { search, hash: '' } };
  context.runPendingTimers = () => pendingTimers.splice(0).forEach(fn => fn());
  vm.runInContext(appSource, context, { filename: 'app.js' });
  return context;
}

test('place debug panel is enabled only by the exact debug query', () => {
  const normal = loadApp();
  const debug = loadApp('?debug=place');
  const unrelated = loadApp('?debug=route');

  assert.equal(normal.document.querySelector('#placeDebugPanel').classList.contains('hidden'), true);
  assert.equal(unrelated.document.querySelector('#placeDebugPanel').classList.contains('hidden'), true);
  assert.equal(debug.document.querySelector('#placeDebugPanel').classList.contains('hidden'), false);
  assert.match(html, /id="placeDebugPanel"[^>]*class="place-debug-panel hidden"/);
});

test('place debug panel records one complete touch session and clears it', () => {
  const context = loadApp('?debug=place', true);
  vm.runInContext(`
    state.map={getLevel:()=>4};
    state.visiblePlaces=[{id:'near',name:'가까운 장소'}];
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:1,clientX:10,clientY:20});
    handleMapPointerEvent({type:'pointermove',pointerType:'touch',pointerId:1,clientX:11,clientY:20});
    handleMapPointerEvent({type:'pointerup',pointerType:'touch',pointerId:1,clientX:11,clientY:20});
    logPlaceGesture('dragstart',{});
    invalidateVisiblePlaces('dragstart');
    logPlaceGesture('dragend',{});
    logPlaceGesture('idle',{});
    logPlaceGesture('click',{point:{x:100,y:100}});
    logPlaceTap({point:{x:100,y:100}},'NO_NEARBY_PLACE',{
      nearest:{place:{id:'near',name:'가까운 장소'},projected:{x:132,y:100},distance:32},
      second:{place:{id:'second',name:'두 번째 장소'},projected:{x:140,y:100},distance:40},
      ambiguous:false
    },'viewport-key');
  `, context);

  const record = vm.runInContext('placeDebugState.records[0]', context);
  assert.equal(record.result, 'NO_NEARBY_PLACE');
  assert.equal(record.visiblePlaces, 0);
  assert.equal(record.nearestPlace, '가까운 장소');
  assert.equal(record.nearestDistance, 32);
  assert.equal(record.secondPlace, '두 번째 장소');
  assert.equal(record.pointerdown, true);
  assert.equal(record.pointermove, true);
  assert.equal(record.pointerup, true);
  assert.equal(record.kakaoClick, true);
  assert.equal(record.dragstart, true);
  assert.equal(record.dragend, true);
  assert.equal(record.idle, true);
  assert.equal(record.cacheInvalidate, true);
  assert.equal(record.mapLevel, 4);
  assert.match(context.document.querySelector('#placeDebugRecords').innerHTML, /NO_NEARBY_PLACE/);

  context.document.querySelector('#placeDebugClear').onclick({stopPropagation() {}});
  assert.equal(vm.runInContext('placeDebugState.records.length', context), 0);
});

test('place debug panel keeps ten recent taps and exposes a missing Kakao click', () => {
  const context = loadApp('?debug=place', true);
  vm.runInContext(`
    state.map={getLevel:()=>5};
    for(let i=0;i<11;i++){
      handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:i});
      logPlaceGesture('click',{point:{x:i,y:i}});
      logPlaceTap({point:{x:i,y:i}},'NO_VISIBLE_PLACES',null,'key');
    }
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:99});
    handleMapPointerEvent({type:'pointerup',pointerType:'touch',pointerId:99});
  `, context);
  context.runPendingTimers();

  const results = vm.runInContext('placeDebugState.records.map(record=>record.result)', context);
  assert.equal(results.length, 10);
  assert.equal(results.at(-1), 'NO_KAKAO_CLICK');
  assert.equal(vm.runInContext('placeDebugState.records.at(-1).kakaoClick', context), false);
});

test('place debug panel reflects visible places after an invalidated cache refills', async () => {
  const context = loadApp('?debug=place');
  vm.runInContext(`
    kakao={maps:{services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    state.placesService={categorySearch(code,callback){testCalls.push(callback)}};
    testCalls=[];
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:1});
    invalidateVisiblePlaces('dragstart');
    logPlaceGesture('click',{point:{x:100,y:100}});
    logPlaceTap({point:{x:100,y:100}},'NO_VISIBLE_PLACES',null,visiblePlaceKey());
  `, context);
  const refresh = vm.runInContext('refreshVisiblePlaces()', context);
  context.testCalls.forEach((callback,index)=>callback(index===0?[{id:'refilled',place_name:'다시 채워진 장소',y:'37.5',x:'127'}]:[],index===0?'OK':'ZERO_RESULT'));
  await refresh;

  assert.equal(vm.runInContext('placeDebugState.records[0].visiblePlaces', context), 0);
  assert.match(context.document.querySelector('#placeDebugCurrent').innerHTML, /live visiblePlaces: 1/);
  assert.match(context.document.querySelector('#placeDebugCurrent').innerHTML, /다시 채워진 장소/);
});

test('Kakao SDK loads services and viewport refresh indexes all official categories', async () => {
  const context = loadApp();
  assert.match(appSource, /libraries=services/);
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng,services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={
      getLevel:()=>4,
      getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})
    };
    testCategoryCalls=[];
    state.placesService={categorySearch(code,callback,options){testCategoryCalls.push({code,callback,options})}};
  `, context);
  const refresh = vm.runInContext('refreshVisiblePlaces()', context);
  assert.equal(context.testCategoryCalls.length, 18);
  for (const [index, call] of context.testCategoryCalls.entries()) {
    const results = index < 2 ? [{id:'shared',place_name:'카페',category_name:'음식점 > 카페',road_address_name:'주소',y:'37.5',x:'127'}] : [];
    call.callback(results, results.length ? 'OK' : 'ZERO_RESULT');
    assert.equal(call.options.useMapBounds, true);
  }
  await refresh;
  assert.equal(vm.runInContext('state.visiblePlaces.length', context), 1);
  assert.equal(vm.runInContext('state.visiblePlaces[0].name', context), '카페');
  const cached = vm.runInContext('refreshVisiblePlaces()', context);
  await cached;
  assert.equal(context.testCategoryCalls.length, 18);
});

test('an older viewport response cannot replace newer bounds results', async () => {
  const context = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng,services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    testWest=126.9;testCalls=[];
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>testWest,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>testWest+.2,getLat:()=>37.6})})};
    state.placesService={categorySearch(code,callback,options){testCalls.push({code,callback,options})}};
  `, context);
  const oldRefresh = vm.runInContext('refreshVisiblePlaces()', context);
  vm.runInContext('testWest=127.2', context);
  const newRefresh = vm.runInContext('refreshVisiblePlaces()', context);
  const oldCalls = context.testCalls.slice(0,18), newCalls = context.testCalls.slice(18);
  newCalls.forEach((call,index)=>call.callback(index===0?[{id:'new',place_name:'새 장소',y:'37.5',x:'127.3'}]:[],index===0?'OK':'ZERO_RESULT'));
  await newRefresh;
  oldCalls.forEach((call,index)=>call.callback(index===0?[{id:'old',place_name:'옛 장소',y:'37.5',x:'127'}]:[],index===0?'OK':'ZERO_RESULT'));
  await oldRefresh;
  assert.equal(vm.runInContext('state.visiblePlaces[0].id', context), 'new');
});

test('idle refreshes after map movement or zoom and programmatic fitting does not expose search here', () => {
  const context = loadApp();
  vm.runInContext(`
    kakao={maps:{services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    testCategoryCalls=[];
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    state.placesService={categorySearch(code,callback,options){testCategoryCalls.push({code,callback,options})}};
    state.visiblePlaces=[{id:'stale'}];state.screen='results';state.searchMapFitPending=true;
    handleMapZoomStart();handleMapZoomChanged();
  `, context);
  assert.equal(vm.runInContext('state.visiblePlaces.length', context), 0);
  assert.equal(context.document.querySelector('#searchHereBtn').classList.contains('hidden'), true);
  vm.runInContext('handleMapIdle()', context);
  assert.equal(context.testCategoryCalls.length, 18);
  context.testCategoryCalls.forEach(call => call.callback([], 'ZERO_RESULT'));
  vm.runInContext('handleMapZoomChanged()', context);
  assert.equal(context.document.querySelector('#searchHereBtn').classList.contains('hidden'), false);
});

test('screen-space hit testing chooses a unique nearest place and rejects empty or ambiguous taps', () => {
  const context = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    testProjection={pointFromCoords(ll){return{x:ll.longitude,y:ll.latitude}}};
    testPlaces=[{id:'nearest',latitude:100,longitude:103},{id:'farther',latitude:100,longitude:120}];
    testAmbiguous=[{id:'one',latitude:100,longitude:98},{id:'two',latitude:100,longitude:102}];
  `, context);
  assert.equal(vm.runInContext("closestVisiblePlace({x:100,y:100},testPlaces,testProjection)?.id", context), 'nearest');
  assert.equal(vm.runInContext("closestVisiblePlace({x:300,y:300},testPlaces,testProjection)", context), null);
  assert.equal(vm.runInContext("closestVisiblePlace({x:100,y:100},testAmbiguous,testProjection)", context), null);
});

test('every map click reports a complete Place Tap Debug decision', () => {
  const context = loadApp();
  const records = [];
  context.console = {
    ...console,
    groupCollapsed() {}, groupEnd() {},
    table(value) { if (value?.['최종 결과']) records.push(value); },
    log() {}, debug() {},
  };
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.screen='map';state.mapClickBlockedUntil=0;
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})}),getProjection:()=>({pointFromCoords:ll=>({x:ll.longitude,y:ll.latitude})})};
    state.visiblePlaces=[{id:'near',name:'가까운 곳',latitude:100,longitude:103},{id:'second',name:'두 번째',latitude:100,longitude:120}];
    state.visiblePlaceKey=visiblePlaceKey();openPlace=()=>{};
    handleMapClick({point:{x:100,y:100}});
    state.mapClickBlockedUntil=Infinity;handleMapClick({point:{x:100,y:100}});
    state.mapClickBlockedUntil=Date.now()+300;handleMapClick({point:{x:100,y:100}});
    state.mapClickBlockedUntil=0;state.visiblePlaceKey='old';handleMapClick({point:{x:100,y:100}});
    state.visiblePlaceKey=visiblePlaceKey();state.visiblePlaces=[];handleMapClick({point:{x:100,y:100}});
    state.visiblePlaces=[{id:'far',name:'먼 곳',latitude:300,longitude:300}];handleMapClick({point:{x:100,y:100}});
    state.visiblePlaces=[{id:'one',name:'한 곳',latitude:100,longitude:98},{id:'two',name:'두 곳',latitude:100,longitude:102}];handleMapClick({point:{x:100,y:100}});
    state.screen='results';handleMapClick({point:{x:100,y:100}});
    state.screen='map';handleMapClick({});
  `, context);
  assert.deepEqual(records.map(record => record['최종 결과']), [
    'SELECTED','BLOCKED_BY_DRAG','BLOCKED_BY_TIME','STALE_VIEWPORT','NO_VISIBLE_PLACES',
    'NO_NEARBY_PLACE','AMBIGUOUS','WRONG_SCREEN','NO_EVENT_POINT',
  ]);
  const selected = records[0];
  for (const key of ['screen','event.point','map level','visiblePlaces count','visiblePlaceKey','current visiblePlaceKey()','mapClickBlockedUntil','현재 blocked 여부','가장 가까운 장소','가장 가까운 장소 pixel distance','두 번째로 가까운 장소','두 번째 장소 pixel distance','ambiguity 판정','최종 결과']) {
    assert.equal(Object.hasOwn(selected, key), true, key);
  }
  assert.equal(selected['가장 가까운 장소'], '가까운 곳');
  assert.equal(selected['가장 가까운 장소 pixel distance'], 3);
});

test('pointer and Kakao map lifecycle diagnostics are registered without intercepting touch', () => {
  assert.match(appSource, /addEventListener\('pointerdown',[^{\n]+\{passive:true,capture:true\}\)/);
  assert.match(appSource, /addEventListener\('pointermove',[^{\n]+\{passive:true,capture:true\}\)/);
  assert.match(appSource, /addEventListener\('pointerup',[^{\n]+\{passive:true,capture:true\}\)/);
  for (const event of ['click','dragstart','dragend','idle']) {
    assert.match(appSource, new RegExp(`logPlaceGesture\\('${event}'`));
  }
  assert.match(appSource, /\[Place Gesture\]/);
  assert.match(appSource, /\[Place Cache Invalidate\]/);
});

test('completed category refresh reports Place Cache counts and viewport identity', async () => {
  const context = loadApp();
  const cacheRecords = [];
  context.console = {...console,groupCollapsed(){},groupEnd(){},log(){},debug(){},table(value){if(value?.['category 요청 수']===18)cacheRecords.push(value)}};
  vm.runInContext(`
    kakao={maps:{services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    testCalls=[];state.placesService={categorySearch(code,callback,options){testCalls.push({code,callback,options})}};
  `, context);
  const refreshing = vm.runInContext('refreshVisiblePlaces()', context);
  context.testCalls.forEach((call,index)=>call.callback(index===0?[{id:'same',place_name:'장소',y:'37.5',x:'127'}]:index===1?[{id:'same',place_name:'장소',y:'37.5',x:'127'}]:[],index===17?'ERROR':index<2?'OK':'ZERO_RESULT'));
  await refreshing;
  assert.equal(cacheRecords.length, 1);
  assert.equal(cacheRecords[0]['성공 category 수'], 17);
  assert.equal(cacheRecords[0]['실패 category 수'], 1);
  assert.equal(cacheRecords[0]['총 검색 결과 수'], 2);
  assert.equal(cacheRecords[0]['중복 제거 후 visiblePlaces 수'], 1);
  assert.equal(typeof cacheRecords[0].bounds, 'string');
  assert.equal(cacheRecords[0].zoom, 4);
  assert.equal(typeof cacheRecords[0].visiblePlaceKey, 'string');
});

test('a map click suppressed by dragging never opens a place', async () => {
  const context = loadApp();
  const result = await vm.runInContext(`
    state.screen='map';
    state.map={getProjection:()=>({pointFromCoords:()=>({x:100,y:100})})};
    state.visiblePlaces=[{id:'near',latitude:37.5,longitude:127}];
    let testOpened=null;openPlace=place=>{testOpened=place};
    handleMapDragStart();handleMapDragEnd();
    Promise.resolve(handleMapClick({point:{x:100,y:100}})).then(place=>({place,opened:testOpened}));
  `, context);
  assert.equal(result.place, null);
  assert.equal(result.opened, null);
});

test('a genuine map click opens the cached viewport place through openPlace', async () => {
  const context = loadApp();
  const result = await vm.runInContext(`
    state.screen='map';
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})}),getProjection:()=>({pointFromCoords:ll=>({x:ll.longitude,y:ll.latitude})})};
    state.mapClickBlockedUntil=0;
    state.visiblePlaces=[{id:'inside',latitude:100,longitude:103}];state.visiblePlaceKey=visiblePlaceKey();
    let testOpened=null;
    openPlace=place=>{testOpened=place};
    Promise.resolve(handleMapClick({point:{x:100,y:100}})).then(place=>({returned:place?.id,opened:testOpened?.id}));
  `, context);
  assert.equal(result.returned, 'inside');
  assert.equal(result.opened, 'inside');
});

test('a map tap closes place history and allows the next map place to open', () => {
  const context = loadApp('?debug=place');
  const result = vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.map={
      getLevel:()=>4,
      getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})}),
      getProjection:()=>({pointFromCoords:ll=>({x:ll.longitude,y:ll.latitude})}),
      panTo(){},relayout(){}
    };
    testEntries=[{state:{screen:'map'},hash:'#map'}];testHistoryIndex=0;
    history={
      get state(){return testEntries[testHistoryIndex].state},
      pushState(entry,title,hash){testEntries.splice(testHistoryIndex+1);testEntries.push({state:entry,hash});testHistoryIndex++;window.location.hash=hash},
      replaceState(entry,title,hash){testEntries[testHistoryIndex]={state:entry,hash};window.location.hash=hash},
      back(){if(testHistoryIndex>0)testHistoryIndex--;window.location.hash=testEntries[testHistoryIndex].hash;handlePopState({state:this.state})}
    };
    state.screen='map';state.mapClickBlockedUntil=0;
    placeA={id:'a',name:'장소 A',latitude:100,longitude:103};
    placeB={id:'b',name:'장소 B',latitude:100,longitude:104};
    state.visiblePlaces=[placeA];state.visiblePlaceKey=visiblePlaceKey();
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:1});
    first=handleMapClick({point:{x:100,y:100}});
    screenAfterFirst=state.screen;
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:2});
    closeResult=handleMapClick({point:{x:200,y:200}});
    screenAfterClose=state.screen;
    closeRecord=placeDebugState.records.at(-1);
    state.visiblePlaces=[placeB];state.visiblePlaceKey=visiblePlaceKey();
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:3});
    second=handleMapClick({point:{x:100,y:100}});
    ({first:first?.id,screenAfterFirst,closeResult,screenAfterClose,closeScreen:closeRecord.screen,closeHash:closeRecord.locationHash,closeHistoryScreen:closeRecord.historyStateScreen,second:second?.id,selected:state.selectedPlace?.id});
  `, context);

  assert.equal(result.first, 'a');
  assert.equal(result.screenAfterFirst, 'place');
  assert.equal(result.closeResult, null);
  assert.equal(result.screenAfterClose, 'map');
  assert.equal(result.closeScreen, 'place');
  assert.equal(result.closeHash, '#place');
  assert.equal(result.closeHistoryScreen, 'place');
  assert.equal(result.second, 'b');
  assert.equal(result.selected, 'b');
});

test('a map tap closes a result-opened place back to results', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.map={panTo(){},relayout(){}};
    testEntries=[{state:{screen:'results',places:[],q:'카페'},hash:'#results'}];testHistoryIndex=0;
    history={
      get state(){return testEntries[testHistoryIndex].state},
      pushState(entry,title,hash){testEntries.splice(testHistoryIndex+1);testEntries.push({state:entry,hash});testHistoryIndex++;window.location.hash=hash},
      back(){if(testHistoryIndex>0)testHistoryIndex--;window.location.hash=testEntries[testHistoryIndex].hash;handlePopState({state:this.state})}
    };
    showMarkers=()=>{};renderResultsContent=()=>{};
    state.screen='results';state.searchResults=[];state.searchQuery='카페';
    openPlace({id:'a',name:'장소 A',latitude:37.5,longitude:127});
    screenAfterOpen=state.screen;
    handleMapClick({point:{x:100,y:100}});
    ({screenAfterOpen,screenAfterClose:state.screen,hash:window.location.hash,historyScreen:history.state.screen});
  `, context);

  assert.equal(result.screenAfterOpen, 'place');
  assert.equal(result.screenAfterClose, 'results');
  assert.equal(result.hash, '#results');
  assert.equal(result.historyScreen, 'results');
});

test('a programmatic map move cannot hit places cached for the previous bounds', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.screen='map';state.mapClickBlockedUntil=0;
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    testWest=126.9;
    state.map={
      getLevel:()=>4,
      getBounds:()=>({getSouthWest:()=>({getLng:()=>testWest,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>testWest+.2,getLat:()=>37.6})}),
      getProjection:()=>({pointFromCoords:()=>({x:100,y:100})})
    };
    state.visiblePlaceKey=visiblePlaceKey();state.visiblePlaces=[{id:'old',latitude:37.5,longitude:127}];
    testWest=127.2;let testOpened=null;openPlace=place=>{testOpened=place};
    ({returned:handleMapClick({point:{x:100,y:100}}),opened:testOpened});
  `, context);
  assert.equal(result.returned, null);
  assert.equal(result.opened, null);
});

test('a genuine user drag during result fitting still exposes search here', () => {
  const context = loadApp();
  vm.runInContext(`
    state.screen='results';state.searchMapFitPending=true;
    markSearchMapInteraction();handleMapDragStart();handleMapDragEnd();
  `, context);
  assert.equal(context.document.querySelector('#searchHereBtn').classList.contains('hidden'), false);
});

test('place search forwards valid map bounds and removes nearby radius mode', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  let requestedUrl = '';
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return { ok: true, json: async () => ({ documents: [] }) };
  };
  try {
    const handler = await apiHandler();
    const { output, response } = mockResponse();
    await handler({ method: 'GET', query: { query: '커피숍', rect: '126.9,37.4,127.1,37.6', size: '15' } }, response);
    assert.equal(output.status, 200);
    assert.equal(new URL(requestedUrl).searchParams.get('rect'), '126.9,37.4,127.1,37.6');
    const nearby = mockResponse();
    await handler({ method: 'GET', query: { nearby: '1', x: '127', y: '37.5', radius: '20' } }, nearby.response);
    assert.equal(nearby.output.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  }
});

test('search here uses the active query and current map rectangle', async () => {
  const context = loadApp();
  const requestUrls = [];
  context.fetch = async url => { requestUrls.push(String(url)); return {ok:true,json:async()=>({results:[]})}; };
  await vm.runInContext(`
    state.searchQuery='커피숍';
    state.map={getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    searchCurrentMap();
  `, context);
  const params = new URL(requestUrls[0], 'https://example.test').searchParams;
  assert.equal(params.get('query'), '커피숍');
  assert.equal(params.get('rect'), '126.9,37.4,127.1,37.6');
  assert.match(html, /id="searchHereBtn"[^>]*>여기서 재검색<\/button>/);
});

test('existing search result marker still opens the selected place', () => {
  const context = loadApp();
  vm.runInContext(`
    testMarkerClick=null;testOpened=null;
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    class TestBounds { extend(){} }
    class TestMarker { constructor(options){Object.assign(this,options)} setMap(map){this.map=map} }
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds,Marker:TestMarker,event:{addListener(target,type,listener){if(type==='click')testMarkerClick=listener}}}};
    state.map={setBounds(){}};openPlace=place=>{testOpened=place};
    showMarkers([{id:'result-place',latitude:37.5,longitude:127}]);
    testMarkerClick();
  `, context);
  assert.equal(vm.runInContext('testOpened.id', context), 'result-place');
});

test('route editor has one compact waypoint add button in the departure row', () => {
  const editor = html.match(/<section id="routeEditor"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(editor, /class="route-departure-row"[\s\S]*?id="departureField"[\s\S]*?id="addWaypointBtn"[^>]*>\s*\+\s*<\/button>/);
  assert.doesNotMatch(editor, /id="addWaypointBtn"[^>]*>[\s\S]*?<small>경유<\/small>/);
});

test('waypoint rows stay empty until a waypoint is actually selected', async () => {
  const context = loadApp();
  vm.runInContext('state.waypoints=[];updateRouteFields()', context);
  assert.equal(context.document.querySelector('#waypointFields').innerHTML, '');

  context.testWaypoint = { name: '선택 경유지', latitude: 37.51, longitude: 127.01 };
  await vm.runInContext(`
    state.editingEndpoint='waypoint';state.editingWaypointIndex=0;
    choosePlace(testWaypoint)
  `, context);
  assert.match(context.document.querySelector('#waypointFields').innerHTML, /선택 경유지/);
});

test('Kakao place normalization preserves official detail fields without inventing values', () => {
  const context = loadApp();
  context.testPlace = {
    id:'123', place_name:'Test Cafe', category_name:'Food > Cafe', phone:'02-123-4567',
    road_address_name:'Road 1', address_name:'Lot 2', place_url:'https://place.map.kakao.com/123',
    x:'127.1', y:'37.5', distance:'850'
  };
  const normalized = JSON.parse(JSON.stringify(vm.runInContext('normalizeKakaoPlace(testPlace)', context)));
  assert.deepEqual(normalized, {
    id:'123', name:'Test Cafe', category:'Food > Cafe', address:'Road 1',
    roadAddress:'Road 1', lotAddress:'Lot 2', placeUrl:'https://place.map.kakao.com/123',
    latitude:37.5, longitude:127.1, distance:850, phone:'02-123-4567'
  });
  context.emptyPlace = {id:'empty',place_name:'Empty',x:'127',y:'37'};
  const empty = vm.runInContext('normalizeKakaoPlace(emptyPlace)', context);
  assert.equal(empty.phone, '');
  assert.equal(empty.roadAddress, '');
  assert.equal(empty.lotAddress, '');
  assert.equal(empty.placeUrl, '');
});

test('place search API preserves official detail fields', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ok:true,json:async()=>({documents:[{
    id:'123',place_name:'Test Cafe',category_name:'Food > Cafe',phone:'02-123-4567',
    road_address_name:'Road 1',address_name:'Lot 2',place_url:'https://place.map.kakao.com/123',
    x:'127.1',y:'37.5',distance:'850'
  }]})});
  try {
    const handler=await apiHandler();
    const {output,response}=mockResponse();
    await handler({method:'GET',query:{query:'cafe',x:'127',y:'37.5'}},response);
    assert.deepEqual(output.body.results[0],{
      id:'123',name:'Test Cafe',category:'Food > Cafe',address:'Road 1',
      roadAddress:'Road 1',lotAddress:'Lot 2',placeUrl:'https://place.map.kakao.com/123',
      latitude:37.5,longitude:127.1,distance:850,phone:'02-123-4567'
    });
  } finally {
    globalThis.fetch=originalFetch;
    if(originalKey==null)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=originalKey;
  }
});

test('place sheet starts collapsed and only renders detail rows backed by Kakao values', () => {
  const context=loadApp();
  context.fullPlace={name:'Test Cafe',category:'Cafe',address:'Road 1',phone:'02-123-4567',roadAddress:'Road 1',lotAddress:'Lot 2',placeUrl:'https://place.map.kakao.com/123',distance:850};
  vm.runInContext('renderPlaceContent(fullPlace)',context);
  const sheet=context.document.querySelector('#sheet');
  const full=context.document.querySelector('#sheetContent').innerHTML;
  assert.equal(sheet.classList.contains('place-detail'),true);
  assert.equal(sheet.classList.contains('place-expanded'),false);
  assert.match(full,/class="place-extra"/);
  assert.match(full,/02-123-4567/);
  assert.match(full,/Road 1/);
  assert.match(full,/Lot 2/);
  assert.match(full,/850m/);
  assert.match(full,/href="https:\/\/place\.map\.kakao\.com\/123"/);
  assert.match(full,/카카오맵에서 자세히/);

  context.emptyDetail={name:'Only Name',category:'',address:'',phone:'',roadAddress:'',lotAddress:'',placeUrl:'',distance:null};
  vm.runInContext('renderPlaceContent(emptyDetail)',context);
  const empty=context.document.querySelector('#sheetContent').innerHTML;
  assert.doesNotMatch(empty,/place-phone|place-road-address|place-lot-address|place-distance|place-external/);
  assert.doesNotMatch(empty,/정보 없음|확인 필요/);
});

test('place handle expands, collapses, and dismisses without adding history', () => {
  const context=loadApp();
  let pushes=0,backs=0;
  context.history={pushState(){pushes++},back(){backs++}};
  context.testPlace={name:'Place',category:'Cafe',address:'Road'};
  vm.runInContext('state.screen="place";renderPlaceContent(testPlace)',context);
  const handle=context.document.querySelector('#sheetHandle');
  const sheet=context.document.querySelector('#sheet');

  handle.dispatch('pointerdown',{clientY:300});
  handle.dispatch('pointermove',{clientY:220});
  handle.dispatch('pointerup',{clientY:220});
  assert.equal(sheet.classList.contains('place-expanded'),true);
  assert.equal(pushes,0);

  handle.dispatch('pointerdown',{clientY:220});
  handle.dispatch('pointermove',{clientY:280});
  handle.dispatch('pointerup',{clientY:280});
  assert.equal(sheet.classList.contains('place-expanded'),false);
  assert.equal(pushes,0);

  handle.dispatch('pointerdown',{clientY:220});
  handle.dispatch('pointermove',{clientY:330});
  handle.dispatch('pointerup',{clientY:330});
  assert.equal(backs,1);
  assert.equal(pushes,0);
});

test('navigation destination sheet keeps its existing non-draggable behavior', () => {
  const context=loadApp();
  let backs=0;
  context.history={pushState(){},back(){backs++}};
  context.testPlace={name:'Destination',category:'Place',address:'Road'};
  vm.runInContext('state.screen="navigation-place";renderNavigationPlaceContent(testPlace)',context);
  const handle=context.document.querySelector('#sheetHandle');
  const sheet=context.document.querySelector('#sheet');
  handle.dispatch('pointerdown',{clientY:300});
  handle.dispatch('pointermove',{clientY:200});
  handle.dispatch('pointerup',{clientY:200});
  assert.equal(sheet.classList.contains('place-expanded'),false);
  assert.equal(backs,0);
});

test('expanded place content is scrollable and safe-area padded while map hit thresholds stay fixed', () => {
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.sheet\.place-detail\.place-expanded/);
  assert.match(css,/\.place-extra/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(appSource,/PLACE_HIT_RADIUS_PX=28,PLACE_AMBIGUITY_PX=6/);
});
