const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadApp({ manualTimers = false } = {}) {
  let now = 0, nextTimer = 1;
  const timers = new Map();
  const setTestTimeout = (fn, delay = 0) => {
    if (!manualTimers) { if (typeof fn === 'function') fn(); return nextTimer++; }
    const id = nextTimer++;
    timers.set(id, { fn, at: now + delay });
    return id;
  };
  const clearTestTimeout = id => timers.delete(id);
  const advance = ms => {
    now += ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at);
      if (!due.length) break;
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
    }
  };
  const elements = new Map();
  const makeElement = () => {
    const classes = new Set(['hidden']);
    return {
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name),
      },
      style: { setProperty(name, value) { this[name] = value; } },
      addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return makeElement(); },
      setPointerCapture() {}, focus() { this.focused = true; this.blurred = false; }, blur() { this.focused = false; this.blurred = true; }, offsetHeight: 600, value: '', innerHTML: '', textContent: '',
    };
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {},
    body: makeElement(),
    documentElement: makeElement(),
  };
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const context = vm.createContext({
    console, document, localStorage, AbortController, URLSearchParams,
    setTimeout: setTestTimeout, clearTimeout: clearTestTimeout,
    innerHeight: 800, history: { pushState() {}, back() {} },
    navigator: { geolocation: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } },
    fetch: async () => ({ json: async () => ({ error: 'test' }), ok: false }),
  });
  context.window = { addEventListener() {}, visualViewport: null };
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });
  return { context, localStorage, advance, hasTimer: id => timers.has(id) };
}

function runGpsSamples(samples) {
  const { context } = loadApp();
  context.testSamples = samples;
  vm.runInContext(`
    let testGpsCallback;
    navigator.geolocation.watchPosition=callback=>{testGpsCallback=callback;return 1};
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    setGpsMarker=()=>{};updateNavHud=()=>{};
    state.screen='navigation';state.map={panTo(){this.panCalls=(this.panCalls||0)+1}};startWatch();
    for(const sample of testSamples)testGpsCallback({timestamp:sample.timestamp,coords:{latitude:sample.latitude,longitude:sample.longitude,speed:sample.speed,accuracy:sample.accuracy,heading:null}});
  `, context);
  return {
    currentSpeed: vm.runInContext('state.nav.currentSpeed', context),
    maxSpeed: vm.runInContext('state.nav.maxSpeed', context),
    followCalls: vm.runInContext('state.map.panCalls||0', context),
  };
}

test('turn guidance exposes only the compact maneuver', () => {
  const { context } = loadApp();
  const result = vm.runInContext("navigationInstruction([{guidance:'260m 후 신도봉사거리까지 좌회전 후 359m 이동',points:[]}],0)", context);
  assert.equal(result, '좌회전');
});

test('remaining route starts at progress and keeps the destination', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof remainingRoutePoints', context), 'function');
  const result = vm.runInContext("remainingRoutePoints([{latitude:0,longitude:0},{latitude:0,longitude:0.001},{latitude:0,longitude:0.002}],166.8)", context);
  assert.equal(result.length, 2);
  assert.ok(result[0].longitude > 0.0014 && result[0].longitude < 0.0016);
  assert.equal(result[1].longitude, 0.002);
});

test('recent searches deduplicate newest first and keep ten', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof saveRecentSearch', context), 'function');
  vm.runInContext("for(let i=0;i<11;i++)saveRecentSearch({query:'검색'+i});saveRecentSearch({query:'검색5'})", context);
  const result = vm.runInContext('readRecentSearches()', context);
  assert.equal(result.length, 10);
  assert.equal(result[0].query, '검색5');
  assert.equal(result.filter(item => item.query === '검색5').length, 1);
});

test('navigation search pauses follow and preserves its viewport', () => {
  const { context } = loadApp();
  vm.runInContext("state.nav.follow=true;state.map={getLevel:()=>4,getCenter:()=>({lat:37.5,lng:127}),relayout(){}};openSearch(null,true)", context);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  assert.equal(vm.runInContext('state.navSearchViewport.level', context), 4);
  assert.equal(vm.runInContext('state.navSearchViewport.follow', context), true);
});

test('navigation level follows current speed in km/h boundaries', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof navigationLevelForSpeed', context), 'function');
  for (const [kmh, level] of [[0,1],[20,1],[29.9,1],[30,2],[40,2],[59.9,2],[60,3],[65,3]]) {
    assert.equal(vm.runInContext(`navigationLevelForSpeed(${kmh}/3.6)`, context), level, `${kmh}km/h`);
  }
  assert.equal(vm.runInContext('navigationLevelForSpeed(undefined)', context), 1);
  assert.equal(vm.runInContext('typeof navigationLevelForDistance', context), 'undefined');
});

test('search distance uses metres below 1km and one decimal kilometre above it', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof formatPlaceDistance', context), 'function');
  assert.equal(vm.runInContext('formatPlaceDistance(850)', context), '850m');
  assert.equal(vm.runInContext('formatPlaceDistance(5400)', context), '5.4km');
  assert.equal(vm.runInContext('formatPlaceDistance(null)', context), '');
});

test('live results show distance and dismiss the keyboard only after rendering', () => {
  const { context } = loadApp();
  const input = context.document.querySelector('#searchInput');
  input.focus();
  vm.runInContext("renderLive([{name:'장소',category:'카테고리',address:'주소',distance:850}])", context);
  assert.match(context.document.querySelector('#liveResults').innerHTML, /850m/);
  assert.equal(input.blurred, true);
});

test('route select shows fixed-size departure and destination pins', () => {
  const { context } = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude, longitude) { this.latitude=latitude; this.longitude=longitude; } }
    class TestOverlay { constructor(options) { Object.assign(this, options); } setMap(map) { this.map=map; } }
    kakao={maps:{LatLng:TestLatLng,CustomOverlay:TestOverlay}};
    state.map={setLevel(level){this.level=level}};
    state.departure={latitude:37.5,longitude:127,name:'현재 위치'};
    state.destination={latitude:37.6,longitude:127.1,name:'목적지'};
  `, context);
  vm.runInContext('drawRouteEndpointMarkers(false)', context);
  assert.equal(vm.runInContext('state.routeEndpointMarkers.length', context), 2);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.className", context), 'route-endpoint-marker departure');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[1].content.className", context), 'route-endpoint-marker destination');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '40px');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[1].content.style.width", context), '40px');
  vm.runInContext('state.map.setLevel(1);state.map.setLevel(7)', context);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '40px');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[1].content.style.width", context), '40px');
});

test('navigation keeps a fixed-size destination pin', () => {
  const { context } = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude, longitude) { this.latitude=latitude; this.longitude=longitude; } }
    class TestOverlay { constructor(options) { Object.assign(this, options); } setMap(map) { this.map=map; } }
    kakao={maps:{LatLng:TestLatLng,CustomOverlay:TestOverlay}};
    state.map={setLevel(level){this.level=level}};
    state.departure={latitude:37.5,longitude:127,name:'현재 위치'};
    state.destination={latitude:37.6,longitude:127.1,name:'목적지'};
  `, context);
  vm.runInContext('drawRouteEndpointMarkers(true)', context);
  assert.equal(vm.runInContext('state.routeEndpointMarkers.length', context), 1);
  assert.equal(vm.runInContext('state.routeEndpointMarkers[0].position.latitude', context), 37.6);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.className", context), 'route-endpoint-marker destination');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '40px');
  vm.runInContext('state.map.setLevel(1);state.map.setLevel(7)', context);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '40px');
});

test('navigation start applies the current speed level', () => {
  const { context } = loadApp();
  vm.runInContext(`
    state.routes=[{_steps:[]}];state.selectedRoute=0;state.routeLines=[null];state.currentLocation=null;
    state.nav.currentSpeed=40/3.6;state.map={setLevel(level){this.level=level}};
    renderScreen=()=>{state.screen='navigation'};clearSearchMarkers=()=>{};drawRouteEndpointMarkers=()=>{};
    setGpsMarker=()=>{};startWatch=()=>{};updateNavHud=()=>{};toast=()=>{};
    startNavigation();
  `, context);
  assert.equal(vm.runInContext('state.map.level', context), 2);
});

test('map interaction stays unfollowed until five seconds then returns at current speed', () => {
  const { context, advance } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof beginNavigationMapInteraction', context), 'function');
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=true;state.nav.currentSpeed=40/3.6;state.currentLocation=null;state.map={setLevel(level){this.level=level}};beginNavigationMapInteraction();endNavigationMapInteraction()", context);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(4999);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(1);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
  assert.equal(vm.runInContext('state.map.level', context), 2);
});

test('another interaction resets the single return timer', () => {
  const { context, advance, hasTimer } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof beginNavigationMapInteraction', context), 'function');
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=true;state.currentLocation=null;state.map={setLevel(level){this.level=level}};beginNavigationMapInteraction();endNavigationMapInteraction()", context);
  const firstTimer = vm.runInContext('navReturnTimer', context);
  advance(3000);
  vm.runInContext('beginNavigationMapInteraction();endNavigationMapInteraction()', context);
  const secondTimer = vm.runInContext('navReturnTimer', context);
  assert.notEqual(secondTimer, firstTimer);
  assert.equal(hasTimer(firstTimer), false);
  assert.equal(hasTimer(secondTimer), true);
  advance(2000);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(3000);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
});

test('current-location button cancels the timer and immediately restores speed zoom', () => {
  const { context, hasTimer } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=false;state.nav.currentSpeed=65/3.6;state.currentLocation=null;state.map={setLevel(level){this.level=level}};endNavigationMapInteraction()", context);
  const timer = vm.runInContext('navReturnTimer', context);
  vm.runInContext("$('#navLocateBtn').onclick()", context);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
  assert.equal(vm.runInContext('state.map.level', context), 3);
  assert.equal(vm.runInContext('navReturnTimer', context), null);
  assert.equal(hasTimer(timer), false);
});

test('current-location button uses level one while stopped', () => {
  const { context } = loadApp();
  vm.runInContext("state.nav.follow=false;state.nav.currentSpeed=0;state.currentLocation=null;state.map={setLevel(level){this.level=level}};$('#navLocateBtn').onclick()", context);
  assert.equal(vm.runInContext('state.map.level', context), 1);
});

test('route selection keeps every returned polyline and emphasizes only the selected one', () => {
  const { context } = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude, longitude) { this.latitude=latitude; this.longitude=longitude; } }
    class TestBounds { constructor(){this.points=[]} extend(point){this.points.push(point)} isEmpty(){return !this.points.length} }
    class TestPolyline { constructor(options){this.options={...options}} setMap(map){this.map=map} setOptions(options){Object.assign(this.options,options)} }
    class TestOverlay { constructor(options){Object.assign(this,options)} setMap(map){this.map=map} }
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds,Polyline:TestPolyline,CustomOverlay:TestOverlay}};
    state.map={setBounds(){}};
    state.departure={latitude:37.5,longitude:127,name:'현재 위치'};
    state.destination={latitude:37.6,longitude:127.1,name:'목적지'};
    state.routes=[
      {_points:[{latitude:37.5,longitude:127},{latitude:37.6,longitude:127.1}]},
      {_points:[{latitude:37.5,longitude:127},{latitude:37.55,longitude:127.2}]}
    ];
    state.selectedRoute=0;
    drawRoutes();
  `, context);
  assert.equal(vm.runInContext('state.routeLines.length', context), 2);
  vm.runInContext('selectRoute(1)', context);
  assert.equal(vm.runInContext("state.routeLines[0].options.strokeColor", context), '#98a7b8');
  assert.equal(vm.runInContext("state.routeLines[1].options.strokeColor", context), '#0878f9');
});

test('stationary GPS drift and 13-16km/h spikes do not pollute current or max speed', () => {
  const result = runGpsSamples([
    {timestamp:1000,latitude:37.5,longitude:127,speed:0,accuracy:20},
    {timestamp:2000,latitude:37.50002,longitude:127,speed:13/3.6,accuracy:20},
    {timestamp:3000,latitude:37.499985,longitude:127,speed:16/3.6,accuracy:20},
    {timestamp:4000,latitude:37.50001,longitude:127,speed:4/3.6,accuracy:20},
  ]);
  assert.equal(result.currentSpeed, 0);
  assert.equal(result.maxSpeed, 0);
});

test('real 3-5km/h low-speed movement is eventually recognized', () => {
  const result = runGpsSamples(Array.from({length:6},(_,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.00001,longitude:127,speed:4/3.6,accuracy:5})));
  assert.ok(result.currentSpeed*3.6>=3&&result.currentSpeed*3.6<=5);
});

test('normal 10-25km/h riding is reflected without heavy lag', () => {
  const result = runGpsSamples(Array.from({length:5},(_,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.000045,longitude:127,speed:18/3.6,accuracy:5})));
  assert.ok(result.currentSpeed*3.6>=16&&result.currentSpeed*3.6<=20);
});

test('one speed spike during normal riding is suppressed', () => {
  const speeds=[18,18,18,72,18];
  const result = runGpsSamples(speeds.map((speed,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.000045,longitude:127,speed:speed/3.6,accuracy:5})));
  assert.ok(result.currentSpeed*3.6>=16&&result.currentSpeed*3.6<=20);
  assert.ok(result.maxSpeed*3.6<30);
});

test('stationary GPS drift updates navigation without moving the camera', () => {
  const result = runGpsSamples([
    {timestamp:1000,latitude:37.5,longitude:127,speed:0,accuracy:20},
    {timestamp:2000,latitude:37.50002,longitude:127,speed:13/3.6,accuracy:20},
    {timestamp:3000,latitude:37.499985,longitude:127,speed:16/3.6,accuracy:20},
  ]);
  assert.equal(result.followCalls, 0);
});

test('confirmed movement keeps navigation camera follow active', () => {
  const result = runGpsSamples(Array.from({length:6},(_,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.000045,longitude:127,speed:18/3.6,accuracy:5})));
  assert.ok(result.followCalls>0);
});

test('current-location button follows immediately even while stationary', () => {
  const { context } = loadApp();
  vm.runInContext(`
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    state.nav.follow=false;state.nav.speedMoving=false;
    state.currentLocation={latitude:37.5,longitude:127};
    state.map={setLevel(){},panTo(){this.panCalls=(this.panCalls||0)+1}};
    $('#navLocateBtn').onclick();
  `, context);
  assert.equal(vm.runInContext('state.map.panCalls', context), 1);
});

test('six: viewport metrics include the visual viewport bottom obstruction', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof viewportMetrics', context), 'function');
  context.testViewport = { height: 700, offsetTop: 20 };
  assert.deepEqual(
    JSON.parse(vm.runInContext('JSON.stringify(viewportMetrics(testViewport, 800))', context)),
    { height: 700, bottom: 80 },
  );
  context.window.innerHeight = 800;
  context.window.visualViewport = context.testViewport;
  vm.runInContext('syncViewportMetrics()', context);
  assert.equal(context.document.documentElement.style['--viewport-bottom'], '80px');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(css, /env\(safe-area-inset-bottom\).*var\(--viewport-bottom/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
});

test('six: route fit padding follows the visible editor and route controls', () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof routeFitPadding', context), 'function');
  const padding = JSON.parse(vm.runInContext('JSON.stringify(routeFitPadding(800, 0, 118, 610))', context));
  assert.deepEqual(padding, { top: 130, right: 24, bottom: 202, left: 24 });
  const offsetPadding = JSON.parse(vm.runInContext('JSON.stringify(routeFitPadding(800, 20, 118, 610))', context));
  assert.deepEqual(offsetPadding, { top: 110, right: 24, bottom: 222, left: 24 });
  vm.runInContext(`
    class TestLatLng { constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude} }
    class TestBounds { constructor(){this.points=[]} extend(point){this.points.push(point)} isEmpty(){return !this.points.length} }
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds}};
    $('#routeEditor').getBoundingClientRect=()=>({bottom:118});
    $('#routeCards').getBoundingClientRect=()=>({top:610});
    $('#startNavBtn').getBoundingClientRect=()=>({top:730});
    state.departure={latitude:37,longitude:127};state.destination={latitude:38,longitude:128};
    state.routes=[{_points:[{latitude:37.1,longitude:127.1},{latitude:37.9,longitude:127.9}]},{_points:[{latitude:30,longitude:120}]}];
    state.selectedRoute=0;state.map={setBounds(bounds,...padding){this.bounds=bounds;this.padding=padding}};
    fitSelectedRoute();
  `, context);
  assert.equal(vm.runInContext('state.map.bounds.points.length', context), 4);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.map.padding)', context)), [130,24,202,24]);
  assert.equal(vm.runInContext('typeof syncRouteViewport', context), 'function');
  vm.runInContext("let testRefits=0;fitSelectedRoute=()=>{testRefits++};state.screen='route';syncRouteViewport()", context);
  assert.equal(vm.runInContext('testRefits', context), 1);
});

test('six: route request preserves ordered waypoints up to five', async () => {
  const { context } = loadApp();
  assert.equal(vm.runInContext('typeof buildRouteParams', context), 'function');
  const query = vm.runInContext(`buildRouteParams(
    {latitude:37.1,longitude:127.1,name:'출발'},
    [{latitude:37.2,longitude:127.2,name:'경유 1'},{latitude:37.3,longitude:127.3,name:'경유 2'}],
    {latitude:37.4,longitude:127.4,name:'도착'}
  ).toString()`, context);
  const params = new URLSearchParams(query);
  assert.equal(params.get('via_x'), '127.2,127.3');
  assert.equal(params.get('via_y'), '37.2,37.3');
  assert.equal(params.get('v_name'), '경유 1,경유 2');
  context.testWaypoint = { latitude: 37.25, longitude: 127.25, name: '검색 경유지' };
  await vm.runInContext(`
    let testRouteLoads=0;loadRoutes=async()=>{testRouteLoads++};
    state.departure={latitude:37.1,longitude:127.1};state.destination={latitude:37.4,longitude:127.4};
    state.editingEndpoint='waypoint';state.editingWaypointIndex=0;
    choosePlace(testWaypoint)
  `, context);
  assert.equal(vm.runInContext('state.waypoints[0].name', context), '검색 경유지');
  assert.equal(vm.runInContext('testRouteLoads', context), 1);
});

test('six: destination marker uses the selected route geometry endpoint', () => {
  const { context } = loadApp();
  vm.runInContext(`
    class TestLatLng { constructor(latitude, longitude) { this.latitude=latitude; this.longitude=longitude; } }
    class TestOverlay { constructor(options) { Object.assign(this, options); } setMap(map) { this.map=map; } }
    kakao={maps:{LatLng:TestLatLng,CustomOverlay:TestOverlay}};
    state.map={};state.departure={latitude:37.1,longitude:127.1};
    state.destination={latitude:37.9,longitude:127.9};
    state.routes=[{_points:[{latitude:37.1,longitude:127.1},{latitude:37.45,longitude:127.55}]}];
    state.selectedRoute=0;drawRouteEndpointMarkers(false);
  `, context);
  assert.equal(vm.runInContext('state.routeEndpointMarkers[1].position.latitude', context), 37.45);
  assert.equal(vm.runInContext('state.routeEndpointMarkers[1].position.longitude', context), 127.55);
});

test('six: compass and north-direction controls are absent', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.doesNotMatch(html, /id="compassBtn"|data-nav-action="north"/);
  assert.doesNotMatch(css, /(?:#map|navigation-active)[^}]*rotate\(/);
});

test('six: camera follow ignores small fixes and blocks overlapping moves', () => {
  const { context, advance } = loadApp({ manualTimers: true });
  vm.runInContext(`
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    state.screen='navigation';state.nav.follow=true;state.nav.speedMoving=true;
    state.map={panTo(){this.panCalls=(this.panCalls||0)+1}};
    followNavigationPosition({latitude:37.5,longitude:127},false,5,1000);
    followNavigationPosition({latitude:37.50001,longitude:127},false,5,1100);
    followNavigationPosition({latitude:37.5003,longitude:127},false,5,1200);
  `, context);
  assert.equal(vm.runInContext('state.map.panCalls', context), 1);
  advance(700);
  vm.runInContext('followNavigationPosition({latitude:37.5003,longitude:127},false,5,2000)', context);
  assert.equal(vm.runInContext('state.map.panCalls', context), 2);

  const gps = runGpsSamples(Array.from({length:7},(_,i)=>({
    timestamp:(i+1)*1000,
    latitude:37.5+i*.000045,
    longitude:127,
    speed:18/3.6,
    accuracy:5,
  })));
  assert.ok(gps.followCalls > 0);
  assert.ok(gps.followCalls < 7);
});
