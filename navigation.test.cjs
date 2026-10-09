const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Ride = require('./ride-foundation.js');

function loadApp({ manualTimers = false } = {}) {
  let now = 0, nextTimer = 1, performanceNow = 0;
  const routeLogs = [];
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
      addEventListener() {}, setAttribute(name,value){this[name]=String(value)}, getAttribute(name){return this[name]??null}, querySelectorAll() { return []; }, querySelector() { return makeElement(); },
      getBoundingClientRect() { return { top: 600, bottom: 120, left: 0, right: 0, width: 0, height: 0 }; },
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
    console: {...console,groupCollapsed:(...args)=>routeLogs.push(args.join(' ')),groupEnd(){},log:(...args)=>routeLogs.push(args.join(' ')),table:value=>routeLogs.push(JSON.stringify(value))}, document, localStorage, AbortController, URLSearchParams,
    setTimeout: setTestTimeout, clearTimeout: clearTestTimeout,
    performance: { now: () => ++performanceNow },
    requestAnimationFrame: callback => { performanceNow++; callback(performanceNow); return performanceNow; },
    innerHeight: 800, innerWidth:390, history: { pushState() {}, back() {} },
    RideMateRide: Ride,
    navigator: { geolocation: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } },
    fetch: async () => ({ json: async () => ({ error: 'test' }), ok: false }),
  });
  context.window = { addEventListener() {}, visualViewport: null, innerHeight:800, innerWidth:390 };
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });
  return { context, localStorage, advance, hasTimer: id => timers.has(id), routeLogs };
}

function runGpsSamples(samples) {
  const { context } = loadApp();
  context.testSamples = samples;
  vm.runInContext(`
    let testGpsCallback;
    let testReceivedAt=Date.now();
    navigator.geolocation.watchPosition=callback=>{testGpsCallback=callback;return 1};
    sharedGpsSource=Ride.createGpsSource(navigator.geolocation,undefined,{now:()=>testReceivedAt});
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    testMarkerPositions=[];setGpsMarker=position=>testMarkerPositions.push(position);updateNavHud=()=>{};
    state.screen='navigation';state.map={panTo(){this.panCalls=(this.panCalls||0)+1}};ensureSharedRide(testReceivedAt);startWatch();
    for(const sample of testSamples){testReceivedAt=Date.now()+sample.timestamp;testGpsCallback({timestamp:testReceivedAt,coords:{latitude:sample.latitude,longitude:sample.longitude,speed:sample.speed,accuracy:sample.accuracy,heading:null}})};
  `, context);
  return {
    currentSpeed: vm.runInContext('state.nav.currentSpeed', context),
    maxSpeed: vm.runInContext('state.nav.maxSpeed', context),
    distance: vm.runInContext('state.ride.distance', context),
    speedMoving: vm.runInContext('state.ride.motion.moving', context),
    followCalls: vm.runInContext('state.map.panCalls||0', context),
    markerPositions: JSON.parse(vm.runInContext('JSON.stringify(testMarkerPositions)', context)),
  };
}

function prepareNavigationFixture(context, points, steps, { duplicateStepGeometry = false } = {}) {
  const vertexes = points.flatMap(point => [point.longitude, point.latitude]);
  context.routeFixture = {
    totalDistance: 1000,
    totalTime: 600,
    route: {
      sections: [{ roads: [{ vertexes }] }],
      legs: [{
        steps: steps.map(step => ({
          properties: {
            x: step.point.longitude,
            y: step.point.latitude,
            guidance: step.guidance || '',
            distance: step.distance || 0,
          },
          ...(duplicateStepGeometry ? { path: { vertexes } } : {}),
        })),
      }],
    },
  };
  return JSON.parse(vm.runInContext('JSON.stringify(prepareRoutes([routeFixture])[0])', context));
}

function cardinalTurn(directionIn, directionOut) {
  const anchor = { latitude: 37, longitude: 127 };
  const scale = 0.001;
  return [
    { latitude: anchor.latitude - directionIn[0] * scale, longitude: anchor.longitude - directionIn[1] * scale },
    anchor,
    { latitude: anchor.latitude + directionOut[0] * scale, longitude: anchor.longitude + directionOut[1] * scale },
  ];
}

test('route maneuver resolves all cardinal turns from travel direction', () => {
  const directions = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] };
  const cases = [
    ['east', 'north', '좌회전'], ['south', 'west', '우회전'],
    ['north', 'east', '우회전'], ['west', 'south', '좌회전'],
    ['east', 'south', '우회전'], ['south', 'east', '좌회전'],
    ['north', 'west', '좌회전'], ['west', 'north', '우회전'],
    ['north', 'south', '유턴'], ['east', 'west', '유턴'],
    ['south', 'north', '유턴'], ['west', 'east', '유턴'],
  ];
  for (const [incoming, outgoing, expected] of cases) {
    const { context } = loadApp();
    const points = cardinalTurn(directions[incoming], directions[outgoing]);
    const route = prepareNavigationFixture(context, points, [{ point: points[1] }]);
    context.testSteps = route._steps;
    assert.equal(vm.runInContext('navigationInstruction(testSteps,0)', context), expected, `${incoming} -> ${outgoing}`);
  }
});

test('route maneuver is independent of map orientation', () => {
  const { context } = loadApp();
  const points = cardinalTurn([0, 1], [1, 0]);
  const route = prepareNavigationFixture(context, points, [{ point: points[1] }]);
  context.testSteps = route._steps;
  vm.runInContext('state.map={getHeading:()=>0}', context);
  const northUp = vm.runInContext('navigationInstruction(testSteps,0)', context);
  vm.runInContext('state.map={getHeading:()=>237}', context);
  assert.equal(vm.runInContext('navigationInstruction(testSteps,0)', context), northUp);
  assert.equal(northUp, '좌회전');
});

test('route maneuver preserves opposite turns only 15m apart', () => {
  const { context } = loadApp();
  const points = [
    { latitude: 37, longitude: 127 },
    { latitude: 37, longitude: 127.0003 },
    { latitude: 37.000135, longitude: 127.0003 },
    { latitude: 37.000135, longitude: 127.0006 },
  ];
  const route = prepareNavigationFixture(context, points, [
    { point: points[1] },
    { point: points[2] },
  ]);
  context.testSteps = route._steps;
  assert.equal(route._steps.length, 2);
  assert.equal(vm.runInContext('navigationInstruction(testSteps,0)', context), '좌회전');
  assert.equal(vm.runInContext('navigationInstruction(testSteps,1)', context), '우회전');
  assert.ok(route._steps[1]._endAlong - route._steps[0]._endAlong > 14);
  assert.ok(route._steps[1]._endAlong - route._steps[0]._endAlong < 16);
});

test('route preparation uses one Kakao geometry representation and restores step travel order', () => {
  const { context } = loadApp();
  const points = [
    { latitude: 37, longitude: 127 },
    { latitude: 37, longitude: 127.0003 },
    { latitude: 37.000135, longitude: 127.0003 },
    { latitude: 37.000135, longitude: 127.0006 },
  ];
  const route = prepareNavigationFixture(context, points, [
    { point: points[2] },
    { point: points[1] },
  ], { duplicateStepGeometry: true });
  context.testSteps = route._steps;
  assert.equal(route._points.length, points.length);
  assert.ok(route._steps[0]._endAlong < route._steps[1]._endAlong);
  assert.equal(vm.runInContext('navigationInstruction(testSteps,0)', context), '좌회전');
  assert.equal(vm.runInContext('navigationInstruction(testSteps,1)', context), '우회전');
});

test('a later maneuver at a repeated coordinate stays at its matching step path occurrence', () => {
  const { context } = loadApp();
  context.routeFixture = {
    totalDistance: 9000,
    totalTime: 3600,
    route: { legs: [{ steps: [
      { properties: { x: 127, y: 36.9996, guidance: '직진' }, path: { points: [[127,36.9996],[127,37],[126.97,37]] } },
      { properties: { x: 126.97, y: 37, guidance: '직진' }, path: { points: [[126.97,37],[126.97,37.01]] } },
      { properties: { x: 126.97, y: 37.01, guidance: '직진' }, path: { points: [[126.97,37.01],[127,37]] } },
      { properties: { x: 127, y: 37, guidance: '좌회전 후 이동' }, path: { points: [[127,37],[127,37.001]] } },
    ] }] },
  };
  const route = JSON.parse(vm.runInContext('JSON.stringify(prepareRoutes([routeFixture])[0])', context));
  context.testSteps = route._steps;
  const leftIndex = route._steps.findIndex(step => step._structuredManeuver === '좌회전');
  const nextIndex = route._steps.findIndex(step => step._endAlong >= 1);
  assert.ok(route._steps[leftIndex]._endAlong > 6000, `later LEFT collapsed to ${route._steps[leftIndex]._endAlong}m`);
  assert.ok(route._steps[nextIndex]._endAlong - 1 > 2000, `HUD selected a ${route._steps[nextIndex]._endAlong - 1}m immediate maneuver`);
  assert.equal(vm.runInContext(`navigationInstruction(testSteps,${leftIndex})`, context), '좌회전');
});

test('ordered step progress disambiguates two identical repeated path sequences', () => {
  const { context } = loadApp();
  context.routeFixture = {
    totalDistance: 9000,
    totalTime: 3600,
    route: { legs: [{ steps: [
      { properties: { x: 127, y: 36.9996, guidance: '직진' }, path: { points: [[127,36.9996],[127,37],[126.999,37],[126.97,37.01],[127,37]] } },
      { properties: { x: 127, y: 37, guidance: '좌회전 후 이동' }, path: { points: [[127,37],[126.999,37]] } },
    ] }] },
  };
  const route = JSON.parse(vm.runInContext('JSON.stringify(prepareRoutes([routeFixture])[0])', context));
  const left = route._steps.find(step => step._structuredManeuver === '좌회전');
  assert.ok(left._endAlong > 5000, `identical later path collapsed to ${left._endAlong}m`);
});

test('ordered step progress disambiguates a repeated fallback maneuver point', () => {
  const { context } = loadApp();
  context.routeFixture = {
    totalDistance: 9000,
    totalTime: 3600,
    route: { legs: [{ steps: [
      { properties: { x: 127, y: 36.9996, guidance: '직진' }, path: { points: [[127,36.9996],[127,37],[126.999,37],[126.97,37.01],[127,37]] } },
      { properties: { x: 127, y: 37, guidance: '좌회전 후 이동' } },
    ] }] },
  };
  const route = JSON.parse(vm.runInContext('JSON.stringify(prepareRoutes([routeFixture])[0])', context));
  const left = route._steps.find(step => step._structuredManeuver === '좌회전');
  assert.ok(left._endAlong > 5000, `fallback maneuver collapsed to ${left._endAlong}m`);
});

test('forward route projection does not jump to a nearby later parallel segment', () => {
  const { context } = loadApp();
  context.testPoints = [
    { latitude: 37, longitude: 127 },
    { latitude: 37, longitude: 127.002 },
    { latitude: 37.0001, longitude: 127.002 },
    { latitude: 37.0001, longitude: 127 },
  ];
  const projection = vm.runInContext("projectOnRoute(testPoints,{latitude:37.00009,longitude:127.0005},{previousAlong:40,accuracy:15})", context);
  assert.ok(projection.alongDistance < 200, `unexpected later-segment progress ${projection.alongDistance}`);
  const accurateProjection = vm.runInContext("projectOnRoute(testPoints,{latitude:37.00009,longitude:127.0005},{previousAlong:40,accuracy:5})", context);
  assert.ok(accurateProjection.alongDistance < 200, `5m accuracy jumped to later progress ${accurateProjection.alongDistance}`);
});

test('structured maneuver conflict is retained and geometry controls left or right', () => {
  const { context } = loadApp();
  const points = cardinalTurn([0, 1], [1, 0]);
  const route = prepareNavigationFixture(context, points, [{ point: points[1], guidance: '우회전' }]);
  context.testSteps = route._steps;
  assert.equal(route._steps[0]._structuredManeuver, '우회전');
  assert.equal(route._steps[0]._geometryManeuver, '좌회전');
  assert.equal(route._steps[0]._maneuverConflict, true);
  assert.equal(vm.runInContext('navigationInstruction(testSteps,0)', context), '좌회전');
});

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

test('live results show distance without changing the current input focus', () => {
  const { context } = loadApp();
  const input = context.document.querySelector('#searchInput');
  input.focus();
  vm.runInContext("renderLive([{name:'장소',category:'카테고리',address:'주소',distance:850}])", context);
  assert.match(context.document.querySelector('#liveResults').innerHTML, /850m/);
  assert.equal(input.blurred, false);
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
  assert.equal(vm.runInContext("state.routeEndpointMarkers[1].content.style.width", context), '20px');
  vm.runInContext('state.map.setLevel(1);state.map.setLevel(7)', context);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '40px');
  assert.equal(vm.runInContext("state.routeEndpointMarkers[1].content.style.width", context), '20px');
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
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '20px');
  vm.runInContext('state.map.setLevel(1);state.map.setLevel(7)', context);
  assert.equal(vm.runInContext("state.routeEndpointMarkers[0].content.style.width", context), '20px');
});

test('navigation start discards stale speed and starts at the stopped level', () => {
  const { context } = loadApp();
  vm.runInContext(`
    state.routes=[{_steps:[]}];state.selectedRoute=0;state.routeLines=[null];state.currentLocation=null;
    state.nav.currentSpeed=40/3.6;state.map={setLevel(level){this.level=level}};
    renderScreen=()=>{state.screen='navigation'};clearSearchMarkers=()=>{};drawNavigationRoute=()=>{};
    setGpsMarker=()=>{};startWatch=()=>{};updateNavHud=()=>{};toast=()=>{};
    startNavigation();
  `, context);
  assert.equal(vm.runInContext('state.map.level', context), 2);
  assert.equal(vm.runInContext('state.nav.currentSpeed', context), 0);
});

test('map interaction stays unfollowed until ten seconds then returns at current speed', () => {
  const { context, advance } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof beginNavigationMapInteraction', context), 'function');
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=true;state.nav.currentSpeed=40/3.6;state.currentLocation=null;state.map={setLevel(level){this.level=level}};beginNavigationMapInteraction();endNavigationMapInteraction()", context);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(9999);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(1);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
  assert.equal(vm.runInContext('state.map.level', context), 3);
});

test('another interaction resets the single return timer', () => {
  const { context, advance, hasTimer } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof beginNavigationMapInteraction', context), 'function');
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=true;state.currentLocation=null;state.map={setLevel(level){this.level=level}};beginNavigationMapInteraction();endNavigationMapInteraction()", context);
  const firstTimer = vm.runInContext('navReturnTimer', context);
  advance(8000);
  vm.runInContext('beginNavigationMapInteraction();endNavigationMapInteraction()', context);
  const secondTimer = vm.runInContext('navReturnTimer', context);
  assert.notEqual(secondTimer, firstTimer);
  assert.equal(hasTimer(firstTimer), false);
  assert.equal(hasTimer(secondTimer), true);
  advance(2000);
  assert.equal(vm.runInContext('state.nav.follow', context), false);
  advance(8000);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
});

test('current-location button cancels the timer and immediately restores speed zoom', () => {
  const { context, hasTimer } = loadApp({ manualTimers: true });
  assert.equal(vm.runInContext('typeof endNavigationMapInteraction', context), 'function');
  vm.runInContext("state.screen='navigation';state.nav.follow=false;state.nav.currentSpeed=65/3.6;state.currentLocation=null;state.map={setLevel(level){this.level=level}};endNavigationMapInteraction()", context);
  const timer = vm.runInContext('navReturnTimer', context);
  vm.runInContext("$('#navLocateBtn').onclick()", context);
  assert.equal(vm.runInContext('state.nav.follow', context), true);
  assert.equal(vm.runInContext('state.map.level', context), 4);
  assert.equal(vm.runInContext('navReturnTimer', context), null);
  assert.equal(hasTimer(timer), false);
});

test('current-location button restores navigation zoom, follow and forward offset while stopped', () => {
  const { context } = loadApp();
  const result=vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestPoint {constructor(x,y){this.x=x;this.y=y}}
    kakao={maps:{LatLng:TestLatLng,Point:TestPoint}};
    state.screen='navigation';state.nav.follow=false;state.nav.currentSpeed=0;state.currentLocation={latitude:37,longitude:127};
    state.routes=[{_points:[state.currentLocation,{latitude:37.001,longitude:127}]}];state.selectedRoute=0;
    state.map={setLevel(level){this.level=level},getProjection:()=>({pointFromCoords:()=>({x:500,y:500}),coordsFromPoint:point=>({x:point.x,y:point.y})}),panTo(target){this.target=target}};
    $('#navLocateBtn').onclick();({level:state.map.level,follow:state.nav.follow,target:state.map.target});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{level:2,follow:true,target:{x:500,y:390}});
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

test('stationary plausible GPS speed remains live but does not pollute authoritative max speed', () => {
  const result = runGpsSamples([
    {timestamp:1000,latitude:37.5,longitude:127,speed:0,accuracy:20},
    {timestamp:2000,latitude:37.50002,longitude:127,speed:13/3.6,accuracy:20},
    {timestamp:3000,latitude:37.499985,longitude:127,speed:16/3.6,accuracy:20},
    {timestamp:4000,latitude:37.50001,longitude:127,speed:4/3.6,accuracy:20},
  ]);
  assert.ok(result.currentSpeed * 3.6 >= 3 && result.currentSpeed * 3.6 <= 5);
  assert.equal(result.maxSpeed, 0);
});

test('real 3-5km/h low-speed movement is eventually recognized', () => {
  const result = runGpsSamples(Array.from({length:6},(_,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.00001,longitude:127,speed:4/3.6,accuracy:5})));
  assert.ok(result.currentSpeed*3.6>=3&&result.currentSpeed*3.6<=5);
});

test('good-accuracy one-direction stationary drift does not start movement or add distance', () => {
  const result = runGpsSamples(Array.from({length:14},(_,i)=>({
    timestamp:(i+1)*1000,
    latitude:37.5+i*.000004,
    longitude:127,
    speed:4/3.6,
    accuracy:5,
  })));
  assert.ok(result.currentSpeed*3.6>=3&&result.currentSpeed*3.6<=5);
  assert.equal(result.speedMoving, false);
  assert.equal(result.distance, 0);
});

test('confirmed 4km/h movement records speed and distance after enough evidence', () => {
  const result = runGpsSamples(Array.from({length:14},(_,i)=>({
    timestamp:(i+1)*1000,
    latitude:37.5+i*.00001,
    longitude:127,
    speed:4/3.6,
    accuracy:5,
  })));
  assert.ok(result.currentSpeed*3.6>=3&&result.currentSpeed*3.6<=5);
  assert.equal(result.speedMoving, true);
  assert.ok(result.distance>5);
});

test('stationary drift followed by riding becomes moving within a few fixes', () => {
  const samples=[];
  let latitude=37.5;
  for(let i=0;i<8;i++){
    samples.push({timestamp:(i+1)*1000,latitude,longitude:127,speed:4/3.6,accuracy:5});
    latitude+=.000004;
  }
  for(let i=8;i<18;i++){
    latitude+=.000045;
    samples.push({timestamp:(i+1)*1000,latitude,longitude:127,speed:18/3.6,accuracy:5});
  }
  const result=runGpsSamples(samples);
  assert.equal(result.speedMoving,true);
  assert.ok(result.currentSpeed*3.6>=16&&result.currentSpeed*3.6<=20);
  assert.ok(result.distance>10);
});

test('riding followed by coherent stationary drift settles at zero without drift distance', () => {
  const samples=[];
  let latitude=37.5;
  for(let i=0;i<10;i++){samples.push({timestamp:(i+1)*1000,latitude,longitude:127,speed:18/3.6,accuracy:5});latitude+=.000045}
  for(let i=10;i<32;i++){latitude+=.000006;samples.push({timestamp:(i+1)*1000,latitude,longitude:127,speed:4/3.6,accuracy:5})}
  const result=runGpsSamples(samples);
  assert.ok(result.currentSpeed*3.6>=3&&result.currentSpeed*3.6<=5);
  assert.equal(result.speedMoving,false);
  assert.ok(result.distance>0);
});

test('pause resume and navigation watch re-entry reset Navigation live speed without duplicate motion state', () => {
  const {context}=loadApp();
  vm.runInContext(`
    navigator.geolocation.watchPosition=callback=>{testGpsCallback=callback;return ++testWatchId};
    navigator.geolocation.clearWatch=()=>{};
    testWatchId=0;
    state.nav.currentSpeed=5;
    state.nav.lastPos={latitude:37.5,longitude:127};state.nav.lastTimestamp=1000;
    startWatch();
    watchReset={speed:state.nav.currentSpeed,lastPos:state.nav.lastPos,hasDuplicateMotion:'motion' in state.nav};
    state.nav.currentSpeed=4;
    setNavigationPaused(true,2000);
    setNavigationPaused(false,3000);
    resumeReset={speed:state.nav.currentSpeed,lastPos:state.nav.lastPos,hasDuplicateMotion:'motion' in state.nav};
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('watchReset',context))),{speed:0,lastPos:null,hasDuplicateMotion:false});
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('resumeReset',context))),{speed:0,lastPos:null,hasDuplicateMotion:false});
});

test('a new navigation never carries the previous displayed speed', () => {
  const {context}=loadApp();
  vm.runInContext(`
    state.routes=[{_steps:[]}];state.selectedRoute=0;state.routeLines=[null];
    state.nav.currentSpeed=40/3.6;state.map={setLevel(){}};
    renderScreen=()=>{state.screen='navigation'};clearSearchMarkers=()=>{};drawNavigationRoute=()=>{};
    setGpsMarker=()=>{};startWatch=()=>{};updateNavHud=()=>{};toast=()=>{};followNavigationPosition=()=>{};
    startNavigation();
  `,context);
  assert.equal(vm.runInContext('state.nav.currentSpeed',context),0);
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

test('stationary GPS drift gets one initial FAST camera placement without repeated overlap', () => {
  const result = runGpsSamples([
    {timestamp:1000,latitude:37.5,longitude:127,speed:0,accuracy:20},
    {timestamp:2000,latitude:37.50002,longitude:127,speed:13/3.6,accuracy:20},
    {timestamp:3000,latitude:37.499985,longitude:127,speed:16/3.6,accuracy:20},
  ]);
  assert.equal(result.followCalls, 1);
});

test('confirmed movement keeps navigation camera follow active', () => {
  const result = runGpsSamples(Array.from({length:6},(_,i)=>({timestamp:(i+1)*1000,latitude:37.5+i*.000045,longitude:127,speed:18/3.6,accuracy:5})));
  assert.ok(result.followCalls>0);
});

test('one usable FAST fix updates Navigation speed and marker before Ride movement confirmation', () => {
  const result = runGpsSamples([{timestamp:1000,latitude:37.5,longitude:127,speed:8,accuracy:3}]);
  assert.equal(result.currentSpeed, 8);
  assert.equal(result.speedMoving, false);
  assert.equal(result.markerPositions.at(-1).latitude, 37.5);
});

test('automatic camera follow uses FAST quality and has no nav.speedMoving dependency', () => {
  const { context } = loadApp();
  const result = vm.runInContext(`(()=>{
    const position={latitude:37.5,longitude:127};
    state.nav.follow=true;state.nav.paused=false;state.nav.cameraMoving=false;delete state.nav.speedMoving;
    state.nav.fastObservation={timestamp:1000,receivedAt:1000,position:{...position,accuracy:3},speed:{mps:5,source:'gps',valid:true},heading:{degrees:90,source:'gps'},quality:{fresh:true,monotonic:true,plausiblePosition:true}};
    return shouldUpdateNavigationCamera(position,3,1000,state.nav.fastObservation);
  })()`,context);
  assert.equal(result,true);
});

test('camera keeps following FAST position while a reroute request is pending', () => {
  const { context } = loadApp();
  vm.runInContext(`
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    state.nav.follow=true;state.nav.recalculating=true;state.nav.cameraMoving=false;
    state.nav.fastObservation={timestamp:1000,receivedAt:1000,position:{latitude:37.5,longitude:127,accuracy:3},speed:{mps:5,source:'gps',valid:true},heading:{degrees:90,source:'gps'},quality:{fresh:true,monotonic:true,plausiblePosition:true}};
    state.map={panTo(){this.panCalls=(this.panCalls||0)+1}};
    followNavigationPosition(state.nav.fastObservation.position,false,3,1000,false,state.nav.fastObservation);
  `,context);
  assert.equal(vm.runInContext('state.map.panCalls||0',context),1);
});

test('unsafe viewport position forces camera catch-up despite normal displacement threshold', () => {
  const { context } = loadApp();
  const result = vm.runInContext(`(()=>{
    const sw={getLat:()=>0,getLng:()=>0},ne={getLat:()=>1,getLng:()=>1};
    const position={latitude:.05,longitude:.5};
    state.map={getBounds:()=>({getSouthWest:()=>sw,getNorthEast:()=>ne})};
    state.nav.follow=true;state.nav.paused=false;state.nav.cameraMoving=false;
    state.nav.lastCameraPos={latitude:.050001,longitude:.5};state.nav.lastCameraAt=950;
    const fast={timestamp:1000,receivedAt:1000,position:{...position,accuracy:3},speed:{mps:1,source:'gps',valid:true},heading:{degrees:0,source:'gps'},quality:{fresh:true,monotonic:true,plausiblePosition:true}};
    return {safe:isNavigationPositionInSafeRegion(position),update:shouldUpdateNavigationCamera(position,3,1000,fast)};
  })()`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{safe:false,update:true});
});

test('programmatic zoom events cannot start the manual ten-second suppression window', () => {
  const { context, advance } = loadApp({ manualTimers: true });
  vm.runInContext(`
    state.screen='navigation';state.nav.follow=true;
    state.map={setLevel(){}};
    setNavigationLevel(2);
  `,context);
  advance(1);
  vm.runInContext('handleMapZoomStart();handleMapZoomChanged()',context);
  assert.equal(vm.runInContext('state.nav.follow',context),true);
});

test('off-route reroute requires exactly three qualifying FAST fixes and respects accuracy allowance', () => {
  const { context } = loadApp();
  const result = vm.runInContext(`(()=>{
    const route={totalDistance:1112,totalTime:600,_points:[{latitude:0,longitude:0},{latitude:0,longitude:.01}],_steps:[]};
    state.routes=[route];state.selectedRoute=0;state.nav.steps=[];state.nav.startedAt=null;state.destination={latitude:1,longitude:1};
    state.routeLines=[null];let calls=0;recalculateNavigationRoute=()=>{calls++};
    const point={latitude:30/111195,longitude:.005};
    updateNavHud(point,25);updateNavHud(point,25);updateNavHud(point,25);
    const poorAccuracyCalls=calls;
    updateNavHud(point,3);const afterOne=calls;updateNavHud(point,3);const afterTwo=calls;updateNavHud(point,3);const afterThree=calls;
    return {poorAccuracyCalls,afterOne,afterTwo,afterThree};
  })()`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{poorAccuracyCalls:0,afterOne:0,afterTwo:0,afterThree:1});
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
    { width:390, height: 700, bottom: 80 },
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
  const padding = JSON.parse(vm.runInContext('JSON.stringify(routeFitPadding(390,800,0,{bottom:118,right:390},610))', context));
  assert.deepEqual(padding, { top: 130, right: 24, bottom: 202, left: 24 });
  const offsetPadding = JSON.parse(vm.runInContext('JSON.stringify(routeFitPadding(390,800,20,{bottom:118,right:390},610))', context));
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
  assert.equal(vm.runInContext('state.map.bounds.points.length', context), 2);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.map.padding)', context)), [130,24,202,24]);
  assert.equal(vm.runInContext('typeof syncRouteViewport', context), 'function');
  vm.runInContext("let testRefits=0;fitSelectedRoute=()=>{testRefits++};state.screen='route';syncRouteViewport()", context);
  assert.equal(vm.runInContext('testRefits', context), 1);
});

test('route overview refits when route card selection changes', () => {
  const { context }=loadApp();
  const result=vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestBounds {constructor(){this.points=[]}extend(point){this.points.push(point)}isEmpty(){return !this.points.length}}
    class TestPolyline {constructor(options){this.options={...options}}setMap(map){this.map=map}setOptions(options){Object.assign(this.options,options)}}
    class TestOverlay {constructor(options){Object.assign(this,options)}setMap(map){this.map=map}}
    kakao={maps:{LatLng:TestLatLng,LatLngBounds:TestBounds,Polyline:TestPolyline,CustomOverlay:TestOverlay}};
    $('#routeEditor').getBoundingClientRect=()=>({bottom:120});$('#routeCards').getBoundingClientRect=()=>({top:600});$('#startNavBtn').getBoundingClientRect=()=>({top:720});
    state.departure={name:'Start',latitude:37,longitude:127};state.destination={name:'End',latitude:37.03,longitude:127.03};
    state.routes=[
      {label:'Bike',_points:[state.departure,{latitude:37.01,longitude:127.01},state.destination]},
      {label:'Short',_points:[state.departure,{latitude:37.02,longitude:127.04},state.destination]},
      {label:'Comfort',_points:[state.departure,{latitude:37.025,longitude:126.99},state.destination]}
    ];state.selectedRoute=0;
    testCamera={bounds:0,levels:0,centers:0,pans:0};state.map={setBounds(){testCamera.bounds++},setLevel(){testCamera.levels++},setCenter(){testCamera.centers++},panTo(){testCamera.pans++}};
    drawRoutes();const afterFit={...testCamera};selectRoute(1);selectRoute(2);selectRoute(0);
    ({afterFit,afterCards:testCamera,colors:state.routeLines.map(line=>line.options.strokeColor),weights:state.routeLines.map(line=>line.options.strokeWeight)});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    afterFit:{bounds:1,levels:0,centers:0,pans:0},afterCards:{bounds:4,levels:0,centers:0,pans:0},
    colors:['#0878f9','#98a7b8','#98a7b8'],weights:[8,5,5]
  });
});

test('navigation camera zooms one level wider and offsets opposite every route direction', () => {
  const { context }=loadApp();
  const result=vm.runInContext(`
    class TestLatLng {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
    class TestPoint {constructor(x,y){this.x=x;this.y=y}}
    kakao={maps:{LatLng:TestLatLng,Point:TestPoint}};
    testLevels=[];state.map={setLevel(level){testLevels.push(level)},getProjection:()=>({pointFromCoords:()=>({x:500,y:500}),coordsFromPoint:point=>({x:Math.round(point.x),y:Math.round(point.y)})})};
    state.nav.currentSpeed=0;setNavigationZoom();
    const p={latitude:37.5,longitude:127};
    ({level:testLevels[0],north:navigationCameraTarget(p,0),east:navigationCameraTarget(p,90),south:navigationCameraTarget(p,180),west:navigationCameraTarget(p,270),diagonal:navigationCameraTarget(p,45)});
  `,context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    level:2,north:{x:500,y:390},east:{x:610,y:500},south:{x:500,y:610},west:{x:390,y:500},diagonal:{x:578,y:422}
  });
});

test('navigation route heading uses future geometry and ignores small direction noise', () => {
  const { context }=loadApp();
  const result=vm.runInContext(`
    const p={latitude:37,longitude:127};state.nav.cameraHeading=null;
    const north=[p,{latitude:37.001,longitude:127},{latitude:37.002,longitude:127.0001}];
    const first=navigationRouteHeading(p,north);const stable=navigationRouteHeading(p,[p,{latitude:37.001,longitude:127.0001},{latitude:37.002,longitude:127.0002}]);
    const east=navigationRouteHeading(p,[p,{latitude:37,longitude:127.001},{latitude:37,longitude:127.002}]);
    ({first,stable,east});
  `,context);
  assert.ok(result.first<5||result.first>355);
  assert.equal(result.stable,result.first);
  assert.ok(result.east>80&&result.east<100);
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

test('route performance reports every requested browser and Kakao timing in console only', async () => {
  const { context, routeLogs } = loadApp();
  context.testResponse = {
    routes: [{routeMode:'BIKE_ONLY'}],
    performance: {
      receivedAt: 0,
      modes: {
        BIKE_ONLY: {startMs:0,endMs:11,durationMs:11},
        SHORTEST: {startMs:1,endMs:14,durationMs:13},
        ACCESSIBLE: {startMs:1,endMs:17,durationMs:16},
      },
      kakaoWaitingMs: 17, serverProcessingMs: 1,
      responseReadyMs: 18, serverTotalMs: 18, execution: 'parallel',
    },
  };
  await vm.runInContext(`
    state.departure={name:'서울',latitude:37.5665,longitude:126.978};
    state.destination={name:'부산',latitude:35.1796,longitude:129.0756};
    state.waypoints=[];
    fetch=async()=>({ok:true,json:async()=>testResponse});
    clearRoutes=()=>{};renderScreen=()=>{};updateRouteFields=()=>{};clearSearchMarkers=()=>{};
    prepareRoutes=routes=>routes.map(route=>({...route,_points:[{latitude:37.5,longitude:127}],_steps:[]}));
    drawRoutes=()=>{};renderRouteCards=()=>{};
    loadRoutes();
  `, context);
  const output = routeLogs.join('\n');
  for (const label of ['[Route Performance]','Route:','Straight distance','BIKE_ONLY Kakao','SHORTEST Kakao','ACCESSIBLE Kakao','Kakao waiting total','Server processing','Network/API total','Frontend processing','Map rendering','TOTAL','Largest share']) {
    assert.match(output, new RegExp(label.replace(/[\[\]]/g, '\\$&')));
  }
  const record = JSON.parse(vm.runInContext('JSON.stringify(window.__rideMateRoutePerformance.at(-1))', context));
  assert.equal(record.server.execution, 'parallel');
  assert.ok(record.straightDistanceM > 300000 && record.straightDistanceM < 400000);
  assert.equal(typeof record.summary.largest.label, 'string');
  assert.equal(Number.isFinite(record.summary.largest.durationMs), true);
  assert.equal(Number.isFinite(record.summary.largest.percent), true);
  assert.ok(record.apiRequestStart >= record.routeSearchStart);
  assert.ok(record.browserResponseReceived >= record.apiRequestStart);
  assert.ok(record.processingComplete >= record.browserResponseReceived);
  assert.ok(record.mapRenderingComplete >= record.processingComplete);
  assert.doesNotMatch(fs.readFileSync('index.html','utf8'), /Route Performance|routePerformance/);
});

test('route performance identifies the largest non-overlapping share of TOTAL', () => {
  const { context, routeLogs } = loadApp();
  vm.runInContext(`reportRoutePerformance({
    type:'initial', origin:'Seoul', destination:'Busan', straightDistanceM:325000,
    routeSearchStart:0, apiRequestStart:5, browserResponseReceived:105,
    processingComplete:125, mapRenderingComplete:135,
    server:{
      execution:'parallel', receivedAt:0, kakaoWaitingMs:80, serverProcessingMs:10,
      responseReadyMs:90, serverTotalMs:90,
      modes:{
        BIKE_ONLY:{startMs:1,endMs:71,durationMs:70},
        SHORTEST:{startMs:1,endMs:81,durationMs:80},
        ACCESSIBLE:{startMs:2,endMs:76,durationMs:74}
      }
    }
  })`, context);
  const record = JSON.parse(vm.runInContext('JSON.stringify(window.__rideMateRoutePerformance.at(-1))', context));
  assert.equal(record.summary.largest.label, 'Network/API total');
  assert.equal(record.summary.largest.durationMs, 100);
  assert.ok(Math.abs(record.summary.largest.percent - (100 / 135 * 100)) < 0.01);
  assert.match(routeLogs.join('\n'), /Largest share: Network\/API total: 100\.0 ms \(74\.1%\)/);
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

test('six: camera follow ignores small fixes and coalesces the latest overlapping move', () => {
  const { context, advance } = loadApp({ manualTimers: true });
  vm.runInContext(`
    kakao={maps:{LatLng:class {constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}}};
    state.screen='navigation';state.nav.follow=true;state.nav.fastObservation={position:{latitude:37.5,longitude:127,accuracy:5},quality:{fresh:true,monotonic:true,plausiblePosition:true}};
    state.map={panTo(){this.panCalls=(this.panCalls||0)+1}};
    followNavigationPosition({latitude:37.5,longitude:127},false,5,1000);
    followNavigationPosition({latitude:37.50001,longitude:127},false,5,1100);
    followNavigationPosition({latitude:37.5003,longitude:127},false,5,1200);
  `, context);
  assert.equal(vm.runInContext('state.map.panCalls', context), 1);
  advance(700);
  assert.equal(vm.runInContext('state.map.panCalls', context), 2);
  assert.equal(vm.runInContext('state.nav.pendingCameraFollow', context), null);
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
