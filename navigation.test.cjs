const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
      addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return makeElement(); },
      setPointerCapture() {}, focus() {}, offsetHeight: 600, value: '', innerHTML: '', textContent: '',
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
    setTimeout: fn => { if (typeof fn === 'function') fn(); return 1; }, clearTimeout() {},
    innerHeight: 800, history: { pushState() {}, back() {} },
    navigator: { geolocation: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } },
    fetch: async () => ({ json: async () => ({ error: 'test' }), ok: false }),
  });
  context.window = { addEventListener() {}, visualViewport: null };
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });
  return { context, localStorage };
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
