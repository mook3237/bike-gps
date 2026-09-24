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

function loadApp() {
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
      style: { setProperty() {} },
      addEventListener() {},
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
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 1; }, clearTimeout() {},
    history: { pushState() {}, back() {} },
    navigator: { geolocation: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } },
    fetch: async () => ({ ok: false, json: async () => ({ error: 'test' }) }),
  });
  context.window = { addEventListener() {}, visualViewport: null };
  vm.runInContext(appSource, context, { filename: 'app.js' });
  return context;
}

test('map POI hit testing uses a conservative zoom-aware tolerance capped at 16 metres', () => {
  const context = loadApp();
  assert.equal(vm.runInContext('mapPoiClickTolerance(1)', context), 6);
  assert.equal(vm.runInContext('mapPoiClickTolerance(3)', context), 10);
  assert.equal(vm.runInContext('mapPoiClickTolerance(5)', context), 14);
  assert.equal(vm.runInContext('mapPoiClickTolerance(9)', context), 16);
});

test('map POI hit testing selects only the closest place inside the allowed distance', () => {
  const context = loadApp();
  context.candidates = [
    { id: 'far', name: '먼 장소', latitude: 37.50030, longitude: 127 },
    { id: 'near', name: '가까운 장소', latitude: 37.50005, longitude: 127 },
  ];
  assert.equal(vm.runInContext("closestMapPlace({latitude:37.5,longitude:127},candidates,3)?.id", context), 'near');
  assert.equal(vm.runInContext("closestMapPlace({latitude:37.5,longitude:127},[candidates[0]],9)", context), null);
});

test('a map click suppressed by dragging never opens a place', async () => {
  const context = loadApp();
  const result = await vm.runInContext(`
    state.screen='map';
    state.map={getLevel:()=>3};
    state.mapClickBlockedUntil=Date.now()+1000;
    let testLookupCalls=0;
    lookupMapPlaces=async()=>{testLookupCalls++;return [{id:'near',latitude:37.5,longitude:127}]};
    handleMapClick({latLng:{getLat:()=>37.5,getLng:()=>127}})
      .then(place=>({place,lookupCalls:testLookupCalls}));
  `, context);
  assert.equal(result.place, null);
  assert.equal(result.lookupCalls, 0);
});

test('a genuine map click opens only a returned place within tolerance', async () => {
  const context = loadApp();
  const result = await vm.runInContext(`
    state.screen='map';
    state.map={getLevel:()=>3};
    state.mapClickBlockedUntil=0;
    lookupMapPlaces=async()=>[
      {id:'outside',latitude:37.50030,longitude:127},
      {id:'inside',latitude:37.50005,longitude:127}
    ];
    let testOpened=null;
    openPlace=place=>{testOpened=place};
    handleMapClick({latLng:{getLat:()=>37.5,getLng:()=>127}})
      .then(place=>({returned:place?.id,opened:testOpened?.id}));
  `, context);
  assert.equal(result.returned, 'inside');
  assert.equal(result.opened, 'inside');
});

test('coordinate place lookup returns deduplicated nearby Kakao category places without a keyword', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  globalThis.fetch = async url => {
    const category = new URL(url).searchParams.get('category_group_code');
    return {
      ok: true,
      json: async () => ({ documents: category === 'CE7' || category === 'FD6' ? [
        { id: 'cafe', place_name: '카페', category_name: '음식점 > 카페', road_address_name: '서울 주소', y: '37.5', x: '127', distance: '5', phone: '' },
      ] : [] }),
    };
  };
  try {
    const handler = await apiHandler();
    const { output, response } = mockResponse();
    await handler({ method: 'GET', query: { nearby: '1', x: '127', y: '37.5', radius: '20' } }, response);
    assert.equal(output.status, 200);
    assert.equal(output.body.results.length, 1);
    assert.equal(output.body.results[0].id, 'cafe');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  }
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
