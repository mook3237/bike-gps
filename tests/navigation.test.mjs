import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('app.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const css = fs.readFileSync(new URL('styles.css', root), 'utf8');
const api = fs.readFileSync(new URL('api/bicycle-route.js', root), 'utf8');
const lines = app.split(/\r?\n/);

function loadFunctions(names, context = {}) {
  vm.createContext(context);
  for (const name of names) {
    const line = lines.find(value => value.startsWith(`function ${name}(`) || value.startsWith(`async function ${name}(`));
    assert.ok(line, `${name} must exist`);
    vm.runInContext(line, context);
  }
  return context;
}

test('Kakao steps retain guidance, coordinates, time, distance and path', () => {
  const c = loadFunctions(['hav', 'extractPoints', 'extractNavigationSteps']);
  const steps = c.extractNavigationSteps({ legs: [{ steps: [{ properties: { guidance: '우회전', distance: 76, time: 12, x: 127.1, y: 37.1 }, path: { points: [[127.1, 37.1], [127.2, 37.2]] } }] }] });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].guidance, '우회전');
  assert.equal(steps[0].distance, 76);
  assert.equal(steps[0].time, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(steps[0].point)), { latitude: 37.1, longitude: 127.1 });
  assert.equal(steps[0].points.length, 2);
});

test('route projection reports distance along route and off-route distance', () => {
  const c = loadFunctions(['hav', 'bearing', 'projectOnRoute']);
  const route = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }];
  const result = c.projectOnRoute(route, { latitude: 0.01, longitude: 0.5 });
  assert.ok(Math.abs(result.progress - 0.5) < 0.001);
  assert.ok(result.offRouteDistance > 1100 && result.offRouteDistance < 1120);
});

test('turn direction falls back to path angle only when guidance has no turn', () => {
  const c = loadFunctions(['bearing', 'navigationInstruction']);
  const steps = [
    { guidance: '100m 이동', points: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }] },
    { guidance: '계속 이동', points: [{ latitude: 0, longitude: 1 }, { latitude: 1, longitude: 1 }] },
  ];
  assert.match(c.navigationInstruction(steps, 0), /좌회전/);
  steps[0].guidance = '우회전 후 이동';
  assert.equal(c.navigationInstruction(steps, 0), '우회전 후 이동');
});

test('GPS speed is preferred and distance/time is the fallback', () => {
  const { resolveSpeed } = loadFunctions(['resolveSpeed']);
  assert.equal(resolveSpeed({ speed: 5 }, 100, 10000), 5);
  assert.equal(resolveSpeed({ speed: null }, 100, 10000), 10);
  assert.equal(resolveSpeed({ speed: null }, 0, 0), 0);
});

test('active riding time excludes paused duration', () => {
  const state = { nav: { startedAt: 1000, pausedDuration: 2000, pausedAt: null } };
  const { activeRideDuration } = loadFunctions(['activeRideDuration'], { state });
  assert.equal(activeRideDuration(10000), 7000);
  state.nav.pausedAt = 8000;
  assert.equal(activeRideDuration(10000), 5000);
});

test('off-route thresholds and cooldown are adjustable constants', () => {
  assert.match(app, /OFF_ROUTE_DISTANCE_M\s*:/);
  assert.match(app, /OFF_ROUTE_CONSECUTIVE_FIXES\s*:/);
  assert.match(app, /REROUTE_COOLDOWN_MS\s*:/);
  assert.match(app, /async function recalculateNavigationRoute\(/);
  assert.doesNotMatch(app, /recalculateNavigationRoute[\s\S]{0,500}renderScreen\('route'/);
});

test('Navigation has dedicated guidance, speed, follow, reroute and toggle controls', () => {
  for (const id of ['nextTurnText', 'speedText', 'navLocateBtn', 'navRecalcBtn', 'navInfoToggle', 'navPrimaryLabel', 'navPrimaryValue']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /navigation-active/);
  assert.match(app, /dragstart/);
});

test('Navigation viewport uses dynamic viewport and safe areas', () => {
  assert.match(css, /100dvh/);
  assert.match(css, /--nav-height/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(app, /visualViewport/);
});

test('Navigation marker is a heading arrow and saved summary includes speed metrics', () => {
  assert.match(css, /\.gps-arrow/);
  assert.match(app, /averageSpeed/);
  assert.match(app, /maxSpeed/);
  assert.match(html, /id="summaryAverageSpeed"/);
  assert.match(html, /id="summaryMaxSpeed"/);
});

test('Kakao bicycle contract and the single-map architecture stay unchanged', () => {
  assert.match(api, /https:\/\/dapi\.kakao\.com\/v2\/routing\/bicycle/);
  assert.match(api, /\[\['BIKE_ONLY'.*\['SHORTEST'.*\['ACCESSIBLE'/s);
  assert.equal((app.match(/new kakao\.maps\.Map\(/g) || []).length, 1);
});

test('Navigation JavaScript references existing Navigation DOM elements', () => {
  const ids = [...app.matchAll(/\$\('#(nav\w+|turn\w+|nextTurnText|speedText|remainDistance|summary\w+)'\)/g)].map(match => match[1]);
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), `${id} must exist`);
});
