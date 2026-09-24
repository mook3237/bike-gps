import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const appSource = fs.readFileSync(new URL('app.js', root), 'utf8');
const appLines = appSource.split(/\r?\n/);

function appFunction(name, context = {}) {
  const line = appLines.find(value => value.startsWith(`function ${name}(`) || value.startsWith(`async function ${name}(`));
  assert.ok(line, `${name} must exist`);
  vm.createContext(context);
  vm.runInContext(line, context);
  return context[name];
}

async function apiHandler(relativePath) {
  const source = fs.readFileSync(new URL(relativePath, root), 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`;
  return (await import(url)).default;
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

test('navigation progress follows cumulative route distance, not vertex index', () => {
  const context = {};
  const hav = appFunction('hav', context);
  appFunction('bearing', context);
  const projectOnRoute = appFunction('projectOnRoute', context);
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.001 },
    { latitude: 0, longitude: 1 },
  ];
  const expected = hav(points[0], points[1]) / hav(points[0], points[2]);
  assert.ok(Math.abs(projectOnRoute(points, points[1]).progress - expected) < 1e-9);
});

test('history restoration rerenders results and place content in the existing SPA', () => {
  const calls = [];
  const context = {
    state: {
      searchResults: [{ name: 'result' }],
      searchQuery: 'query',
      selectedPlace: { name: 'place', latitude: 37, longitude: 127 },
      routes: [{ route: true }],
      selectedRoute: 0,
      routeLines: [{ setMap: value => calls.push(['lineMap', value]), setOptions: value => calls.push(['lineOptions', value]) }],
      currentLocation: { latitude: 37, longitude: 127 },
      nav: { watchId: null },
      map: { panTo: value => calls.push(['panTo', value]) },
    },
    kakao: { maps: { LatLng: function (lat, lng) { return { lat, lng }; } } },
    renderScreen: (...args) => calls.push(['screen', ...args]),
    clearRoutes: () => calls.push(['clearRoutes']),
    clearSearchMarkers: () => calls.push(['clearSearchMarkers']),
    showMarkers: places => calls.push(['markers', places]),
    drawRoutes: () => calls.push(['drawRoutes']),
    renderRouteCards: () => calls.push(['routeCards']),
    startWatch: () => calls.push(['startWatch']),
    updateNavHud: value => calls.push(['navHud', value]),
    renderResultsContent: (...args) => calls.push(['results', ...args]),
    renderPlaceContent: place => calls.push(['place', place]),
  };
  const restoreScreen = appFunction('restoreScreen', context);
  restoreScreen('results');
  restoreScreen('place');
  restoreScreen('route');
  restoreScreen('navigation');
  assert.deepEqual(calls[0], ['screen', 'results', false]);
  assert.equal(calls.some(call => call[0] === 'results'), true);
  assert.equal(calls.some(call => call[0] === 'place'), true);
  assert.equal(calls.some(call => call[0] === 'clearRoutes'), true);
  assert.equal(calls.some(call => call[0] === 'drawRoutes'), true);
  assert.equal(calls.some(call => call[0] === 'routeCards'), true);
  assert.equal(calls.some(call => call[0] === 'startWatch'), true);
  assert.equal(calls.some(call => call[0] === 'navHud'), true);
  assert.match(appSource, /\$\('#routeBack'\)\.onclick=\(\)=>history\.back\(\)/);
  assert.match(appSource, /renderScreen\('results',true,\{places,q\}\)/);
  assert.match(appSource, /renderScreen\('place',true,\{place:p\}\)/);
});

test('popstate cancels pending work and restores entry-specific content', () => {
  const restored = [];
  let cancelled = 0;
  const state = { screen: 'search', routeSeq: 4, nav: { watchId: null }, searchResults: [], searchQuery: '', selectedPlace: null };
  const context = {
    state,
    searchTimer: 1,
    clearTimeout() {},
    cancelSearch: () => { cancelled++; },
    navigator: { geolocation: { clearWatch() {} } },
    restoreScreen: screen => restored.push(screen),
  };
  const handlePopState = appFunction('handlePopState', context);
  const places = [{ name: 'older result' }];
  handlePopState({ state: { screen: 'results', places, q: 'older query' } });
  assert.equal(cancelled, 1);
  assert.equal(state.routeSeq, 5);
  assert.equal(state.searchResults, places);
  assert.equal(state.searchQuery, 'older query');
  assert.deepEqual(restored, ['results']);
});

test('an older failed route request cannot clear a newer successful route', async () => {
  const pending = [];
  const state = { nav: { watchId: null }, routeSeq: 0, routes: [], selectedRoute: null };
  const classList = { add() {}, remove() {} };
  const context = {
    state,
    navigator: { geolocation: { clearWatch() {} } },
    ui: { start: { classList }, routeCards: { innerHTML: '' } },
    clearRoutes() {}, renderScreen() {}, updateRouteFields() {}, clearSearchMarkers() {},
    fetchRoutes: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    extractPoints: () => [{ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 128 }],
    prepareRoutes: routes => routes.map(route => ({ ...route, _points: [{ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 128 }], _steps: [] })),
    drawRoutes() {}, renderRouteCards() {}, esc: value => String(value), toast() {},
  };
  const loadRoutes = appFunction('loadRoutes', context);
  const older = loadRoutes();
  const newer = loadRoutes();
  pending[1].resolve([{ totalDistance: 100, route: {} }]);
  await newer;
  pending[0].reject(new Error('old failure'));
  await older;
  assert.equal(state.routes.length, 1);
  assert.equal(state.selectedRoute, 0);
});

test('cancelSearch aborts the pending search and invalidates its sequence', () => {
  let aborted = false;
  const context = { state: { searchSeq: 7, searchController: { abort() { aborted = true; } } } };
  const cancelSearch = appFunction('cancelSearch', context);
  cancelSearch();
  assert.equal(aborted, true);
  assert.equal(context.state.searchSeq, 8);
  assert.equal(context.state.searchController, null);
  assert.match(appSource, /const q=e\.target\.value\.trim\(\);cancelSearch\(\);if\(!q\)/);
});

test('geometry extraction supports nested coordinates pairs', () => {
  const context = {};
  const extractPoints = appFunction('extractPoints', context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractPoints({ coordinates: [[127.1, 37.1], [127.2, 37.2]] }))),
    [
      { latitude: 37.1, longitude: 127.1 },
      { latitude: 37.2, longitude: 127.2 },
    ],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractPoints({ coordinates: [[-73.9857, 40.7484]] }))),
    [{ latitude: 40.7484, longitude: -73.9857 }],
  );
});

test('bicycle route API turns network failures into a structured 502 response', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const handler = await apiHandler('api/bicycle-route.js');
    const { output, response } = mockResponse();
    await handler({ method: 'GET', query: { start_x: '127', start_y: '37', end_x: '128', end_y: '38' } }, response);
    assert.equal(output.status, 502);
    assert.equal(Array.isArray(output.body.details), true);
    assert.equal(output.body.details.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  }
});

test('six: bicycle route API forwards ordered waypoint coordinates', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ route: { properties: { totalDistance: 10, totalTime: 20 } } }) };
  };
  try {
    const handler = await apiHandler('api/bicycle-route.js');
    const { output, response } = mockResponse();
    await handler({ method: 'GET', query: {
      start_x: '127.1', start_y: '37.1', end_x: '127.4', end_y: '37.4',
      via_x: '127.2,127.3', via_y: '37.2,37.3', v_name: '경유 1,경유 2',
    } }, response);
    assert.equal(output.status, 200);
    assert.equal(urls.length, 3);
    for (const url of urls) {
      const params = new URL(url).searchParams;
      assert.equal(params.get('via_x'), '127.2,127.3');
      assert.equal(params.get('via_y'), '37.2,37.3');
      assert.equal(params.get('v_name'), '경유 1,경유 2');
    }
    const tooMany = mockResponse();
    await handler({ method: 'GET', query: {
      start_x: '127.1', start_y: '37.1', end_x: '127.4', end_y: '37.4',
      via_x: '127.1,127.2,127.3,127.4,127.5,127.6',
      via_y: '37.1,37.2,37.3,37.4,37.5,37.6',
    } }, tooMany.response);
    assert.equal(tooMany.output.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  }
});

test('place search rejects invalid size and handles non-JSON upstream errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-key';
  try {
    const handler = await apiHandler('api/place-search.js');
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ documents: [] }) });
    let result = mockResponse();
    await handler({ method: 'GET', query: { query: '서울', size: '-1' } }, result.response);
    assert.equal(result.output.status, 400);

    globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    result = mockResponse();
    await handler({ method: 'GET', query: { query: '서울' } }, result.response);
    assert.equal(result.output.status, 502);
    assert.equal(typeof result.output.body.error, 'string');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  }
});
