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
  const matchesSelector = (element, selector) => {
    const dataMatch = selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return element.dataset[key] != null && (dataMatch[2] == null || element.dataset[key] === dataMatch[2]);
    }
    return selector.startsWith('#') && element.id === selector.slice(1);
  };
  const makeElement = (initial = {}) => {
    const classes = new Set(initial.classes || ['hidden']);
    const listeners = new Map();
    const children = [];
    let htmlValue = '';
    const element = {
      id: initial.id || '', dataset: {...(initial.dataset || {})}, onclick: null,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name),
      },
      style: {
        values: new Map(),
        setProperty(name, value) { this.values.set(name, value); },
        getPropertyValue(name) { return this.values.get(name) || ''; },
      },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatch(type, event = {}) { return listeners.get(type)?.({stopPropagation() {},preventDefault() {},pointerId:1,clientY:0,...event}); },
      querySelectorAll(selector) { return children.filter(child => matchesSelector(child, selector)); },
      querySelector(selector) { return children.find(child => matchesSelector(child, selector)) || makeElement({classes:[]}); },
      setPointerCapture() {}, focus() {}, blur() {},
      getBoundingClientRect() { return {top: 100, bottom: 200, height: 100}; },
      offsetHeight: 600, value: '', textContent: '',
    };
    Object.defineProperty(element, 'innerHTML', {
      get() { return htmlValue; },
      set(value) {
        htmlValue = String(value);
        children.length = 0;
        for (const match of htmlValue.matchAll(/<button\b([^>]*)>/gi)) {
          const attributes = match[1];
          const id = attributes.match(/\bid="([^"]+)"/)?.[1] || '';
          const classNames = attributes.match(/\bclass="([^"]+)"/)?.[1].split(/\s+/).filter(Boolean) || [];
          const dataset = {};
          for (const data of attributes.matchAll(/\bdata-([\w-]+)="([^"]*)"/g)) {
            const key = data[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            dataset[key] = data[2];
          }
          const child = makeElement({id, classes: classNames, dataset});
          children.push(child);
          if (id) elements.set(`#${id}`, child);
        }
      },
    });
    return element;
  };
  const navActions = ['volume', 'theme', 'recalc', 'pause', 'add-route', 'alternate-route'].map(navAction => makeElement({classes:[], dataset:{navAction}}));
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    querySelectorAll(selector) { return selector === '[data-nav-action]' ? navActions : []; },
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

function installNavigationFlowEnvironment(context) {
  const recentPlace={id:'added',name:'Added',latitude:37.02,longitude:127.02};
  const stored=new Map([['ridemate_recent_searches',JSON.stringify([{query:'Added',place:recentPlace}])]]);
  context.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  context.testPreviewRoutes=[
    {id:'preview-a',label:'A',routeMode:'BIKE_ONLY',totalDistance:1200,totalTime:600,route:{legs:[{steps:[{properties:{guidance:'직진',distance:1200,time:600},path:{points:[[127,37],[127.02,37.02]]}}]}]}},
    {id:'preview-b',label:'B',routeMode:'SHORTEST',totalDistance:1000,totalTime:500,route:{legs:[{steps:[{properties:{guidance:'우회전',distance:1000,time:500},path:{points:[[127,37],[127.01,37.01],[127.02,37.02]]}}]}]}}
  ];
  context.testRouteRequests=[];
  context.fetch=async url=>{context.testRouteRequests.push(String(url));return{ok:true,json:async()=>({routes:context.testPreviewRoutes,performance:{}})}};
  context.testWatchStarts=0;
  context.navigator={geolocation:{getCurrentPosition(){},watchPosition(){context.testWatchStarts++;return 999},clearWatch(){}}};
  vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestBounds {constructor(){this.points=[]}extend(point){this.points.push(point)}isEmpty(){return this.points.length===0}}
    class TestPolyline {constructor(options){Object.assign(this,options);testPolylines.push(this)}setMap(map){this.map=map}setOptions(options){Object.assign(this,options)}setPath(path){this.path=path}}
    class TestOverlay {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setPosition(position){this.position=position}}
    class TestMarker {constructor(options){Object.assign(this,options);this.listeners={}}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(source,size,options){Object.assign(this,{source,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    testPolylines=[];
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds,Polyline:TestPolyline,CustomOverlay:TestOverlay,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(target,type,listener){target.listeners[type]=listener}}}};
    testOrigin={id:'origin',name:'Current',latitude:37,longitude:127};
    testExisting={id:'existing',name:'Existing',latitude:37.01,longitude:127.01};
    testDestination={id:'destination',name:'Destination',latitude:37.03,longitude:127.03};
    testOriginalRoute={id:'original',routeMode:'BIKE_ONLY',totalDistance:1500,totalTime:700,_points:[testOrigin,testDestination],_steps:[{guidance:'기존 안내',_startAlong:0,_endAlong:1500,points:[testOrigin,testDestination]}]};
    state.currentLocation=testOrigin;state.waypoints=[testExisting];state.destination=testDestination;state.routes=[testOriginalRoute];state.selectedRoute=0;
    state.nav.watchId=88;state.nav.steps=testOriginalRoute._steps;state.nav.progressDistance=300;state.nav.currentStep=0;state.nav.follow=true;
    testCameraLevels=[];testCameraTargets=[];
    state.map={getLevel:()=>testCameraLevels.at(-1)??4,getCenter:()=>testOrigin,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>36.9}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.1})}),getProjection:()=>({pointFromCoords:point=>({x:point.longitude*1000,y:-point.latitude*1000}),coordsFromPoint:point=>({latitude:-point.y/1000,longitude:point.x/1000})}),setLevel(level){testCameraLevels.push(level)},setCenter(center){testCameraTargets.push(center)},setBounds(){},relayout(){},panTo(target){testCameraTargets.push(target)}};
    testEntries=[{state:{screen:'navigation'},hash:'#navigation'}];testHistoryIndex=0;
    history={
      get state(){return testEntries[testHistoryIndex].state},
      pushState(entry,title,hash){testEntries.splice(testHistoryIndex+1);testEntries.push({state:entry,hash});testHistoryIndex++;window.location.hash=hash},
      replaceState(entry,title,hash){testEntries[testHistoryIndex]={state:entry,hash};window.location.hash=hash},
      back(){if(testHistoryIndex>0)testHistoryIndex--;window.location.hash=testEntries[testHistoryIndex].hash;handlePopState({state:this.state})}
    };
    renderScreen('navigation',false);
  `,context);
  return {recentPlace};
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

test('place debug panel stays empty when RideMate category overlays are disabled', async () => {
  const context = loadApp('?debug=place');
  vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestMarker {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(src,size,options){Object.assign(this,{src,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    kakao={maps:{LatLng:TestLatLng,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(){}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})}),getProjection:()=>({pointFromCoords:point=>({x:point.longitude*1000,y:point.latitude*1000})})};
    state.placesService={categorySearch(code,callback){testCalls.push(callback)}};
    testCalls=[];
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:1});
    invalidateVisiblePlaces('dragstart');
    logPlaceGesture('click',{point:{x:100,y:100}});
    logPlaceTap({point:{x:100,y:100}},'NO_VISIBLE_PLACES',null,visiblePlaceKey());
  `, context);
  const refresh = vm.runInContext('refreshVisiblePlaces()', context);
  await refresh;

  assert.equal(vm.runInContext('placeDebugState.records[0].visiblePlaces', context), 0);
  assert.equal(context.testCalls.length, 0);
  assert.match(context.document.querySelector('#placeDebugCurrent').innerHTML, /live visiblePlaces: 0/);
});

test('Kakao SDK keeps search services but does not index categories for map overlays', async () => {
  const context = loadApp();
  assert.match(appSource, /libraries=services/);
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    class TestMarker {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(src,size,options){Object.assign(this,{src,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    kakao={maps:{LatLng:TestLatLng,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(){}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={
      getLevel:()=>4,
      getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})}),
      getProjection:()=>({pointFromCoords:point=>({x:point.longitude*1000,y:point.latitude*1000})})
    };
    testCategoryCalls=[];
    state.placesService={categorySearch(code,callback,options){testCategoryCalls.push({code,callback,options})}};
  `, context);
  const refresh = vm.runInContext('refreshVisiblePlaces()', context);
  await refresh;
  assert.equal(context.testCategoryCalls.length, 0);
  assert.equal(vm.runInContext('state.visiblePlaces.length', context), 0);
  const cached = vm.runInContext('refreshVisiblePlaces()', context);
  await cached;
  assert.equal(context.testCategoryCalls.length, 0);
});

test('viewport refreshes cannot repopulate disabled RideMate POI overlays', async () => {
  const context = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    class TestMarker {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(src,size,options){Object.assign(this,{src,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    kakao={maps:{LatLng:TestLatLng,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(){}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    testWest=126.9;testCalls=[];
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>testWest,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>testWest+.2,getLat:()=>37.6})}),getProjection:()=>({pointFromCoords:point=>({x:point.longitude*1000,y:point.latitude*1000})})};
    state.placesService={categorySearch(code,callback,options){testCalls.push({code,callback,options})}};
  `, context);
  const oldRefresh = vm.runInContext('refreshVisiblePlaces()', context);
  vm.runInContext('testWest=127.2', context);
  const newRefresh = vm.runInContext('refreshVisiblePlaces()', context);
  await newRefresh;
  await oldRefresh;
  assert.equal(context.testCalls.length, 0);
  assert.equal(vm.runInContext('state.visiblePlaces.length', context), 0);
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
  assert.equal(context.testCategoryCalls.length, 0);
  vm.runInContext('handleMapZoomChanged()', context);
  assert.equal(context.document.querySelector('#searchHereBtn').classList.contains('hidden'), false);
});

test('map click handler never invokes the legacy nearest-place hit test', () => {
  assert.doesNotMatch(appSource,/function handleMapClick\([^\n]+visiblePlaceHitTest/);
});

test('base-map click reports that Kakao supplied no place identity', () => {
  const context = loadApp();
  const records = [];
  context.console = {
    ...console,
    groupCollapsed() {}, groupEnd() {},
    table(value) { if (value?.['최종 결과']) records.push(value); },
    log() {}, debug() {},
  };
  vm.runInContext(`
    state.screen='map';state.mapClickBlockedUntil=0;
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    state.visiblePlaces=[{id:'near',name:'가까운 곳',latitude:100,longitude:103}];
    state.visiblePlaceKey=visiblePlaceKey();openPlace=()=>{throw new Error('base map must not open a place')};
    handleMapClick({point:{x:100,y:100}});
  `, context);
  assert.deepEqual(records.map(record => record['최종 결과']), ['BASE_MAP_NO_PLACE_ID']);
  const selected = records[0];
  for (const key of ['screen','event.point','map level','visiblePlaces count','visiblePlaceKey','current visiblePlaceKey()','mapClickBlockedUntil','현재 blocked 여부','가장 가까운 장소','가장 가까운 장소 pixel distance','두 번째로 가까운 장소','두 번째 장소 pixel distance','ambiguity 판정','최종 결과']) {
    assert.equal(Object.hasOwn(selected, key), true, key);
  }
  assert.equal(selected['가장 가까운 장소'], null);
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

test('disabled category refresh does not issue or report category searches', async () => {
  const context = loadApp();
  const cacheRecords = [];
  context.console = {...console,groupCollapsed(){},groupEnd(){},log(){},debug(){},table(value){if(value?.['category 요청 수']===18)cacheRecords.push(value)}};
  vm.runInContext(`
    kakao={maps:{services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    testCalls=[];state.placesService={categorySearch(code,callback,options){testCalls.push({code,callback,options})}};
  `, context);
  const refreshing = vm.runInContext('refreshVisiblePlaces()', context);
  await refreshing;
  assert.equal(context.testCalls.length, 0);
  assert.equal(cacheRecords.length, 0);
  assert.equal(vm.runInContext('state.visiblePlaces.length', context), 0);
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

test('a genuine base-map click does not open a cached viewport place', async () => {
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
  assert.equal(result.returned, undefined);
  assert.equal(result.opened, undefined);
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
    state.visiblePlaces=[placeA];state.visiblePlaceKey=visiblePlaceKey();state.visiblePlaceGeneration=1;
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:1});
    first=handleCategoryMarkerClick(placeA,1,state.visiblePlaceKey,[placeA]);
    screenAfterFirst=state.screen;
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:2});
    closeResult=handleMapClick({point:{x:200,y:200}});
    screenAfterClose=state.screen;
    closeRecord=placeDebugState.records.at(-1);
    state.visiblePlaces=[placeB];state.visiblePlaceKey=visiblePlaceKey();
    handleMapPointerEvent({type:'pointerdown',pointerType:'touch',pointerId:3});
    second=handleCategoryMarkerClick(placeB,1,state.visiblePlaceKey,[placeB]);
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
  const requestedUrls = [];
  globalThis.fetch = async url => {
    requestedUrls.push(String(url));
    return { ok: true, json: async () => ({ documents: [] }) };
  };
  try {
    const handler = await apiHandler();
    const { output, response } = mockResponse();
    await handler({ method: 'GET', query: { query: '커피숍', rect: '126.9,37.4,127.1,37.6', size: '15' } }, response);
    assert.equal(output.status, 200);
    const keywordUrl=requestedUrls.find(url=>url.includes('/search/keyword.json'));
    assert.equal(new URL(keywordUrl).searchParams.get('rect'), '126.9,37.4,127.1,37.6');
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

test('live Kakao autocomplete keeps the keyboard open and selects the exact place object', () => {
  const context=loadApp();
  const box=context.document.querySelector('#liveResults'),input=context.document.querySelector('#searchInput');
  let blurCount=0;input.blur=()=>{blurCount++};
  const placeButton={dataset:{i:'0'}},routeButtons=[];
  box.querySelectorAll=selector=>selector==='[data-i]'?[placeButton]:routeButtons;
  context.testPlaces=[
    {id:'starbucks',name:'스타벅스 동광주DT점',category:'카페',address:'광주 북구',latitude:37.5,longitude:127,distance:120},
    {id:'other',name:'스타커피',category:'카페',address:'광주 북구',latitude:37.51,longitude:127.01,distance:250}
  ];
  const result=vm.runInContext(`
    testChosen=null;choosePlace=place=>{testChosen=place};
    renderLive(testPlaces,'스타',null);
    document.querySelector('#liveResults').querySelectorAll('[data-i]')[0].onclick();
    ({chosen:testChosen===testPlaces[0],html:document.querySelector('#liveResults').innerHTML});
  `,context);
  assert.equal(blurCount,0);
  assert.equal(result.chosen,true);
  assert.match(result.html,/스타벅스 동광주DT점/);
});

test('main map keeps the menu but moves saved-place shortcuts into the search landing', () => {
  const mapHeader=html.match(/<header id="mapHeader"[\s\S]*?<\/header>/)?.[0]||'';
  const searchLanding=html.match(/<div id="searchLanding">[\s\S]*?<div id="liveResults"/)?.[0]||'';
  assert.match(mapHeader,/id="searchEntry"[\s\S]*id="menuBtn"/);
  assert.doesNotMatch(html,/id="quickActions"/);
  assert.match(searchLanding,/class="search-shortcuts"/);
  for(const shortcut of ['home','work','favorite'])assert.match(searchLanding,new RegExp(`data-quick="${shortcut}"`));
  assert.match(searchLanding,/<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(searchLanding,/🚲|id="bikeShopBtn"|자전거샵/);
  assert.match(appSource,/\$\$\('\[data-quick\]'\)/);
  assert.doesNotMatch(appSource,/bikeShopBtn/);
});

test('empty search shows structured recent rows and typed search uses only matching recent candidates', () => {
  const context=loadApp();
  const stored=new Map([['ridemate_recent_searches',JSON.stringify([
    {query:'스타벅스 방학점',place:{id:'recent-star',name:'스타벅스 방학점',category:'카페',address:'서울 도봉구',latitude:37.66,longitude:127.04}},
    {query:'스타필드'},
    {query:'광화문',place:{id:'unrelated',name:'광화문',category:'장소',address:'서울 종로구',latitude:37.57,longitude:126.98}}
  ])]]);
  context.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  const box=context.document.querySelector('#liveResults');
  vm.runInContext("openSearch();renderLive([{id:'api-star',name:'스타커피',category:'카페',address:'서울',latitude:37.5,longitude:127}],'스타')",context);
  const live=box.innerHTML;
  const landing=context.document.querySelector('#recentSearches').innerHTML;
  assert.match(landing,/class="recent recent-row"/);
  assert.match(landing,/class="recent-icon"/);
  assert.match(landing,/스타벅스 방학점/);
  assert.match(live,/스타벅스 방학점/);
  assert.match(live,/스타필드/);
  assert.match(live,/스타커피/);
  assert.doesNotMatch(live,/광화문/);
});

test('only the newest rapid autocomplete response is rendered', async () => {
  const context=loadApp();
  const result=await vm.runInContext(`
    testResolvers={};testRenders=[];
    searchPlaces=query=>new Promise(resolve=>{testResolvers[query]=resolve});
    renderLive=(places,query)=>testRenders.push({query,id:places[0]?.id});
    const first=doSearch('스',true),second=doSearch('스타',true),third=doSearch('스타벅',true);
    testResolvers['스타벅']([{id:'latest'}]);
    testResolvers['스']([{id:'old-1'}]);
    testResolvers['스타']([{id:'old-2'}]);
    Promise.all([first,second,third]).then(()=>testRenders);
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[{query:'스타벅',id:'latest'}]);
});

test('first-use place spelling correction handles common Hangul typos conservatively', () => {
  const context=loadApp();
  const result=vm.runInContext(`({
    pork:findSearchCorrection('삽겹살',[]),
    coffee:findSearchCorrection('스타벅수',[]),
    bicycle:findSearchCorrection('쟈전거',[]),
    correct:findSearchCorrection('삼겹살',[]),
    special:findSearchCorrection('삽겹살연구소',[{name:'삽겹살연구소',category:'음식점'}]),
    ambiguous:findSearchCorrection('가바다',[],['가나다','가마다'])
  })`,context);
  assert.equal(result.pork?.term,'삼겹살');
  assert.equal(result.coffee?.term,'스타벅스');
  assert.equal(result.bicycle?.term,'자전거');
  assert.equal(result.correct,null);
  assert.equal(result.special,null);
  assert.equal(result.ambiguous,null);
});

test('spelling suggestion is separate from autocomplete and searches only after user choice', () => {
  const context=loadApp();
  const box=context.document.querySelector('#liveResults'),correctionButton={dataset:{correction:'삼겹살'}};
  box.querySelectorAll=selector=>selector==='[data-correction]'?[correctionButton]:[];
  const result=vm.runInContext(`
    testSearches=[];doSearch=(query,live)=>testSearches.push({query,live});
    renderLive([], '삽겹살', {term:'삼겹살'});
    before=testSearches.length;
    document.querySelector('#liveResults').querySelectorAll('[data-correction]')[0].onclick();
    ({before,searches:testSearches,html:document.querySelector('#liveResults').innerHTML});
  `,context);
  assert.equal(result.before,0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.searches)),[{query:'삼겹살',live:false}]);
  assert.match(result.html,/혹시 <b>삼겹살<\/b>/);
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
    showMarkers([{id:'result-place',name:'Result Place',latitude:37.5,longitude:127}]);
    testMarkerClick();
  `, context);
  assert.equal(vm.runInContext('testOpened.id', context), 'result-place');
});

test('RideMate category POI overlays stay disabled on map and navigation', async () => {
  const context = loadApp();
  const result = await vm.runInContext(`(async()=>{
    testCategoryCalls=[];testMarkerCount=0;testListeners=0;
    class TestMarker {constructor(){testMarkerCount++}setMap(){}}
    kakao={maps:{Marker:TestMarker,event:{addListener(){testListeners++}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'}}}};
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>126.9,getLat:()=>37.4}),getNorthEast:()=>({getLng:()=>127.1,getLat:()=>37.6})})};
    state.placesService={categorySearch(code,callback,options){testCategoryCalls.push({code,callback,options})}};
    const place={id:'poi',name:'POI',latitude:37.5,longitude:127};
    state.screen='map';renderCategoryPlaceMarkers([place],0,'');await refreshVisiblePlaces();
    const map={markers:state.categoryPlaceMarkers.length,visible:state.visiblePlaces.length};
    state.screen='navigation';renderCategoryPlaceMarkers([place],0,'');await refreshVisiblePlaces();
    return {map,navigation:{markers:state.categoryPlaceMarkers.length,visible:state.visiblePlaces.length},categoryCalls:testCategoryCalls.length,created:testMarkerCount,listeners:testListeners};
  })()`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    map:{markers:0,visible:0},navigation:{markers:0,visible:0},categoryCalls:0,created:0,listeners:0
  });
  assert.doesNotMatch(appSource,/function categoryMarkerImage|CATEGORY_POI_/);
});

test('category candidates create no grouped labels, individual pills, or click targets', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    testListeners=[];
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestMarker {constructor(options){Object.assign(this,options);this.listeners={}}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(src,size,options){Object.assign(this,{src,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    kakao={maps:{LatLng:TestLatLng,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(target,type,listener){target.listeners[type]=listener;testListeners.push(listener)}}}};
    state.map={getProjection:()=>({pointFromCoords:point=>({x:point.longitude,y:point.latitude})})};
    visiblePlaceKey=()=> 'viewport';state.visiblePlaceKey='viewport';state.visiblePlaceGeneration=4;
    const first={id:'first',name:'First Cafe',latitude:100,longitude:100};
    const hidden={id:'hidden',name:'Hidden Cafe',latitude:102,longitude:104};
    const separate={id:'separate',name:'Separate Cafe',latitude:100,longitude:300};
    testOpened=[];selectRideMatePlace=place=>testOpened.push(place.id);
    renderCategoryPlaceMarkers([first,hidden,separate],4,'viewport');
    ({markers:state.categoryPlaceMarkers.length,listeners:testListeners.length,visible:state.visiblePlaces.length,opened:testOpened});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{markers:0,listeners:0,visible:0,opened:[]});
});

test('navigation creates no RideMate POI overlay layer', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){Object.assign(this,{latitude,longitude})}}
    class TestMarker {constructor(options){Object.assign(this,options);this.listeners={}}setMap(map){this.map=map}}
    class TestMarkerImage {constructor(src,size,options){Object.assign(this,{src,size,options})}}
    class TestSize {constructor(width,height){Object.assign(this,{width,height})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    kakao={maps:{LatLng:TestLatLng,Marker:TestMarker,MarkerImage:TestMarkerImage,Size:TestSize,Point:TestPoint,event:{addListener(target,type,listener){target.listeners[type]=listener}}}};
    state.screen='navigation';state.map={getProjection:()=>({pointFromCoords:()=>({x:100,y:100})})};
    visiblePlaceKey=()=> 'viewport';state.visiblePlaceKey='viewport';state.visiblePlaceGeneration=5;
    renderCategoryPlaceMarkers([{id:'poi',name:'POI',latitude:37.5,longitude:127}],5,'viewport');
    ({markers:state.categoryPlaceMarkers.length,visible:state.visiblePlaces.length});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{markers:0,visible:0});
});

test('category marker selection remains reliable for ten closes and opens', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.screen='map';state.visiblePlaceGeneration=7;state.visiblePlaceKey='viewport';
    visiblePlaceKey=()=> 'viewport';
    const placeA={id:'a',name:'A',latitude:37.5,longitude:127},placeB={id:'b',name:'B',latitude:37.6,longitude:127.1};
    testOpened=[];openPlace=place=>{testOpened.push(place.id);state.screen='place'};
    for(let i=0;i<10;i++){
      state.screen='map';
      handleCategoryMarkerClick(i%2?placeB:placeA,7,'viewport',[i%2?placeB:placeA]);
    }
    testOpened;
  `, context);
  assert.deepEqual([...result], ['a','b','a','b','a','b','a','b','a','b']);
});

test('category markers replace an open place card with one tap and one history entry', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.map={panTo(){},relayout(){}};state.visiblePlaceGeneration=8;state.visiblePlaceKey='viewport';visiblePlaceKey=()=> 'viewport';
    testPushes=[];testReplaces=[];history={pushState(entry){testPushes.push(entry)},replaceState(entry){testReplaces.push(entry)}};
    const places=[1,2,3].map(id=>({id:String(id),name:'Place '+id,latitude:37+id/100,longitude:127}));
    const selected=[];renderPlaceContent=place=>selected.push(place.id);
    for(const place of places)handleCategoryMarkerClick(place,8,'viewport',[place]);
    ({selected,pushes:testPushes.map(entry=>entry.place.id),replaces:testReplaces.map(entry=>entry.place.id),current:state.selectedPlace.id,screen:state.screen});
  `,context);
  assert.deepEqual([...result.selected],['1','2','3']);
  assert.deepEqual([...result.pushes],['1']);
  assert.deepEqual([...result.replaces],['2','3']);
  assert.equal(result.current,'3');
  assert.equal(result.screen,'place');
});

test('a marker tap replaces place detail instead of being consumed as dismissal', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    state.visiblePlaceGeneration=5;state.visiblePlaceKey='viewport';visiblePlaceKey=()=> 'viewport';
    state.screen='place';testBacks=0;testOpened=[];history={back(){testBacks++;state.screen='map'}};openPlace=place=>testOpened.push(place.id);
    const placeB={id:'b',name:'B',latitude:37.5,longitude:127};
    const closeResult=handleCategoryMarkerClick(placeB,5,'viewport',[placeB]);
    ({backs:testBacks,opened:testOpened,closeResult:closeResult?.id});
  `,context);
  assert.equal(result.backs,0);
  assert.deepEqual([...result.opened],['b']);
  assert.equal(result.closeResult,'b');
});

test('stale category marker and blank base-map click cannot open a guessed place', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.screen='map';state.visiblePlaceGeneration=2;state.visiblePlaceKey='new';
    visiblePlaceKey=()=> 'new';
    testOpened=[];openPlace=place=>testOpened.push(place.id);
    handleCategoryMarkerClick({id:'old'},1,'old',[{id:'old'}]);
    state.mapClickBlockedUntil=0;
    state.visiblePlaces=[{id:'near',latitude:100,longitude:100}];
    state.map={getLevel:()=>4,getBounds:()=>({getSouthWest:()=>({getLng:()=>0,getLat:()=>0}),getNorthEast:()=>({getLng:()=>1,getLat:()=>1})}),getProjection:()=>({pointFromCoords:()=>({x:100,y:100})})};
    state.visiblePlaceKey=visiblePlaceKey();
    handleMapClick({point:{x:100,y:100}});
    testOpened;
  `, context);
  assert.deepEqual([...result], []);
});

test('bounds change removes old category targets before idle refresh', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    testWest=126.9;visiblePlaceKey=()=>String(testWest);
    state.visiblePlaceKey='126.9';state.visiblePlaceGeneration=4;state.visiblePlaces=[{id:'old'}];
    testRemoved=0;state.categoryPlaceMarkers=[{marker:{setMap(map){if(map===null)testRemoved++}}}];
    testWest=127.2;handleMapBoundsChanged();
    ({removed:testRemoved,markers:state.categoryPlaceMarkers.length,places:state.visiblePlaces.length,key:state.visiblePlaceKey});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{removed:1,markers:0,places:0,key:''});
  assert.match(appSource,/addListener\(state\.map,'bounds_changed',handleMapBoundsChanged\)/);
});

test('a visible category marker opens only its own place and never hidden collision choices', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.screen='map';state.visiblePlaceGeneration=3;state.visiblePlaceKey='viewport';
    visiblePlaceKey=()=> 'viewport';
    const starbucks={id:'starbucks',name:'스타벅스'},restaurant={id:'restaurant',name:'맛자랑가족사랑'};
    starbucks.latitude=37.5;starbucks.longitude=127;restaurant.latitude=37.5;restaurant.longitude=127;
    testOpened=[];testChoices=[];
    openPlace=place=>testOpened.push(place.id);
    openCategoryPlaceChoice=places=>testChoices=places;
    handleCategoryMarkerClick(starbucks,3,'viewport',[starbucks,restaurant]);
    ({opened:testOpened,choices:testChoices.map(place=>place.id)});
  `, context);
  assert.deepEqual([...result.opened], ['starbucks']);
  assert.deepEqual([...result.choices], []);
});

test('blank map tap dismisses an overlapping-place chooser and its place history entry once', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    state.screen='place';state.categoryPlaceChoices=[{id:'a'},{id:'b'}];
    state.mapClickBlockedUntil=0;testBacks=0;
    history={state:{screen:'place'},back(){testBacks++;state.screen='map'}};
    document.querySelector('#navMenu').classList.add('hidden');
    handleMapClick({point:{x:300,y:300}});
    ({backs:testBacks,choices:state.categoryPlaceChoices.length});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{backs:1,choices:0});
});

test('blank navigation map tap dismisses an overlapping-place chooser without leaving navigation', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    state.screen='navigation';state.categoryPlaceChoices=[{id:'a'},{id:'b'}];
    state.mapClickBlockedUntil=0;testBacks=0;
    history={state:{screen:'navigation'},back(){testBacks++}};
    document.querySelector('#navMenu').classList.add('hidden');
    document.querySelector('#sheet').classList.remove('hidden');
    handleMapClick({point:{x:300,y:300}});
    ({backs:testBacks,choices:state.categoryPlaceChoices.length,sheetHidden:document.querySelector('#sheet').classList.contains('hidden'),screen:state.screen});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{backs:0,choices:0,sheetHidden:true,screen:'navigation'});
});

test('category marker recent search stores the exact opened place', () => {
  const context = loadApp();
  const stored = new Map();
  context.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    kakao={maps:{LatLng:TestLatLng}};
    state.map={panTo(){},relayout(){}};
    state.screen='map';state.visiblePlaceGeneration=4;state.visiblePlaceKey='viewport';visiblePlaceKey=()=> 'viewport';
    history={pushState(){}};
    testStarbucks={id:'starbucks',name:'스타벅스 동광주DT점',latitude:37.51,longitude:126.91};
    handleCategoryMarkerClick(testStarbucks,4,'viewport',[testStarbucks]);
  `, context);
  const recent = JSON.parse(stored.get('ridemate_recent_searches'));
  assert.equal(recent[0].place.id, 'starbucks');
  assert.equal(recent[0].place.name, '스타벅스 동광주DT점');
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

test('deleting the first waypoint renumbers the remainder and recalculates to the same destination', async () => {
  const context=loadApp();
  const result=await vm.runInContext(`(async()=>{
    const departure={id:'origin',name:'Origin',latitude:37,longitude:127};
    const first={id:'waypoint-1',name:'First',latitude:37.01,longitude:127.01};
    const second={id:'waypoint-2',name:'Second',latitude:37.02,longitude:127.02};
    const destination={id:'destination',name:'Destination',latitude:37.03,longitude:127.03};
    state.departure=departure;state.waypoints=[first,second];state.destination=destination;
    testRequests=[];loadRoutes=async()=>{testRequests.push({waypoints:state.waypoints.map(place=>place.id),destination:state.destination.id})};
    updateRouteFields();
    const before=$('#waypointFields').innerHTML;
    const removers=$('#waypointFields').querySelectorAll('[data-waypoint-remove]');
    if(removers[0])await removers[0].onclick({stopPropagation(){}});
    return{before,removerCount:removers.length,waypoints:state.waypoints.map(place=>place.id),after:$('#waypointFields').innerHTML,requests:testRequests,destination:state.destination.id};
  })()`,context);
  assert.equal(result.removerCount,2);
  assert.match(result.before,/경유 1/);
  assert.match(result.before,/경유 2/);
  assert.deepEqual([...result.waypoints],['waypoint-2']);
  assert.match(result.after,/경유 1/);
  assert.doesNotMatch(result.after,/경유 2/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.requests)),[{waypoints:['waypoint-2'],destination:'destination'}]);
  assert.equal(result.destination,'destination');
});

test('route overview start enters multi-waypoint guidance with the confirmed full route and markers', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){Object.assign(this,{latitude,longitude})}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    class TestPolyline {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setOptions(options){Object.assign(this,options)}setPath(path){this.path=path}}
    class TestOverlay {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    kakao={maps:{LatLng:TestLatLng,Point:TestPoint,Polyline:TestPolyline,CustomOverlay:TestOverlay}};
    const origin={id:'origin',name:'Origin',latitude:37,longitude:127};
    const waypoint1={id:'waypoint-1',name:'Waypoint 1',latitude:37.01,longitude:127.01};
    const waypoint2={id:'waypoint-2',name:'Waypoint 2',latitude:37.02,longitude:127.02};
    const destination={id:'destination',name:'Destination',latitude:37.03,longitude:127.03};
    const selected={id:'full-route',totalDistance:9000,totalTime:5400,_points:[origin,waypoint1,waypoint2,destination],_steps:[{guidance:'직진',_startAlong:0,_endAlong:9000,points:[origin,waypoint1,waypoint2,destination]}]};
    state.departure=origin;state.currentLocation=origin;state.waypoints=[waypoint1,waypoint2];state.destination=destination;state.routes=[selected];state.selectedRoute=0;state.routeLines=[];
    state.map={setLevel(){},relayout(){},getProjection:()=>({pointFromCoords:()=>({x:500,y:500}),coordsFromPoint:point=>point}),panTo(){}};
    renderScreen=screen=>{state.screen=screen};clearSearchMarkers=()=>{};setGpsMarker=()=>{};startWatch=()=>{state.nav.watchId=77};toast=()=>{};
    $('#startNavBtn').onclick();
    state.nav.hudMode='remaining';updateNavHud(origin);
    ({
      screen:state.screen,routeSame:state.routes[state.selectedRoute]===selected,
      waypoints:state.waypoints.map(place=>place.id),destination:state.destination.id,
      stepsSame:state.nav.steps===selected._steps,
      lineExists:!!state.routeLines[state.selectedRoute],path:state.routeLines[state.selectedRoute]?.path?.map(point=>[point.latitude,point.longitude]),
      markers:state.routeEndpointMarkers.map(marker=>marker.content.className),
      markerPositions:state.routeEndpointMarkers.map(marker=>[marker.position.latitude,marker.position.longitude]),
      remaining:$('#remainDistance').textContent,time:$('#navPrimaryValue').textContent,watch:state.nav.watchId
    });
  `,context);
  assert.equal(result.screen,'navigation');
  assert.equal(result.routeSame,true);
  assert.deepEqual([...result.waypoints],['waypoint-1','waypoint-2']);
  assert.equal(result.destination,'destination');
  assert.equal(result.stepsSame,true);
  assert.equal(result.lineExists,true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.path)),[[37,127],[37.01,127.01],[37.02,127.02],[37.03,127.03]]);
  assert.deepEqual([...result.markers],[
    'route-endpoint-marker waypoint','route-endpoint-marker waypoint','route-endpoint-marker destination'
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.markerPositions)),[[37.01,127.01],[37.02,127.02],[37.03,127.03]]);
  assert.equal(result.remaining,'9.0 km');
  assert.equal(result.time,'90분');
  assert.equal(result.watch,77);
});

test('a stale route response cannot replace or clear an active multi-waypoint navigation route', async () => {
  const context=loadApp();
  const result=await vm.runInContext(`(async()=>{
    class TestLatLng {constructor(latitude,longitude){Object.assign(this,{latitude,longitude})}}
    class TestBounds {constructor(){this.points=[]}extend(point){this.points.push(point)}isEmpty(){return !this.points.length}}
    class TestPoint {constructor(x,y){Object.assign(this,{x,y})}}
    class TestPolyline {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setOptions(options){Object.assign(this,options)}setPath(path){this.path=path}}
    class TestOverlay {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds,Point:TestPoint,Polyline:TestPolyline,CustomOverlay:TestOverlay}};
    const origin={id:'origin',name:'Origin',latitude:37,longitude:127};
    const waypoint={id:'waypoint',name:'Waypoint',latitude:37.01,longitude:127.01};
    const destination={id:'destination',name:'Destination',latitude:37.02,longitude:127.02};
    const confirmed={id:'confirmed',routeMode:'BIKE_ONLY',totalDistance:5000,totalTime:3000,_points:[origin,waypoint,destination],_steps:[{guidance:'직진',_startAlong:0,_endAlong:5000,points:[origin,waypoint,destination]}]};
    let release;fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({routes:[{id:'stale',totalDistance:100,route:{coordinates:[[127,37],[127.5,37.5]]}}]})})});
    state.departure=origin;state.currentLocation=origin;state.waypoints=[waypoint];state.destination=destination;state.map={setBounds(){},setLevel(){},relayout(){},getProjection:()=>({pointFromCoords:()=>({x:500,y:500}),coordsFromPoint:point=>point}),panTo(){}};
    renderScreen=screen=>{state.screen=screen};clearSearchMarkers=()=>{};setGpsMarker=()=>{};startWatch=()=>{state.nav.watchId=91};toast=()=>{};
    const staleRequest=loadRoutes();
    state.routes=[confirmed];state.selectedRoute=0;state.routeLines=[];
    startNavigation();
    release();await staleRequest;
    return{screen:state.screen,route:state.routes[state.selectedRoute]?.id,linePath:state.routeLines[state.selectedRoute]?.path?.map(point=>[point.latitude,point.longitude]),markers:state.routeEndpointMarkers.map(marker=>marker.content.className),waypoints:state.waypoints.map(place=>place.id),destination:state.destination.id,watch:state.nav.watchId};
  })()`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    screen:'navigation',route:'confirmed',linePath:[[37,127],[37.01,127.01],[37.02,127.02]],
    markers:['route-endpoint-marker waypoint','route-endpoint-marker destination'],waypoints:['waypoint'],destination:'destination',watch:91
  });
});

test('Kakao place normalization preserves official detail fields without inventing values', () => {
  const context = loadApp();
  context.testPlace = {
    id:'123', place_name:'Test Cafe', category_name:'Food > Cafe', category_group_code:'CE7', phone:'02-123-4567',
    road_address_name:'Road 1', address_name:'Lot 2', place_url:'https://place.map.kakao.com/123',
    x:'127.1', y:'37.5', distance:'850'
  };
  const normalized = JSON.parse(JSON.stringify(vm.runInContext('normalizeKakaoPlace(testPlace)', context)));
  assert.deepEqual({
    id:normalized.id,name:normalized.name,category:normalized.category,categoryGroupCode:normalized.categoryGroupCode,address:normalized.address,
    roadAddress:normalized.roadAddress,lotAddress:normalized.lotAddress,placeUrl:normalized.placeUrl,
    latitude:normalized.latitude,longitude:normalized.longitude,distance:normalized.distance,phone:normalized.phone
  }, {
    id:'123', name:'Test Cafe', category:'Food > Cafe', categoryGroupCode:'CE7', address:'Road 1',
    roadAddress:'Road 1', lotAddress:'Lot 2', placeUrl:'https://place.map.kakao.com/123',
    latitude:37.5, longitude:127.1, distance:850, phone:'02-123-4567'
  });
  assert.equal('place_name' in normalized,false);
  assert.equal('category_group_code' in normalized,false);
  assert.equal('x' in normalized,false);
  assert.equal('y' in normalized,false);
  context.emptyPlace = {id:'empty',place_name:'Empty',x:'127',y:'37'};
  const empty = vm.runInContext('normalizeKakaoPlace(emptyPlace)', context);
  assert.equal(empty.phone, '');
  assert.equal(empty.roadAddress, '');
  assert.equal(empty.lotAddress, '');
  assert.equal(empty.placeUrl, '');
  context.persistedPlace={id:'saved',name:'Saved',category:'',address:'Road',latitude:'37.5',longitude:'127.1'};
  const persisted=vm.runInContext('normalizeKakaoPlace(persistedPlace)',context);
  assert.equal(persisted.latitude,37.5);
  assert.equal(persisted.longitude,127.1);
});

test('keyword and recent place selections use the common RideMate place entry point', () => {
  const context=loadApp();
  const stored=new Map([['ridemate_recent_searches',JSON.stringify([{query:'Saved Cafe',place:{id:'saved',name:'Saved Cafe',latitude:37.5,longitude:127}}])]]);
  context.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  context.testSearchPlace={id:'search',name:'Search Cafe',category:'Cafe',address:'Road',latitude:37.51,longitude:127.01};
  const result=vm.runInContext(`
    testSelected=[];selectRideMatePlace=(place,selectionContext)=>testSelected.push({place,source:selectionContext.source});
    renderLive([testSearchPlace],'Search');
    document.querySelector('#liveResults').querySelectorAll('[data-i]')[0].onclick();
    renderRecentSearches();
    document.querySelector('#recentSearches').querySelectorAll('[data-recent]')[0].onclick();
    ({ids:testSelected.map(entry=>entry.place.id),sources:testSelected.map(entry=>entry.source)});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{ids:['search','saved'],sources:['keyword-search','recent-place']});
});

test('address-only selections enter the common RideMate place flow with coordinates and no fake POI fields', async () => {
  const context=loadApp();
  context.testAddress={id:'address:127,37.5',name:'Road 1',category:'',address:'Road 1',roadAddress:'Road 1',lotAddress:'Lot 1',placeUrl:'',latitude:37.5,longitude:127,distance:null,phone:''};
  const result=await vm.runInContext(`(async()=>{
    testSelected=[];choosePlace=place=>testSelected.push(place);
    await selectRideMatePlace(testAddress,{source:'address-search'});
    return {same:testSelected[0]===testAddress,place:testSelected[0]};
  })()`,context);
  assert.equal(result.same,true);
  assert.equal(result.place.latitude,37.5);
  assert.equal(result.place.longitude,127);
  assert.equal(result.place.category,'');
  assert.equal(result.place.placeUrl,'');
  assert.equal(result.place.phone,'');
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

test('place search also returns coordinate-backed address and building results without fake POI fields', async () => {
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY='test-key';
  globalThis.fetch=async url=>String(url).includes('/search/address.json')
    ? {ok:true,json:async()=>({documents:[{address_name:'서울 도봉구 방학동 123',x:'127.04',y:'37.66',road_address:{address_name:'서울 도봉구 도봉로 123',building_name:'방학아파트'}}]})}
    : {ok:true,json:async()=>({documents:[]})};
  try{
    const handler=await apiHandler();
    const {output,response}=mockResponse();
    await handler({method:'GET',query:{query:'서울 도봉구 도봉로 123'}},response);
    assert.deepEqual(output.body.results,[{
      id:'address:127.04,37.66',name:'방학아파트',category:'',address:'서울 도봉구 도봉로 123',
      roadAddress:'서울 도봉구 도봉로 123',lotAddress:'서울 도봉구 방학동 123',placeUrl:'',
      latitude:37.66,longitude:127.04,distance:null,phone:''
    }]);
    const context=loadApp();
    context.addressOnly=output.body.results[0];
    const result=await vm.runInContext(`(async()=>{testRouteLoads=0;state.editingEndpoint='destination';state.departure={name:'현재 위치',latitude:37.65,longitude:127.03};loadRoutes=async()=>{testRouteLoads++};await choosePlace(addressOnly);return{destination:state.destination,routeLoads:testRouteLoads}})()`,context);
    assert.equal(result.destination.name,'방학아파트');
    assert.equal(result.destination.latitude,37.66);
    assert.equal(result.routeLoads,1);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey==null)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=originalKey;
  }
});

test('an exact address candidate is not dropped when keyword results fill the response limit', async () => {
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY='test-key';
  globalThis.fetch=async url=>String(url).includes('/search/address.json')
    ? {ok:true,json:async()=>({documents:[{address_name:'서울 도봉구 방학동 123',x:'127.04',y:'37.66',road_address:{address_name:'서울 도봉구 도봉로 123'}}]})}
    : {ok:true,json:async()=>({documents:Array.from({length:15},(_,i)=>({id:String(i),place_name:`업체 ${i}`,x:String(127.1+i/1000),y:'37.7'}))})};
  try{
    const handler=await apiHandler();
    const {output,response}=mockResponse();
    await handler({method:'GET',query:{query:'서울 도봉구 도봉로 123',size:'15'}},response);
    assert.equal(output.body.results.length,15);
    assert.equal(output.body.results[0].id,'address:127.04,37.66');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey==null)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=originalKey;
  }
});

test('address merging preserves co-located Kakao places and respects an active map rectangle', async () => {
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY='test-key';
  globalThis.fetch=async url=>String(url).includes('/search/address.json')
    ? {ok:true,json:async()=>({documents:[
      {address_name:'같은 좌표 주소',x:'127.05',y:'37.55'},
      {address_name:'영역 밖 주소',x:'128.1',y:'38.1'}
    ]})}
    : {ok:true,json:async()=>({documents:[
      {id:'poi-a',place_name:'같은 건물 A',place_url:'https://place.map.kakao.com/a',x:'127.05',y:'37.55'},
      {id:'poi-b',place_name:'같은 건물 B',place_url:'https://place.map.kakao.com/b',x:'127.05',y:'37.55'}
    ]})};
  try{
    const handler=await apiHandler();
    const {output,response}=mockResponse();
    await handler({method:'GET',query:{query:'같은 건물',rect:'127,37.5,127.1,37.6'}},response);
    assert.deepEqual(output.body.results.map(item=>item.id),['poi-a','poi-b']);
    assert.deepEqual(output.body.results.map(item=>item.placeUrl),['https://place.map.kakao.com/a','https://place.map.kakao.com/b']);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey==null)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=originalKey;
  }
});

test('place sheet starts collapsed with representative address, Kakao link and only new expanded details', () => {
  const context=loadApp();
  context.fullPlace={name:'Test Cafe',category:'Cafe',address:'Road 1',phone:'02-123-4567',roadAddress:'Road 1',lotAddress:'Lot 2',placeUrl:'https://place.map.kakao.com/123',distance:850};
  vm.runInContext('renderPlaceContent(fullPlace)',context);
  const sheet=context.document.querySelector('#sheet');
  const full=context.document.querySelector('#sheetContent').innerHTML;
  assert.equal(sheet.classList.contains('place-detail'),true);
  assert.equal(sheet.classList.contains('place-expanded'),false);
  assert.match(full,/class="place-extra"/);
  assert.match(full,/02-123-4567/);
  assert.equal((full.match(/Road 1/g)||[]).length,1);
  assert.doesNotMatch(full,/Lot 2/);
  assert.match(full,/850m/);
  assert.match(full,/href="https:\/\/place\.map\.kakao\.com\/123"/);
  assert.match(full,/카카오맵에서 자세히/);
  const basic=full.match(/class="place-basic"[\s\S]*?class="place-detail-body"/)?.[0]||'';
  assert.match(basic,/Test Cafe/);
  assert.match(basic,/Cafe/);
  assert.match(basic,/Road 1/);
  assert.match(basic,/카카오맵에서 자세히/);
  assert.doesNotMatch(basic,/02-123-4567/);

  context.emptyDetail={name:'Only Name',category:'',address:'',phone:'',roadAddress:'',lotAddress:'',placeUrl:'',distance:null};
  vm.runInContext('renderPlaceContent(emptyDetail)',context);
  const empty=context.document.querySelector('#sheetContent').innerHTML;
  assert.doesNotMatch(empty,/place-phone|place-road-address|place-lot-address|place-distance|place-external/);
  assert.doesNotMatch(empty,/정보 없음|확인 필요/);
});

test('an address-only card does not repeat the address as both title and address row', () => {
  const context=loadApp();
  context.addressOnly={name:'서울 도봉구 도봉로 123',address:'서울 도봉구 도봉로 123',roadAddress:'서울 도봉구 도봉로 123',lotAddress:'',category:'',phone:'',placeUrl:'',latitude:37.66,longitude:127.04};
  vm.runInContext('renderPlaceContent(addressOnly)',context);
  const content=context.document.querySelector('#sheetContent').innerHTML;
  assert.equal((content.match(/서울 도봉구 도봉로 123/g)||[]).length,1);
  assert.match(content,/id="setStart"/);
  assert.match(content,/id="setEnd"/);
  assert.doesNotMatch(content,/place-phone|place-external/);
});

test('place handle expands, collapses, and dismisses without adding history', () => {
  const context=loadApp();
  let pushes=0,backs=0;
  context.history={pushState(){pushes++},back(){backs++}};
  context.testPlace={name:'Place',category:'Cafe',address:'Road'};
  vm.runInContext('state.screen="place";renderPlaceContent(testPlace)',context);
  const handle=context.document.querySelector('#sheetHandle');
  const sheet=context.document.querySelector('#sheet');
  const compactHeight=sheet.style.getPropertyValue('--place-sheet-height');

  handle.dispatch('pointerdown',{clientY:300});
  handle.dispatch('pointermove',{clientY:220});
  assert.notEqual(sheet.style.getPropertyValue('--place-sheet-height'),compactHeight);
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

test('collapsed place sheet contains basic info and actions without an inverse-transform hack', () => {
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.sheet\.place-detail[^}]*height:var\(--place-sheet-height/);
  assert.doesNotMatch(css,/detail-actions[^}]*translateY|detail-actions[^}]*--sheet-y/);
  assert.match(css,/\.place-detail-body[^}]*overflow-y:auto/);
  const context=loadApp();
  context.testPlace={name:'Place',category:'Cafe',address:'Road'};
  const result=vm.runInContext(`
    state.screen='place';renderPlaceContent(testPlace);
    ({height:parseFloat(document.querySelector('#sheet').style.getPropertyValue('--place-sheet-height')),html:document.querySelector('#sheetContent').innerHTML});
  `,context);
  assert.ok(result.height>=260);
  assert.match(result.html,/class="place-detail-body"/);
  assert.match(result.html,/id="setStart"/);
  assert.match(result.html,/id="setEnd"/);
});

test('navigation place exposes only destination replacement and route addition', () => {
  const context=loadApp();
  context.testPlace={id:'new',name:'New stop',category:'Cafe',address:'Road',placeUrl:'https://place.map.kakao.com/new'};
  vm.runInContext('state.screen="navigation-place";renderNavigationPlaceContent(testPlace)',context);
  const content=context.document.querySelector('#sheetContent').innerHTML;
  assert.match(content,/id="changeNavDestination"/);
  assert.match(content,/id="addNavWaypoint"/);
  assert.doesNotMatch(content,/id="cancelNavPlace"|>취소</);
  assert.match(content,/카카오맵에서 자세히/);
  assert.doesNotMatch(content,/id="setStart"|id="setEnd"/);
});

test('navigation category markers open and replace exact place cards with one tap', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    state.screen='navigation';state.visiblePlaceGeneration=9;state.visiblePlaceKey='viewport';visiblePlaceKey=()=> 'viewport';
    state.map={relayout(){}};testPushes=[];testReplaces=[];testCards=[];
    history={pushState(entry){testPushes.push(entry)},replaceState(entry){testReplaces.push(entry)}};
    renderNavigationPlaceContent=place=>testCards.push(place.id);
    const first={id:'one',name:'One',latitude:37.5,longitude:127},second={id:'two',name:'Two',latitude:37.6,longitude:127.1};
    handleCategoryMarkerClick(first,9,'viewport',[first]);
    handleCategoryMarkerClick(second,9,'viewport',[second]);
    ({cards:testCards,pushes:testPushes.map(x=>x.place?.id),replaces:testReplaces.map(x=>x.place?.id),screen:state.screen});
  `,context);
  assert.deepEqual([...result.cards],['one','two']);
  assert.deepEqual([...result.pushes],['one']);
  assert.deepEqual([...result.replaces],['two']);
  assert.equal(result.screen,'navigation-place');
});

test('navigation menu has route addition, no close button, and map tap dismisses it once', () => {
  assert.match(html,/data-nav-action="add-route"/);
  assert.match(html,/data-nav-action="alternate-route"[^>]*>[\s\S]*?다른 경로 보기/);
  assert.doesNotMatch(html,/id="closeNavMenu"/);
  const context=loadApp();
  const menu=context.document.querySelector('#navMenu');
  menu.classList.remove('hidden');
  const result=vm.runInContext(`
    state.screen='navigation';testOpened=[];openPlace=place=>testOpened.push(place);
    const returned=handleMapClick({point:{x:10,y:10}});
    ({returned,hidden:document.querySelector('#navMenu').classList.contains('hidden'),opened:testOpened.length});
  `,context);
  assert.equal(result.returned,null);
  assert.equal(result.hidden,true);
  assert.equal(result.opened,0);
  assert.match(appSource,/a==='add-route'[^}]+openNavigationSearch\('add-waypoint'\)/);
});

test('navigation place sheet supports the same continuous expansion as a normal place', () => {
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
  assert.equal(sheet.classList.contains('place-expanded'),true);
  assert.equal(backs,0);
});

test('navigation add-route search selection calculates a pending route and opens reusable overview', async () => {
  const context=loadApp();
  const result=await vm.runInContext(`(async()=>{
    const origin={id:'origin',name:'Current',latitude:37,longitude:127},existing={id:'existing',name:'Existing'},added={id:'added',name:'Added'},destination={id:'destination',name:'Destination'};
    const originalRoute={id:'original',routeMode:'BIKE_ONLY',_steps:[{guidance:'old'}]},previewRoute={id:'preview',routeMode:'BIKE_ONLY',route:{},totalDistance:100};
    state.screen='navigation';state.currentLocation=origin;state.destination=destination;state.waypoints=[existing];state.routes=[originalRoute];state.selectedRoute=0;
    state.map={getLevel:()=>4,getCenter:()=>origin,relayout(){}};state.nav.watchId=77;state.nav.progressDistance=321;
    testFetch=null;testDraws=0;testCards=0;
    fetchRoutes=async(a,b,waypoints)=>{testFetch={a,b,waypoints};return[previewRoute]};
    prepareRoutes=routes=>routes.map(route=>({...route,_points:[origin,added,destination],_steps:[{guidance:'new'}]}));
    drawRoutes=()=>{testDraws++};renderRouteCards=()=>{testCards++};updateRouteFields=()=>{};finishRoutePerformance=()=>{};setGpsMarker=()=>{};
    history={pushState(){},replaceState(){}};
    openNavigationSearch('add-waypoint');
    await choosePlace(added);
    return {mode:state.navigationSearchMode,screen:state.screen,pending:state.navigationRouteDraft?.place.id,confirmed:state.waypoints.map(x=>x.id),requested:testFetch.waypoints.map(x=>x.id),draws:testDraws,cards:testCards,startHidden:document.querySelector('#startNavBtn').classList.contains('hidden'),cancelHidden:document.querySelector('#cancelRoutePreviewBtn').classList.contains('hidden')};
  })()`,context);
  assert.equal(result.screen,'route');
  assert.equal(result.pending,'added');
  assert.deepEqual([...result.confirmed],['existing']);
  assert.deepEqual([...result.requested],['existing','added']);
  assert.equal(result.draws,1);
  assert.equal(result.cards,1);
  assert.equal(result.startHidden,false);
  assert.equal(result.cancelHidden,false);
});

test('navigation menu add-route flows through recent place, rendered route selection, and start guidance', async () => {
  const context=loadApp();
  const {recentPlace}=installNavigationFlowEnvironment(context);
  const navMenuButton=context.document.querySelector('#navMenuBtn');
  navMenuButton.onclick();
  const addRouteButton=context.document.querySelectorAll('[data-nav-action]').find(button=>button.dataset.navAction==='add-route');
  assert.ok(addRouteButton,'navigation add-route action must be wired');
  await addRouteButton.onclick();
  assert.equal(vm.runInContext('state.screen',context),'search');
  assert.equal(vm.runInContext('state.navigationSearchMode',context),'add-waypoint');

  const recentButton=context.document.querySelector('#recentSearches').querySelectorAll('[data-recent]')[0];
  assert.ok(recentButton,'recent place must be rendered');
  recentButton.onclick();
  await new Promise(resolve=>setImmediate(resolve));

  assert.equal(vm.runInContext('state.navigationRouteDraft.place.id',context),recentPlace.id);
  assert.equal(vm.runInContext('state.screen',context),'route');
  assert.equal(context.document.querySelector('#routeCards').classList.contains('hidden'),false);
  const routeButtons=context.document.querySelector('#routeCards').querySelectorAll('[data-i]');
  assert.equal(routeButtons.length,2);
  routeButtons[1].onclick();
  context.document.querySelector('#startNavBtn').onclick();

  const result=vm.runInContext(`({screen:state.screen,waypoints:state.waypoints.map(place=>place.id),selectedRoute:state.selectedRoute,route:state.routes[state.selectedRoute].id,draft:state.navigationRouteDraft,watch:state.nav.watchId,follow:state.nav.follow,level:testCameraLevels.at(-1),cameraTargets:testCameraTargets.length})`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{screen:'navigation',waypoints:['existing','added'],selectedRoute:1,route:'preview-b',draft:null,watch:88,follow:true,level:2,cameraTargets:1});
  assert.equal(context.testWatchStarts,0);
  assert.equal(context.testRouteRequests.length,1);
});

test('navigation menu alternate-route reuses destination and waypoints then initializes navigation camera', async () => {
  const context=loadApp();
  installNavigationFlowEnvironment(context);
  context.document.querySelector('#navMenuBtn').onclick();
  const alternate=context.document.querySelectorAll('[data-nav-action]').find(button=>button.dataset.navAction==='alternate-route');
  assert.ok(alternate?.onclick,'alternate-route menu action must be wired');
  await alternate.onclick();
  const preview=vm.runInContext(`({screen:state.screen,kind:state.navigationRouteDraft?.kind,origin:state.navigationRouteDraft?.origin.id,destination:state.navigationRouteDraft?.destination.id,waypoints:state.navigationRouteDraft?.waypoints.map(place=>place.id),request:testRouteRequests[0]})`,context);
  assert.equal(preview.screen,'route');
  assert.equal(preview.kind,'alternate');
  assert.equal(preview.origin,'origin');
  assert.equal(preview.destination,'destination');
  assert.deepEqual([...preview.waypoints],['existing']);
  assert.match(preview.request,/via_x=127\.01/);
  const buttons=context.document.querySelector('#routeCards').querySelectorAll('[data-i]');
  vm.runInContext('testOverviewCamera={levels:testCameraLevels.length,targets:testCameraTargets.length}',context);
  buttons[1].onclick();buttons[0].onclick();buttons[1].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`({levels:testCameraLevels.length,targets:testCameraTargets.length})`,context))),JSON.parse(JSON.stringify(vm.runInContext('testOverviewCamera',context))));
  context.document.querySelector('#startNavBtn').onclick();
  const result=vm.runInContext(`({screen:state.screen,route:state.routes[state.selectedRoute].id,destination:state.destination.id,waypoints:state.waypoints.map(place=>place.id),draft:state.navigationRouteDraft,watch:state.nav.watchId,follow:state.nav.follow,level:testCameraLevels.at(-1),cameraTargets:testCameraTargets.length})`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{screen:'navigation',route:'preview-b',destination:'destination',waypoints:['existing'],draft:null,watch:88,follow:true,level:2,cameraTargets:1});
  assert.equal(context.testWatchStarts,0);
});

test('alternate-route cancel restores the live navigation transaction without restarting GPS', async () => {
  const context=loadApp();
  installNavigationFlowEnvironment(context);
  vm.runInContext(`testOriginalRoutes=state.routes;testOriginalWaypoints=state.waypoints;testOriginalDestination=state.destination;testOriginalSteps=state.nav.steps;testOriginalRoute=state.routes[0]` ,context);
  const alternate=context.document.querySelectorAll('[data-nav-action]').find(button=>button.dataset.navAction==='alternate-route');
  await alternate.onclick();
  vm.runInContext(`testLatest={id:'latest',name:'Latest',latitude:37.0004,longitude:127.0003};state.currentLocation=testLatest`,context);
  context.document.querySelector('#cancelRoutePreviewBtn').onclick();
  const result=vm.runInContext(`({screen:state.screen,sameRoutes:state.routes===testOriginalRoutes,sameRoute:state.routes[0]===testOriginalRoute,sameWaypoints:state.waypoints===testOriginalWaypoints,sameDestination:state.destination===testOriginalDestination,sameSteps:state.nav.steps===testOriginalSteps,progress:state.nav.progressDistance,currentStep:state.nav.currentStep,follow:state.nav.follow,watch:state.nav.watchId,sameLive:state.currentLocation===testLatest,draft:state.navigationRouteDraft})`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{screen:'navigation',sameRoutes:true,sameRoute:true,sameWaypoints:true,sameDestination:true,sameSteps:true,progress:300,currentStep:0,follow:true,watch:88,sameLive:true,draft:null});
  assert.equal(context.testWatchStarts,0);
});

test('navigation menu add-route cancel restores the live navigation session through rendered UI', async () => {
  const context=loadApp();
  installNavigationFlowEnvironment(context);
  vm.runInContext(`
    testOriginalRoutes=state.routes;testOriginalRoute=state.routes[0];testOriginalWaypoints=state.waypoints;testOriginalDestination=state.destination;
    testOriginalSteps=state.nav.steps;testOriginalProgress=state.nav.progressDistance;testOriginalStep=state.nav.currentStep;
    testOriginalFollow=state.nav.follow;testOriginalWatch=state.nav.watchId;
  `,context);

  context.document.querySelector('#navMenuBtn').onclick();
  const addRouteButton=context.document.querySelectorAll('[data-nav-action]').find(button=>button.dataset.navAction==='add-route');
  await addRouteButton.onclick();
  context.document.querySelector('#recentSearches').querySelectorAll('[data-recent]')[0].onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('state.screen',context),'route');

  vm.runInContext(`testLiveLocation={id:'live-after-preview',name:'Live',latitude:37.0001,longitude:127.0001};state.currentLocation=testLiveLocation`,context);
  context.document.querySelector('#cancelRoutePreviewBtn').onclick();

  const result=vm.runInContext(`({
    screen:state.screen,sameRoutes:state.routes===testOriginalRoutes,sameRoute:state.routes[0]===testOriginalRoute,selected:state.selectedRoute,
    sameWaypoints:state.waypoints===testOriginalWaypoints,waypoints:state.waypoints.map(place=>place.id),sameDestination:state.destination===testOriginalDestination,
    progress:state.nav.progressDistance,currentStep:state.nav.currentStep,sameSteps:state.nav.steps===testOriginalSteps,follow:state.nav.follow,
    watch:state.nav.watchId,sameLiveLocation:state.currentLocation===testLiveLocation,draft:state.navigationRouteDraft,
    hud:document.querySelector('#turnText').textContent,routeRendered:!!state.routeLines[state.selectedRoute]
  })`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    screen:'navigation',sameRoutes:true,sameRoute:true,selected:0,sameWaypoints:true,waypoints:['existing'],sameDestination:true,
    progress:300,currentStep:0,sameSteps:true,follow:true,watch:88,sameLiveLocation:true,draft:null,hud:'직진',routeRendered:true
  });
  assert.equal(context.testWatchStarts,0);
});

test('navigation search place uses the common selection entry point and adds a selected route', async () => {
  const context=loadApp();
  installNavigationFlowEnvironment(context);
  context.testMarkerPlace={id:'marker-stop',name:'Marker Stop',category:'Cafe',address:'Road',latitude:37.015,longitude:127.015};
  vm.runInContext(`
    selectRideMatePlace(testMarkerPlace,{source:'keyword-search',action:'inspect'});
  `,context);
  assert.equal(vm.runInContext('state.screen',context),'navigation-place');
  assert.equal(vm.runInContext('state.selectedPlace===testMarkerPlace',context),true);

  const addButton=context.document.querySelector('#addNavWaypoint');
  assert.ok(addButton?.onclick,'navigation place add button must be rendered and wired');
  addButton.onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('state.navigationRouteDraft.place===testMarkerPlace',context),true);
  const routeButtons=context.document.querySelector('#routeCards').querySelectorAll('[data-i]');
  routeButtons[1].onclick();
  context.document.querySelector('#startNavBtn').onclick();

  const result=vm.runInContext(`({screen:state.screen,waypoints:state.waypoints.map(place=>place.id),route:state.routes[state.selectedRoute].id,draft:state.navigationRouteDraft})`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{screen:'navigation',waypoints:['existing','marker-stop'],route:'preview-b',draft:null});
  assert.equal(context.testWatchStarts,0);
});

test('navigation search place preview cancel returns to the unchanged live navigation through UI', async () => {
  const context=loadApp();
  installNavigationFlowEnvironment(context);
  context.testMarkerPlace={id:'marker-cancel',name:'Marker Cancel',category:'Cafe',address:'Road',latitude:37.016,longitude:127.016};
  vm.runInContext(`
    testOriginalRoutes=state.routes;testOriginalWaypoints=state.waypoints;testOriginalDestination=state.destination;testOriginalSteps=state.nav.steps;
    selectRideMatePlace(testMarkerPlace,{source:'keyword-search',action:'inspect'});
  `,context);
  context.document.querySelector('#addNavWaypoint').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('state.screen',context),'route');
  vm.runInContext(`testMarkerLive={id:'marker-live',latitude:37.0002,longitude:127.0002};state.currentLocation=testMarkerLive`,context);
  context.document.querySelector('#cancelRoutePreviewBtn').onclick();

  const result=vm.runInContext(`({
    screen:state.screen,sameRoutes:state.routes===testOriginalRoutes,selected:state.selectedRoute,
    sameWaypoints:state.waypoints===testOriginalWaypoints,waypoints:state.waypoints.map(place=>place.id),sameDestination:state.destination===testOriginalDestination,
    progress:state.nav.progressDistance,currentStep:state.nav.currentStep,sameSteps:state.nav.steps===testOriginalSteps,follow:state.nav.follow,
    watch:state.nav.watchId,sameLive:state.currentLocation===testMarkerLive,draft:state.navigationRouteDraft,
    hud:document.querySelector('#turnText').textContent,routeRendered:!!state.routeLines[state.selectedRoute]
  })`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    screen:'navigation',sameRoutes:true,selected:0,sameWaypoints:true,waypoints:['existing'],sameDestination:true,
    progress:300,currentStep:0,sameSteps:true,follow:true,watch:88,sameLive:true,draft:null,hud:'직진',routeRendered:true
  });
  assert.equal(context.testWatchStarts,0);
});

test('navigation place actions use the same pending preview flow for waypoint and destination', () => {
  const context=loadApp();
  context.testPlace={id:'new',name:'New',category:'Cafe',address:'Road'};
  const add=context.document.querySelector('#addNavWaypoint'),change=context.document.querySelector('#changeNavDestination');
  const result=vm.runInContext(`
    testDrafts=[];beginNavigationRoutePreview=(kind,place)=>testDrafts.push({kind,id:place.id});
    state.screen='navigation-place';renderNavigationPlaceContent(testPlace);
    document.querySelector('#addNavWaypoint').onclick();
    document.querySelector('#changeNavDestination').onclick();
    testDrafts;
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[{kind:'waypoint',id:'new'},{kind:'destination',id:'new'}]);
});

test('confirming a navigation route preview is the only point that commits waypoint and route', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    const existing={id:'existing'},added={id:'added'},destination={id:'destination'},original={id:'original'},preview={id:'preview',_steps:[{guidance:'new'}]};
    state.screen='route';state.waypoints=[existing];state.destination=destination;state.routes=[preview];state.selectedRoute=0;state.nav.watchId=71;state.nav.progressDistance=450;
    state.navigationRouteDraft={kind:'waypoint',place:added,waypoints:[existing,added],destination,routes:[preview],selectedRoute:0,original:{routes:[original],selectedRoute:0}};
    testWatchStarts=0;startWatch=()=>{testWatchStarts++};drawNavigationRoute=()=>{};updateNavHud=()=>{};renderScreen=screen=>{state.screen=screen};history={replaceState(){}};
    confirmNavigationRoutePreview();
    ({waypoints:state.waypoints.map(x=>x.id),route:state.routes[0].id,steps:state.nav.steps[0].guidance,progress:state.nav.progressDistance,watch:state.nav.watchId,watchStarts:testWatchStarts,draft:state.navigationRouteDraft,screen:state.screen});
  `,context);
  assert.deepEqual([...result.waypoints],['existing','added']);
  assert.equal(result.route,'preview');
  assert.equal(result.steps,'new');
  assert.equal(result.progress,0);
  assert.equal(result.watch,71);
  assert.equal(result.watchStarts,0);
  assert.equal(result.draft,null);
  assert.equal(result.screen,'navigation');
});

test('confirming a preview commits the route candidate selected in the overview', () => {
  const context=loadApp();
  const result=vm.runInContext(`
    const existing={id:'existing'},added={id:'added'},destination={id:'destination'},original={id:'original'};
    const first={id:'preview-first',_steps:[]},second={id:'preview-second',_steps:[{guidance:'selected'}]};
    state.screen='route';state.waypoints=[existing];state.destination=destination;state.routes=[first,second];state.selectedRoute=0;
    state.routeLines=[{setOptions(){}},{setOptions(){}}];
    state.navigationRouteDraft={kind:'waypoint',place:added,waypoints:[existing,added],destination,routes:[first,second],selectedRoute:0,original:{routes:[original],selectedRoute:0,follow:true}};
    drawRouteEndpointMarkers=()=>{};fitSelectedRoute=()=>{};renderRouteCards=()=>{};
    selectRoute(1);
    const selectedInDraft=state.navigationRouteDraft.selectedRoute;
    drawNavigationRoute=()=>{};updateNavHud=()=>{};renderScreen=screen=>{state.screen=screen};history={replaceState(){}};
    confirmNavigationRoutePreview();
    ({selectedInDraft,selectedRoute:state.selectedRoute,route:state.routes[state.selectedRoute].id,steps:state.nav.steps.map(step=>step.guidance)});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{selectedInDraft:1,selectedRoute:1,route:'preview-second',steps:['selected']});
});

test('cancelling preview restores confirmed navigation context without rewinding live GPS or restarting watch', async () => {
  const context=loadApp();
  const result=await vm.runInContext(`(async()=>{
    const origin={id:'live-before',latitude:37,longitude:127},liveAfter={id:'live-after',latitude:37.1,longitude:127.1},existing={id:'existing'},added={id:'added'},destination={id:'destination'},original={id:'original',routeMode:'BIKE_ONLY',_steps:[{guidance:'old'}]},preview={id:'preview',routeMode:'BIKE_ONLY',route:{},totalDistance:100};
    state.screen='navigation-place';state.currentLocation=origin;state.waypoints=[existing];state.destination=destination;state.routes=[original];state.selectedRoute=0;
    state.nav.watchId=88;state.nav.progressDistance=777;state.nav.currentStep=4;state.nav.steps=original._steps;state.nav.follow=false;state.nav.heading=123;
    const navIdentity=state.nav,stepsIdentity=state.nav.steps,waypointsIdentity=state.waypoints;
    testWatchStarts=0;startWatch=()=>{testWatchStarts++};fetchRoutes=async()=>[preview];prepareRoutes=routes=>routes.map(route=>({...route,_points:[origin,added,destination],_steps:[{guidance:'new'}]}));
    testNavigationDraws=0;drawRoutes=()=>{};renderRouteCards=()=>{};updateRouteFields=()=>{};drawNavigationRoute=()=>{testNavigationDraws++};drawRouteEndpointMarkers=()=>{};updateNavHud=()=>{};setGpsMarker=()=>{};finishRoutePerformance=()=>{};renderScreen=screen=>{state.screen=screen};history={replaceState(){},back(){handlePopState({state:{screen:'navigation'}})}};
    await beginNavigationRoutePreview('waypoint',added);
    state.currentLocation=liveAfter;
    cancelNavigationRoutePreview();
    return {sameNav:state.nav===navIdentity,sameSteps:state.nav.steps===stepsIdentity,progress:state.nav.progressDistance,currentStep:state.nav.currentStep,follow:state.nav.follow,heading:state.nav.heading,watch:state.nav.watchId,watchStarts:testWatchStarts,sameWaypoints:state.waypoints===waypointsIdentity,waypoints:state.waypoints.map(x=>x.id),destination:state.destination.id,route:state.routes[0].id,selected:state.selectedRoute,gps:state.currentLocation.id,draft:state.navigationRouteDraft,screen:state.screen,navigationDraws:testNavigationDraws};
  })()`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{sameNav:true,sameSteps:true,progress:777,currentStep:4,follow:false,heading:123,watch:88,watchStarts:0,sameWaypoints:true,waypoints:['existing'],destination:'destination',route:'original',selected:0,gps:'live-after',draft:null,screen:'navigation',navigationDraws:1});
});

test('expanded place content remains scrollable and safe-area aware', () => {
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.sheet\.place-detail\.place-expanded/);
  assert.match(css,/\.place-extra/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(appSource,/function handleMapClick\([^\n]+visiblePlaceHitTest/);
});

function installConfirmedWaypointFixture(context) {
  vm.runInContext(`
    class WaypointLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class WaypointPolyline {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setPath(path){this.path=path}setOptions(options){Object.assign(this,options)}}
    class WaypointOverlay {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setPosition(position){this.position=position}}
    class WaypointPoint {constructor(x,y){this.x=x;this.y=y}}
    kakao={maps:{LatLng:WaypointLatLng,Polyline:WaypointPolyline,CustomOverlay:WaypointOverlay,Point:WaypointPoint}};
    lifecycleOrigin={id:'origin',name:'Origin',latitude:37,longitude:127};
    lifecycleWaypoint1={id:'waypoint-1',name:'Waypoint 1',latitude:37.01,longitude:127};
    lifecycleWaypoint2={id:'waypoint-2',name:'Waypoint 2',latitude:37.02,longitude:127};
    lifecycleAdded={id:'waypoint-3',name:'Waypoint 3',latitude:37.025,longitude:127};
    lifecycleDestination={id:'destination',name:'Destination',latitude:37.03,longitude:127};
    makeLifecycleRoute=(id='confirmed',waypoints=[lifecycleWaypoint1,lifecycleWaypoint2])=>{
      const points=[lifecycleOrigin,...waypoints,lifecycleDestination];
      return{id,routeMode:'BIKE_ONLY',totalDistance:3336,totalTime:5340,_points:points,_steps:[{guidance:'직진',_startAlong:0,_endAlong:3336,points}]};
    };
    lifecycleRoute=makeLifecycleRoute();
    state.screen='route';state.currentLocation=lifecycleOrigin;state.departure=lifecycleOrigin;
    state.waypoints=[lifecycleWaypoint1,lifecycleWaypoint2];state.destination=lifecycleDestination;
    state.routes=[lifecycleRoute];state.selectedRoute=0;state.routeLines=[];
    state.map={setLevel(){},panTo(){},relayout(){},getProjection:()=>null};
    history={pushState(){},replaceState(){},back(){}};
    lifecycleRequests=[];lifecycleWatchStarts=0;
    navigator={geolocation:{getCurrentPosition(){},watchPosition(){lifecycleWatchStarts++;return 77},clearWatch(){}}};
    renderScreen=screen=>{state.screen=screen};clearSearchMarkers=()=>{};initializeNavigationCamera=()=>{state.nav.follow=true};
    beginRoutePerformance=()=>({});finishRoutePerformance=()=>{};toast=()=>{};
  `,context);
}

function navigationLifecycleSnapshot(context) {
  return JSON.parse(vm.runInContext(`JSON.stringify({
    screen:state.screen,
    waypoints:state.waypoints.map(point=>point.id),
    remaining:(state.nav.remainingWaypoints||[]).map(point=>point.id),
    destination:state.destination?.id,
    route:state.routes[state.selectedRoute]?.id,
    routePoints:state.routes[state.selectedRoute]?._points?.map(point=>point.id),
    steps:state.nav.steps.map(step=>step.guidance),
    linePoints:state.routeLines[state.selectedRoute]?.path?.length||0,
    markers:state.routeEndpointMarkers.map(marker=>marker.content.className),
    remain:$('#remainDistance').textContent,
    requests:lifecycleRequests,
    watch:state.nav.watchId,
    follow:state.nav.follow
  })`,context));
}

test('multi-waypoint guidance start records both confirmed remaining waypoints', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext('startNavigation()',context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.waypoints,['waypoint-1','waypoint-2']);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.deepEqual(result.routePoints,['origin','waypoint-1','waypoint-2','destination']);
  assert.equal(result.linePoints,4);
  assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,2);
  assert.equal(result.markers.filter(name=>name.includes('destination')).length,1);
  assert.deepEqual(result.steps,['직진']);
  assert.notEqual(result.remain,'');
});

for (const reason of ['manual','off-route']) {
  test(`${reason} navigation reroute sends and retains every remaining waypoint`, async () => {
    const context=loadApp();installConfirmedWaypointFixture(context);
    await vm.runInContext(`(async()=>{
      startNavigation();
      fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push({origin:origin.id,destination:destination.id,waypoints:waypoints.map(point=>point.id)});return[makeLifecycleRoute('rerouted',waypoints)]};
      prepareRoutes=routes=>routes;
      await recalculateNavigationRoute('${reason}');
    })()`,context);
    const result=navigationLifecycleSnapshot(context);
    assert.deepEqual(result.requests,[{origin:'origin',destination:'destination',waypoints:['waypoint-1','waypoint-2']}]);
    assert.deepEqual(result.waypoints,['waypoint-1','waypoint-2']);
    assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
    assert.equal(result.route,'rerouted');
    assert.equal(result.linePoints,4);
    assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,2);
    assert.deepEqual(result.steps,['직진']);
    assert.notEqual(result.remain,'');
  });
}

test('GPS progress before the first waypoint does not discard confirmed waypoints', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext(`startNavigation();updateNavHud({latitude:37.005,longitude:127},5)`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.waypoints,['waypoint-1','waypoint-2']);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.linePoints,4);
  assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,2);
});

test('current-location camera restoration preserves confirmed navigation route context', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext(`startNavigation();$('#navLocateBtn').onclick()`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.route,'confirmed');
  assert.equal(result.linePoints,4);
  assert.equal(result.follow,true);
});

test('pause and resume preserve confirmed navigation route context', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext(`startNavigation();setNavigationPaused(true,1000);setNavigationPaused(false,2000)`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.route,'confirmed');
  assert.equal(result.linePoints,4);
});

test('opening and closing the navigation menu preserves confirmed waypoints', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext(`startNavigation();$('#navMenuBtn').onclick();handleMapClick({point:{x:1,y:1}})`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.route,'confirmed');
  assert.equal(result.linePoints,4);
});

for (const outcome of ['cancel','confirm']) {
  test(`alternate-route preview ${outcome} keeps the confirmed waypoint contract`, async () => {
    const context=loadApp();installConfirmedWaypointFixture(context);
    await vm.runInContext(`(async()=>{
      startNavigation();
      fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push({origin:origin.id,destination:destination.id,waypoints:waypoints.map(point=>point.id)});return[makeLifecycleRoute('alternate',waypoints)]};
      prepareRoutes=routes=>routes;drawRoutes=()=>{};renderRouteCards=()=>{};updateRouteFields=()=>{};
      await beginNavigationRoutePreview('alternate');
      ${outcome==='cancel'?"cancelNavigationRoutePreview(false)":"confirmNavigationRoutePreview()"};
    })()`,context);
    const result=navigationLifecycleSnapshot(context);
    assert.deepEqual(result.requests,[{origin:'origin',destination:'destination',waypoints:['waypoint-1','waypoint-2']}]);
    assert.deepEqual(result.waypoints,['waypoint-1','waypoint-2']);
    assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
    assert.equal(result.route,outcome==='cancel'?'confirmed':'alternate');
    assert.equal(result.linePoints,4);
    assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,2);
  });
}

for (const outcome of ['cancel','confirm']) {
  test(`route-add preview ${outcome} preserves existing waypoints${outcome==='confirm'?' and appends the new waypoint':''}`, async () => {
    const context=loadApp();installConfirmedWaypointFixture(context);
    await vm.runInContext(`(async()=>{
      startNavigation();
      fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push({origin:origin.id,destination:destination.id,waypoints:waypoints.map(point=>point.id)});return[makeLifecycleRoute('with-added',waypoints)]};
      prepareRoutes=routes=>routes;drawRoutes=()=>{};renderRouteCards=()=>{};updateRouteFields=()=>{};
      await beginNavigationRoutePreview('waypoint',lifecycleAdded);
      ${outcome==='cancel'?"cancelNavigationRoutePreview(false)":"confirmNavigationRoutePreview()"};
    })()`,context);
    const result=navigationLifecycleSnapshot(context);
    assert.deepEqual(result.requests,[{origin:'origin',destination:'destination',waypoints:['waypoint-1','waypoint-2','waypoint-3']}]);
    const expected=outcome==='cancel'?['waypoint-1','waypoint-2']:['waypoint-1','waypoint-2','waypoint-3'];
    assert.deepEqual(result.waypoints,expected);
    assert.deepEqual(result.remaining,expected);
    assert.equal(result.route,outcome==='cancel'?'confirmed':'with-added');
    assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,expected.length);
  });
}

test('a stale reroute response cannot overwrite a newly confirmed navigation route or waypoints', async () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  await vm.runInContext(`(async()=>{
    startNavigation();
    let resolveOld;fetchRoutes=()=>new Promise(resolve=>{resolveOld=resolve});prepareRoutes=routes=>routes;
    const old=recalculateNavigationRoute('manual');
    state.routes=[makeLifecycleRoute('new-confirmed')];state.selectedRoute=0;startNavigation();
    resolveOld([makeLifecycleRoute('stale-direct',[])]);await old;
  })()`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.equal(result.route,'new-confirmed');
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.linePoints,4);
});

test('reroute failure and retry preserve waypoints and send them again', async () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  await vm.runInContext(`(async()=>{
    startNavigation();let attempt=0;
    fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push(waypoints.map(point=>point.id));if(!attempt++)throw new Error('offline');return[makeLifecycleRoute('retry',waypoints)]};
    prepareRoutes=routes=>routes;
    await recalculateNavigationRoute('manual');await recalculateNavigationRoute('manual');
  })()`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.requests,[['waypoint-1','waypoint-2'],['waypoint-1','waypoint-2']]);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.route,'retry');
  assert.equal(result.linePoints,4);
});

test('history restoration preserves confirmed waypoint route, markers, steps and HUD', () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  vm.runInContext(`startNavigation();handlePopState({state:{screen:'navigation'}})`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.remaining,['waypoint-1','waypoint-2']);
  assert.equal(result.route,'confirmed');
  assert.equal(result.linePoints,4);
  assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,2);
  assert.deepEqual(result.steps,['직진']);
  assert.notEqual(result.remain,'');
});

test('passing waypoint 1 removes only it from the next reroute request', async () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  await vm.runInContext(`(async()=>{
    startNavigation();
    updateNavHud({latitude:37.015,longitude:127},5);
    fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push({destination:destination.id,waypoints:waypoints.map(point=>point.id)});return[makeLifecycleRoute('after-pass',waypoints)]};
    prepareRoutes=routes=>routes;await recalculateNavigationRoute('manual');
  })()`,context);
  const result=navigationLifecycleSnapshot(context);
  assert.deepEqual(result.requests,[{destination:'destination',waypoints:['waypoint-2']}]);
  assert.deepEqual(result.waypoints,['waypoint-2']);
  assert.deepEqual(result.remaining,['waypoint-2']);
  assert.equal(result.route,'after-pass');
  assert.equal(result.markers.filter(name=>name.includes('waypoint')).length,1);
  assert.equal(result.markers.filter(name=>name.includes('destination')).length,1);
});

test('reroute resets progress before recalculating remaining waypoint positions on the new geometry', async () => {
  const context=loadApp();installConfirmedWaypointFixture(context);
  const result=await vm.runInContext(`(async()=>{
    startNavigation();
    state.nav.waypointProgress=[4000,8000];state.nav.progressDistance=5000;
    syncPassedNavigationWaypoints(state.routes[state.selectedRoute]);
    const beforeReroute={remaining:state.nav.remainingWaypoints.map(point=>point.id),progress:state.nav.progressDistance};
    lifecycleCurrent={id:'current',name:'Current',latitude:37.015,longitude:127};state.currentLocation=lifecycleCurrent;
    makeNewRoute=()=>({id:'new-geometry',routeMode:'BIKE_ONLY',totalDistance:1668,totalTime:1200,
      _points:[lifecycleCurrent,lifecycleWaypoint2,lifecycleDestination],
      _steps:[{guidance:'吏곸쭊',_startAlong:0,_endAlong:1668,points:[lifecycleCurrent,lifecycleWaypoint2,lifecycleDestination]}]});
    fetchRoutes=async(origin,destination,waypoints)=>{lifecycleRequests.push({origin:origin.id,destination:destination.id,waypoints:waypoints.map(point=>point.id)});return[makeNewRoute()]};
    prepareRoutes=routes=>routes;
    await recalculateNavigationRoute('manual');
    const route=state.routes[state.selectedRoute],expected=projectOnRoute(route._points,lifecycleWaypoint2).alongDistance;
    const afterReroute={
      progress:state.nav.progressDistance,waypointProgress:state.nav.waypointProgress[0],expected,
      remaining:state.nav.remainingWaypoints.map(point=>point.id),waypoints:state.waypoints.map(point=>point.id),
      destination:state.destination.id,routePoints:route._points.map(point=>point.id),linePoints:state.routeLines[state.selectedRoute].path.length,
      waypointMarkers:state.routeEndpointMarkers.filter(marker=>marker.content.className.includes('waypoint')).length,
      destinationMarkers:state.routeEndpointMarkers.filter(marker=>marker.content.className.includes('destination')).length,
      hud:$('#remainDistance').textContent
    };
    updateNavHud({latitude:37.025,longitude:127},5);
    return {beforeReroute,request:lifecycleRequests[0],afterReroute,afterPass:{remaining:state.nav.remainingWaypoints.map(point=>point.id),destination:state.destination.id}};
  })()`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.beforeReroute)),{remaining:['waypoint-2'],progress:5000});
  assert.deepEqual(JSON.parse(JSON.stringify(result.request)),{origin:'current',destination:'destination',waypoints:['waypoint-2']});
  assert.deepEqual([...result.afterReroute.remaining],['waypoint-2']);
  assert.deepEqual([...result.afterReroute.waypoints],['waypoint-2']);
  assert.equal(result.afterReroute.progress,0);
  assert.equal(result.afterReroute.waypointProgress,result.afterReroute.expected);
  assert.ok(result.afterReroute.waypointProgress>0);
  assert.deepEqual([...result.afterReroute.routePoints],['current','waypoint-2','destination']);
  assert.equal(result.afterReroute.linePoints,3);
  assert.equal(result.afterReroute.waypointMarkers,1);
  assert.equal(result.afterReroute.destinationMarkers,1);
  assert.notEqual(result.afterReroute.hud,'');
  assert.deepEqual(JSON.parse(JSON.stringify(result.afterPass)),{remaining:[],destination:'destination'});
});
