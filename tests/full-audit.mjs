import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('app.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const bikeSource = fs.readFileSync(new URL('api/bicycle-route.js', root), 'utf8');
const placeSource = fs.readFileSync(new URL('api/place-search.js', root), 'utf8');
const lines = app.split(/\r?\n/);
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${String(passed + failed).padStart(2, '0')} ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${String(passed + failed).padStart(2, '0')} ${name}: ${error.message}`);
  }
}

function functions(names, context = {}) {
  vm.createContext(context);
  for (const name of names) {
    const line = lines.find(value => value.startsWith(`function ${name}(`) || value.startsWith(`async function ${name}(`));
    assert.ok(line, `${name} missing`);
    vm.runInContext(line, context);
  }
  return context;
}

async function moduleHandler(source) {
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`)).default;
}

function response() {
  const output = { status: null, body: null };
  return { output, res: { status(code) { output.status = code; return this; }, json(body) { output.body = body; return this; } } };
}

async function invoke(handler, req) {
  const { output, res } = response();
  await handler(req, res);
  return output;
}

await check('Korean document language remains configured', () => assert.match(html, /<html lang="ko">/));
await check('mobile viewport remains configured', () => assert.match(html, /width=device-width,initial-scale=1,maximum-scale=1/));
await check('exactly one map container remains', () => assert.equal((html.match(/id="map"/g) || []).length, 1));
await check('existing stylesheet path remains', () => assert.match(html, /href="\/styles\.css(?:\?[^"\s]*)?"/));
await check('existing app script path remains', () => assert.match(html, /src="\/app\.js(?:\?[^"\s]*)?"/));
await check('search panel remains in the SPA', () => assert.match(html, /id="searchPanel"/));
await check('route editor remains in the SPA', () => assert.match(html, /id="routeEditor"/));
await check('result sheet remains in the SPA', () => assert.match(html, /id="sheet"/));
await check('navigation overlay remains in the SPA', () => assert.match(html, /id="navOverlay"/));
await check('the live map is constructed once independently of record preview', () => assert.equal((app.match(/state\.map=new kakao\.maps\.Map\(/g) || []).length, 1));
await check('Kakao configuration still comes from the existing API', () => assert.match(app, /fetch\('\/api\/config'\)/));
await check('bicycle endpoint is unchanged', () => assert.match(bikeSource, /https:\/\/dapi\.kakao\.com\/v2\/routing\/bicycle/));
await check('three route modes are unchanged', () => assert.match(bikeSource, /\[\['BIKE_ONLY'.*\['SHORTEST'.*\['ACCESSIBLE'/s));
await check('SPA history still uses pushState and popstate', () => { assert.match(app, /history\.pushState/); assert.match(app, /addEventListener\('popstate'/); });
await check('initial current-location acquisition remains', () => assert.match(app, /geolocation\.getCurrentPosition/));
await check('ride storage is routed through the active profile repository', () => assert.match(app, /profileRepository\.prependRide\(activeProfileId/));

await check('HTML escaping still covers unsafe characters', () => {
  const { esc } = functions(['esc']);
  assert.equal(esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});
await check('minute formatting remains correct', () => {
  const { fmtMin } = functions(['fmtMin']);
  assert.equal(fmtMin(120), '2분');
});
await check('haversine distance remains plausible', () => {
  const { hav } = functions(['hav']);
  const distance = hav({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
  assert.ok(distance > 111000 && distance < 112000);
});
await check('exact place name ranks first', () => {
  const c = functions(['normalize', 'isTransit', 'rankPlaces']);
  const result = c.rankPlaces([{ name: '강남역 맛집', category: '음식점' }, { name: '강남역', category: '장소' }], '강남역');
  assert.equal(result[0].name, '강남역');
});
await check('transit station category receives station priority', () => {
  const c = functions(['normalize', 'isTransit', 'rankPlaces']);
  const result = c.rankPlaces([{ name: '서울역점', category: '음식점' }, { name: '서울역', category: '지하철역' }], '서울역');
  assert.equal(result[0].category, '지하철역');
});
await check('official Kakao points geometry extracts', () => {
  const { extractPoints } = functions(['extractPoints']);
  assert.equal(extractPoints({ legs: [{ steps: [{ path: { points: [[127.1, 37.1], [127.2, 37.2]] } }] }] }).length, 2);
});
await check('nested coordinates geometry extracts', () => {
  const { extractPoints } = functions(['extractPoints']);
  assert.equal(extractPoints({ coordinates: [[127.1, 37.1], [127.2, 37.2]] }).length, 2);
});
await check('invalid geometry coordinates are rejected', () => {
  const { extractPoints } = functions(['extractPoints']);
  assert.deepEqual(JSON.parse(JSON.stringify(extractPoints({ points: [[200, 95]] }))), []);
});
await check('adjacent duplicate geometry points are removed', () => {
  const { extractPoints } = functions(['extractPoints']);
  assert.equal(extractPoints({ points: [[127.1, 37.1], [127.1, 37.1]] }).length, 1);
});
await check('navigation progress uses cumulative distance', () => {
  const c = functions(['hav', 'bearing', 'projectOnRoute']);
  const p = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 }, { latitude: 0, longitude: 1 }];
  const projection = c.projectOnRoute(p, p[1]);
  const firstSegment = c.hav(p[0], p[1]);
  const total = c.hav(p[0], p[1]) + c.hav(p[1], p[2]);
  assert.ok(Math.abs(projection.alongDistance - firstSegment) < 1e-6);
  assert.ok(Math.abs(projection.totalDistance - total) < 1e-6);
  assert.ok(Math.abs(projection.progress - firstSegment / total) < 1e-9);
});
await check('navigation progress handles missing positions', () => {
  const c = functions(['hav', 'bearing', 'projectOnRoute']);
  const projection = c.projectOnRoute([], null);
  assert.equal(projection.progress, 0);
  assert.equal(projection.alongDistance, 0);
  assert.equal(projection.totalDistance, 0);
  assert.equal(projection.offRouteDistance, Infinity);
});
await check('history restores result content', () => {
  const calls = [];
  const state = { searchResults: [1], searchQuery: 'q', selectedPlace: null };
  const c = functions(['restoreScreen'], { state, renderScreen() {}, clearRoutes() {}, showMarkers() {}, renderResultsContent: (...args) => calls.push(args), renderPlaceContent() {}, kakao: { maps: {} } });
  c.restoreScreen('results');
  assert.deepEqual(calls[0], [[1], 'q']);
});
await check('search cancellation aborts and invalidates requests', () => {
  let aborted = false;
  const state = { searchSeq: 1, searchController: { abort() { aborted = true; } } };
  const { cancelSearch } = functions(['cancelSearch'], { state });
  cancelSearch();
  assert.equal(aborted && state.searchSeq === 2 && state.searchController === null, true);
});

const bike = await moduleHandler(bikeSource);
const place = await moduleHandler(placeSource);
const originalFetch = globalThis.fetch;
const originalRestKey = process.env.KAKAO_REST_API_KEY;

await check('bicycle API rejects non-GET methods', async () => assert.equal((await invoke(bike, { method: 'POST', query: {} })).status, 405));
await check('bicycle API reports a missing REST key', async () => {
  delete process.env.KAKAO_REST_API_KEY;
  assert.equal((await invoke(bike, { method: 'GET', query: {} })).status, 500);
});
process.env.KAKAO_REST_API_KEY = 'test-key';
await check('bicycle API rejects missing coordinates', async () => assert.equal((await invoke(bike, { method: 'GET', query: {} })).status, 400));
await check('bicycle API rejects invalid coordinates', async () => assert.equal((await invoke(bike, { method: 'GET', query: { start_x: 'x', start_y: '37', end_x: '127', end_y: '37' } })).status, 400));
await check('bicycle API keeps successful routes on partial failure', async () => {
  globalThis.fetch = async url => String(url).includes('SHORTEST') ? ({ ok: false, status: 429, json: async () => ({ msg: 'quota' }) }) : ({ ok: true, status: 200, json: async () => ({ route: { properties: { totalDistance: 1, totalTime: 2 }, coordinates: [[127,37],[127.001,37.001]] } }) });
  const out = await invoke(bike, { method: 'GET', query: { start_x: '127', start_y: '37', end_x: '128', end_y: '38' } });
  assert.equal(out.status, 200); assert.equal(out.body.routes.length, 2); assert.equal(out.body.errors.length, 1);
});
await check('bicycle API returns 502 when all upstream HTTP calls fail', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ msg: 'fail' }) });
  assert.equal((await invoke(bike, { method: 'GET', query: { start_x: '127', start_y: '37', end_x: '128', end_y: '38' } })).status, 502);
});
await check('bicycle API returns structured errors on network failure', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  const out = await invoke(bike, { method: 'GET', query: { start_x: '127', start_y: '37', end_x: '128', end_y: '38' } });
  assert.equal(out.status, 502); assert.equal(out.body.details.length, 3);
});
await check('bicycle API handles non-JSON upstream errors', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('non-json'); } });
  assert.equal((await invoke(bike, { method: 'GET', query: { start_x: '127', start_y: '37', end_x: '128', end_y: '38' } })).status, 502);
});

await check('place API rejects non-GET methods', async () => assert.equal((await invoke(place, { method: 'POST', query: {} })).status, 405));
await check('place API reports a missing REST key', async () => {
  delete process.env.KAKAO_REST_API_KEY;
  assert.equal((await invoke(place, { method: 'GET', query: {} })).status, 500);
});
process.env.KAKAO_REST_API_KEY = 'test-key';
await check('place API rejects an empty query', async () => assert.equal((await invoke(place, { method: 'GET', query: {} })).status, 400));
await check('place API rejects invalid size values', async () => assert.equal((await invoke(place, { method: 'GET', query: { query: '서울', size: '-1' } })).status, 400));
await check('place API validates coordinate pairs', async () => assert.equal((await invoke(place, { method: 'GET', query: { query: '서울', x: '127' } })).status, 400));
await check('place API maps and ranks successful results', async () => {
  let requested = '';
  globalThis.fetch = async url => { requested = String(url); return { ok: true, status: 200, json: async () => ({ documents: [{ id: '1', place_name: '서울역 맛집', category_name: '음식점', x: '127.1', y: '37.1' }, { id: '2', place_name: '서울역', category_name: '지하철역', x: '127.2', y: '37.2' }] }) }; };
  const out = await invoke(place, { method: 'GET', query: { query: '서울역', x: '127', y: '37' } });
  assert.equal(out.status, 200); assert.equal(out.body.results[0].id, '2'); assert.equal(out.body.results[0].latitude, 37.2); assert.match(requested, /size=15/);
});
await check('place API handles network and non-JSON upstream failures', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.equal((await invoke(place, { method: 'GET', query: { query: '서울' } })).status, 502);
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('non-json'); } });
  assert.equal((await invoke(place, { method: 'GET', query: { query: '서울' } })).status, 502);
});

globalThis.fetch = originalFetch;
if (originalRestKey === undefined) delete process.env.KAKAO_REST_API_KEY;
else process.env.KAKAO_REST_API_KEY = originalRestKey;

console.log(`SUMMARY ${passed} PASS, ${failed} FAIL, ${passed + failed} TOTAL`);
if (failed) process.exitCode = 1;
