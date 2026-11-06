const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = chromeCandidates.find(fs.existsSync);

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return extension === '.html' ? 'text/html; charset=utf-8'
    : extension === '.css' ? 'text/css; charset=utf-8'
      : extension === '.js' ? 'text/javascript; charset=utf-8'
        : extension === '.jpg' ? 'image/jpeg'
          : 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end('not found');
        return;
      }
      response.setHeader('Content-Type', contentType(file));
      response.end(data);
    });
  });
}

function waitForDevtools(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const finish = (error, url) => {
      clearTimeout(timeout);
      child.stderr.removeListener('data', onData);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      if (error) reject(error); else resolve(url);
    };
    const onError = error => finish(new Error(`[BROWSER ENVIRONMENT] Browser spawn failed: ${error.message}`, { cause: error }));
    const onExit = code => finish(new Error(`[BROWSER ENVIRONMENT] Browser exited before DevTools was ready (${code}). ${output}`));
    const timeout = setTimeout(() => finish(new Error(`[BROWSER ENVIRONMENT] DevTools did not start. ${output}`)), 10000);
    const onData = chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        finish(null, match[1]);
      }
    };
    child.stderr.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function connectPage(browserWebSocketUrl) {
  const port = new URL(browserWebSocketUrl).port;
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) }).then(response => response.json());
  const page = pages.find(target => target.type === 'page');
  if (!page) throw new Error('No browser page target was created.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('DevTools WebSocket open timed out')); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); socket.close(); reject(error); }, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('DevTools disconnected')); }
    pending.clear();
  });
  return {
    socket,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools command timed out: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

const kakaoStub = `(() => {
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } getLat() { return this.lat; } getLng() { return this.lng; } }
  class Bounds { extend() {} getSouthWest() { return new LatLng(37.4, 126.8); } getNorthEast() { return new LatLng(37.7, 127.2); } }
  class Map { constructor(node, options) { this.node = node; this.center = options.center; this.level = options.level; } setDraggable() {} setZoomable() {} relayout() {} panTo(point) { this.center = point; } setCenter(point) { this.center = point; } getCenter() { return this.center; } getLevel() { return this.level; } setLevel(level) { this.level = level; } getBounds() { return new Bounds(); } getProjection() { return {}; } }
  class Overlay { constructor(options = {}) { Object.assign(this, options); } setMap(map) { this.map = map; } setPosition(position) { this.position = position; } }
  class Places { categorySearch() {} }
  globalThis.kakao = { maps: { LatLng, LatLngBounds: Bounds, Map, Marker: Overlay, CustomOverlay: Overlay, services: { Places, Status: { OK: 'OK', ZERO_RESULT: 'ZERO' }, SortBy: { DISTANCE: 'DISTANCE' } }, event: { addListener() {} } } };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, error) { error?.(new Error('QA geolocation unavailable')); }, watchPosition() { return 1; }, clearWatch() {} } });
})();`;

function waitForClose(closed, milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    closed.then(() => { clearTimeout(timer); resolve(true); });
  });
}

async function stopBrowser(browser, closed, client) {
  if (!browser?.pid || browser.exitCode !== null || browser.signalCode !== null) return;
  let closeError;
  if (client?.socket.readyState === WebSocket.OPEN) {
    // No response is required: Browser.close closes the DevTools connection too.
    try { client.socket.send(JSON.stringify({ id: 0, method: 'Browser.close' })); }
    catch (error) { closeError = error; }
    if (!closeError && await waitForClose(closed, 5000)) return;
  }
  // This PID came directly from this test's spawn; never kill by browser image name.
  if (process.platform === 'win32') {
    const result = await new Promise((resolve, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); reject(new Error('Browser tree termination timed out')); }, 5000);
      killer.once('error', error => { clearTimeout(timer); reject(error); });
      killer.once('close', code => { clearTimeout(timer); resolve(code); });
    });
    if (result !== 0 && !await waitForClose(closed, 1000)) throw new Error(`Browser tree termination failed (${result})`);
  } else browser.kill('SIGKILL');
  if (!await waitForClose(closed, 5000)) throw new Error('Browser process did not close');
  if (closeError) throw closeError;
}

async function cleanupBrowserTest({ browser, closed, client, server, userDataDir, removeProfile }) {
  const errors = [];
  const attempt = async (stage, action) => {
    try { await action(); } catch (error) { errors.push(new Error(`[BROWSER CLEANUP] ${stage}: ${error.message}`, { cause: error })); }
  };
  await attempt('browser process tree', () => stopBrowser(browser, closed, client));
  await attempt('DevTools socket', () => client?.socket.close());
  await attempt('test server', async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
  });
  if (userDataDir) await attempt('temporary profile', async () => {
    const resolved = path.resolve(userDataDir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ridemate-profile-qa-'))
      throw new Error(`Refusing to remove unexpected profile path: ${resolved}`);
    for (let attempt = 0; ; attempt++) {
      try { removeProfile(resolved); return; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt >= 49) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });
  return errors;
}

async function run({ browserPath = chromePath, check, menuOnly = false, onResources = () => {}, removeProfile = dir => fs.rmSync(dir, { recursive: true, force: true }) } = {}) {
  if (!browserPath) throw new Error('[BROWSER ENVIRONMENT] Browser verification requires Chrome or Edge.');
  const server = createServer();
  let userDataDir, browser, client, closed, bodyError;
  try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ridemate-profile-qa-'));
  try { browser = spawn(browserPath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-gpu',
    '--disable-background-networking',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch (error) { throw new Error(`[BROWSER ENVIRONMENT] Browser spawn failed: ${error.message}`, { cause: error }); }
    closed = new Promise(resolve => browser.once('close', resolve));

    onResources({ server, browser, userDataDir });
    const browserWebSocketUrl = await waitForDevtools(browser);
    client = await connectPage(browserWebSocketUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: kakaoStub });

    async function evaluate(expression) {
      const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.');
      return result.result.value;
    }
    async function ready() {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#profileGrid')`)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Profile screen did not become ready.');
    }
    async function reload() {
      await client.send('Page.reload', { ignoreCache: true });
      await ready();
    }
    async function assertRestoredProfile() {
      const restored = await evaluate(`({
        lastId: profileRepository.readLastActiveProfileId(),
        selectedIds: [...document.querySelectorAll('[data-profile-select].selected')].map(node => node.dataset.profileSelect),
        disabled: document.querySelector('#profileSelectButton').disabled,
        profileVisible: !document.querySelector('#profileScreen').classList.contains('hidden'),
        appHidden: document.querySelector('#app').classList.contains('hidden'),
        activeId: activeProfileId,
        sessionActiveId: profileSession.getActiveProfileId(),
        mapInitialized: state.map !== null
      })`);
      assert.ok(restored.lastId);
      assert.deepEqual(restored.selectedIds, [restored.lastId]);
      assert.equal(restored.disabled, false);
      assert.equal(restored.profileVisible, true);
      assert.equal(restored.appHidden, true);
      assert.equal(restored.activeId, null);
      assert.equal(restored.sessionActiveId, null);
      assert.equal(restored.mapInitialized, false);
      return restored.lastId;
    }
    async function confirmProfile(expectedId) {
      await evaluate(`document.querySelector('#profileSelectButton').click()`);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(`document.querySelector('#profileScreen').classList.contains('hidden')`)) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.deepEqual(await evaluate(`({activeId:activeProfileId, sessionActiveId:profileSession.getActiveProfileId(),
        profileHidden:document.querySelector('#profileScreen').classList.contains('hidden'),
        appVisible:!document.querySelector('#app').classList.contains('hidden'),mapInitialized:state.map!==null,screen:state.screen})`),
      {activeId:expectedId,sessionActiveId:expectedId,profileHidden:true,appVisible:true,mapInitialized:true,screen:'map'});
    }

    await client.send('Page.navigate', { url });
    await ready();
    await evaluate('localStorage.clear()');
    await reload();

    if (check) return await check(evaluate, client);

    const firstBoot = await evaluate(`(async () => {
      const screen = document.querySelector('#profileScreen');
      const hero = document.querySelector('.profile-hero');
      const heroImage = hero.querySelector('img');
      const panel = document.querySelector('.profile-panel');
      const grid = document.querySelector('#profileGrid');
      const selectButton = document.querySelector('#profileSelectButton');
      await heroImage.decode().catch(() => {});
      const heroRect = hero.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const buttonRect = selectButton.getBoundingClientRect();
      return {
        names: [...document.querySelectorAll('[data-profile-select] strong')].map(node => node.textContent),
        selected: document.querySelectorAll('.profile-select-control.selected').length,
        disabled: selectButton.disabled,
        appHidden: document.querySelector('#app').classList.contains('hidden'),
        position: getComputedStyle(screen).position,
        radius: getComputedStyle(panel).borderTopLeftRadius,
        viewport: [innerWidth, innerHeight],
        heroPath: new URL(heroImage.currentSrc).pathname,
        heroStatus: await fetch(heroImage.currentSrc, { cache: 'no-store' }).then(response => response.status),
        heroLoaded: heroImage.complete && heroImage.naturalWidth > 0,
        heroAspectRatio: heroRect.width / heroRect.height,
        heroPanelGap: Math.abs(panelRect.top - heroRect.bottom),
        panelBottom: panelRect.bottom,
        buttonBottom: buttonRect.bottom,
        buttonGridGap: buttonRect.top - gridRect.bottom,
        horizontalOverflow: screen.scrollWidth > screen.clientWidth || document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    assert.deepEqual(firstBoot.names, ['아빠']);
    assert.equal(firstBoot.selected, 0);
    assert.equal(firstBoot.disabled, true);
    assert.equal(firstBoot.appHidden, true);
    assert.equal(firstBoot.position, 'fixed');
    assert.notEqual(firstBoot.radius, '0px');
    assert.deepEqual(firstBoot.viewport, [390, 844]);
    assert.equal(firstBoot.heroPath, '/assets/profile-hero.jpg');
    assert.equal(firstBoot.heroStatus, 200);
    assert.equal(firstBoot.heroLoaded, true);
    assert.ok(firstBoot.heroAspectRatio > 2.35, `hero must crop the fake status bar: ${firstBoot.heroAspectRatio}`);
    assert.ok(firstBoot.heroPanelGap <= 2, `hero and panel must meet without a blank gap: ${firstBoot.heroPanelGap}`);
    assert.ok(firstBoot.panelBottom >= 843, `profile panel must use the full viewport height: ${firstBoot.panelBottom}`);
    assert.ok(firstBoot.buttonGridGap >= 24, `select button needs breathing room below cards: ${firstBoot.buttonGridGap}`);
    assert.ok(firstBoot.buttonBottom >= 760 && firstBoot.buttonBottom <= 810, `select button must sit naturally above the bottom safe area: ${firstBoot.buttonBottom}`);
    assert.equal(firstBoot.horizontalOverflow, false);
    await evaluate(`document.querySelector('[data-profile-manage]').click()`);
    await evaluate(`(() => { const input = document.querySelector('#profileNameInput'); input.value = '메뉴 사용자'; document.querySelector('#profileEditorForm').requestSubmit(); })()`);
    await evaluate(`document.querySelector('[data-profile-select]').click()`);
    assert.equal(await evaluate(`document.querySelector('#profileSelectButton').disabled`), false);
    await evaluate(`document.querySelector('#profileSelectButton').click()`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(`!document.querySelector('#app').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await evaluate(`document.querySelector('#profileScreen').classList.contains('hidden')`), true);
    assert.equal(await evaluate(`document.querySelector('#mapHeader').classList.contains('hidden')`), false);

    if (process.argv.includes('--indexeddb-check')) {
      const owner = await evaluate('activeProfileId');
      await evaluate(`(() => {
        const store = JSON.parse(localStorage.getItem('ridemate_profile_store_v1'));
        store.recordsIndexedDB = false;
        store.dataByProfileId[activeProfileId].rides = [{ name: 'legacy ride' }];
        store.dataByProfileId[activeProfileId].racing = [{ name: 'legacy race', detailedSamples: [{ timestamp: 0 }] }];
        localStorage.setItem('ridemate_profile_store_v1', JSON.stringify(store));
      })()`);
      await reload();
      await evaluate(`document.querySelector('[data-profile-select]').click(); document.querySelector('#profileSelectButton').click()`);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(`JSON.parse(localStorage.getItem('ridemate_profile_store_v1')).recordsIndexedDB === true`)) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.deepEqual(await evaluate(`({ ride: profileRepository.readRides(${JSON.stringify(owner)})[0]?.name, race: profileRepository.readRacing(${JSON.stringify(owner)})[0]?.name })`), { ride: 'legacy ride', race: 'legacy race' });
      const saved = await evaluate(`(async () => {
        await profileRepository.prependRide(activeProfileId, { name: 'saved ride', route: [{ latitude: 37, longitude: 127 }] });
        await profileRepository.prependRacing(activeProfileId, { name: 'saved race', movingTime: 10000, detailedSamples: [{ timestamp: 1 }] });
        await profileRepository.prependRacing(activeProfileId, { name: 'saved race', movingTime: 9000, detailedSamples: [{ timestamp: 2 }] }, { sameCourse: (a, b) => a.name === b.name });
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open('ridemate-records'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const stores = [...db.objectStoreNames]; db.close();
        return { rides: profileRepository.readRides(activeProfileId).length, races: profileRepository.readRacing(activeProfileId).length, best: profileRepository.readRacing(activeProfileId)[0].movingTime, stores };
      })()`);
      assert.deepEqual(saved, { rides: 2, races: 2, best: 9000, stores: ['records'] });
      await reload();
      const restored = await evaluate(`(async () => {
        await profileRepository.initializeRecords();
        return { rides: profileRepository.readRides(${JSON.stringify(owner)}).map(item => item.name), races: profileRepository.readRacing(${JSON.stringify(owner)}).map(item => item.name), bestSample: profileRepository.readRacing(${JSON.stringify(owner)})[0]?.detailedSamples?.[0]?.timestamp };
      })()`);
      assert.deepEqual(restored, { rides: ['saved ride', 'legacy ride'], races: ['saved race', 'legacy race'], bestSample: 2 });
      process.stdout.write('BROWSER PASS: legacy records migrate and IndexedDB records survive reload\n');
      return;
    }

    const menuItems = ['내 장소 집 · 회사 · 즐겨찾기', '라이딩 기록', '과거 기록과 레이싱', '앱 설정', '공지사항', '도움말', '앱 정보'];
    const visibleMenu = `[...document.querySelectorAll('[data-menu-item]')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')`;
    const routeBefore = await evaluate(`(() => {
      state.destination = { id: 'destination' };
      state.waypoints = [{ id: 'waypoint' }];
      state.routes = [{ id: 'route' }];
      state.selectedRoute = 0;
      return JSON.stringify({ destination: state.destination, waypoints: state.waypoints, routes: state.routes, selectedRoute: state.selectedRoute });
    })()`);

    await evaluate(`document.querySelector('#menuBtn').click()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), false);
    assert.equal(await evaluate(`document.querySelector('#mainMenuProfileName').textContent.trim()`), '메뉴 사용자');
    assert.deepEqual(await evaluate(`${visibleMenu}.map(node => node.textContent.trim().replace(/\\s+/g, ' '))`), menuItems);
    const mapScreen = await evaluate('state.screen');
    for (const phase of ['idle', 'active']) {
      await evaluate(`closeMainMenu(false); state.screen='racing'; state.racingPhase=${JSON.stringify(phase)}; openMainMenu()`);
      const expected = [...menuItems]; expected.splice(3, 0, '레이싱 모드 설정');
      if (phase === 'active') expected.push('레이싱 종료');
      assert.deepEqual(await evaluate(`${visibleMenu}.map(node => node.textContent.trim().replace(/\\s+/g, ' '))`), expected);
    }
    await evaluate(`closeMainMenu(false); state.screen=${JSON.stringify(mapScreen)}; state.racingPhase='idle'; openMainMenu()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').textContent.includes('저장 경로')`), false);
    assert.equal(await evaluate(`${visibleMenu}.every(node => node.getBoundingClientRect().height >= 44)`), true);
    process.stdout.write('BROWSER MENU PASS: visible map, racing idle and racing active menus\n');
    if (menuOnly) return;
    assert.equal(await evaluate(`document.querySelector('#mainMenuProfile').getBoundingClientRect().height <= 64`), true);
    await evaluate(`document.querySelector('#mainMenuDrawer').click()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), false);

    const portraitMenu = await evaluate(`(() => {
      const drawer = document.querySelector('#mainMenuDrawer').getBoundingClientRect();
      const close = document.querySelector('#mainMenuClose').getBoundingClientRect();
      return { top: drawer.top, bottom: drawer.bottom, width: drawer.width, closeBottom: close.bottom, viewport: [innerWidth, innerHeight] };
    })()`);
    assert.ok(portraitMenu.width < portraitMenu.viewport[0]);
    assert.ok(portraitMenu.top >= 0 && portraitMenu.bottom <= portraitMenu.viewport[1]);
    assert.ok(portraitMenu.closeBottom <= portraitMenu.bottom);

    await evaluate(`document.querySelector('#mainMenuBackdrop').click()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), true);
    await evaluate(`document.querySelector('#menuBtn').click()`);
    await evaluate(`document.querySelector('#mainMenuClose').click()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), true);
    await evaluate(`document.querySelector('#menuBtn').click()`);
    await evaluate(`history.back()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), true);
    assert.equal(await evaluate(`JSON.stringify({ destination: state.destination, waypoints: state.waypoints, routes: state.routes, selectedRoute: state.selectedRoute })`), routeBefore);
    assert.equal(await evaluate(`state.screen`), 'map');

    const mapReceivesClick = await evaluate(`(() => {
      let clicked = false;
      const map = document.querySelector('#map');
      map.addEventListener('click', () => { clicked = true; }, { once: true });
      map.click();
      return clicked && getComputedStyle(document.querySelector('#mainMenu')).display === 'none';
    })()`);
    assert.equal(mapReceivesClick, true);
    await evaluate(`document.querySelector('#menuBtn').click()`);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').classList.contains('hidden')`), false);

    assert.equal(await evaluate(`document.querySelector('[data-menu-item="voice-settings"]') === null && document.querySelector('#voiceTestScreen') === null`), true);
    await evaluate(`document.querySelector('[data-menu-item="places"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#myPlacesScreen').classList.contains('hidden')`), false);

    const home = { id: 'home-place', name: '우리 아파트', address: '서울 집 주소', latitude: 37.51, longitude: 127.01 };
    const newHome = { id: 'new-home', name: '새 아파트', address: '서울 새 집 주소', latitude: 37.52, longitude: 127.02 };
    const work = { id: 'work-place', name: '회사 건물', address: '서울 회사 주소', latitude: 37.53, longitude: 127.03 };
    const gym = { id: 'gym-place', name: '실제 헬스장 상호', address: '서울 헬스장 주소', latitude: 37.54, longitude: 127.04 };
    const cafe = { id: 'cafe-place', name: '실제 카페 상호', address: '서울 카페 주소', latitude: 37.55, longitude: 127.05 };
    const shop = { id: 'shop-place', name: '실제 자전거점 상호', address: '서울 자전거점 주소', latitude: 37.56, longitude: 127.06 };
    const addressOnly = { id: 'address-place', name: '서울 성북구 장위동 214-16', address: ' 서울 성북구 장위동 214-16 ', latitude: 37.57, longitude: 127.07 };
    const selectForMyPlaces = async place => {
      await evaluate(`selectRideMatePlace(${JSON.stringify(place)},{source:'my-places'})`);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await evaluate(`!document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };

    await evaluate(`document.querySelector('[data-my-place-set="home"]').click()`);
    assert.equal(await evaluate(`state.screen`), 'search');
    await selectForMyPlaces(home);
    assert.equal(await evaluate(`document.querySelector('#myPlaceHome').textContent.includes('우리 아파트')`), true);
    await evaluate(`document.querySelector('[data-my-place-set="home"]').click()`);
    await selectForMyPlaces(newHome);
    assert.equal(await evaluate(`document.querySelector('#myPlaceHome').textContent.includes('새 아파트')`), true);

    await evaluate(`document.querySelector('[data-my-place-set="work"]').click()`);
    await selectForMyPlaces(work);
    assert.equal(await evaluate(`document.querySelector('#myPlaceWork').textContent.includes('회사 건물')`), true);

    await evaluate(`document.querySelector('#addFavoriteBtn').click()`);
    await selectForMyPlaces(gym);
    const favoriteEditorLayout = await evaluate(`(() => {
      const label = document.querySelector('#favoriteEditor label span');
      const input = document.querySelector('#favoriteNameInput').getBoundingClientRect();
      const buttons = [...document.querySelector('#favoriteEditor .profile-editor-actions').querySelectorAll('button')];
      const left = buttons[0].getBoundingClientRect();
      const right = buttons[1].getBoundingClientRect();
      return { label: label.textContent.trim(), buttons: buttons.map(button => button.textContent.trim()), inputGap: input.top - label.getBoundingClientRect().bottom, horizontal: left.right < right.left, buttonGap: right.left - left.right, heights: buttons.map(button => button.getBoundingClientRect().height) };
    })()`);
    assert.equal(favoriteEditorLayout.label, '이름');
    assert.deepEqual(favoriteEditorLayout.buttons, ['저장', '취소']);
    assert.ok(favoriteEditorLayout.inputGap >= 10);
    assert.equal(favoriteEditorLayout.horizontal, true);
    assert.ok(favoriteEditorLayout.buttonGap >= 10);
    assert.equal(favoriteEditorLayout.heights.every(height => height >= 44), true);
    await evaluate(`(() => { const input=document.querySelector('#favoriteNameInput'); input.value='헬스장'; document.querySelector('#favoriteEditorForm').requestSubmit(); })()`);
    await evaluate(`document.querySelector('#addFavoriteBtn').click()`);
    await selectForMyPlaces(cafe);
    await evaluate(`(() => { const input=document.querySelector('#favoriteNameInput'); input.value='커피숍'; document.querySelector('#favoriteEditorForm').requestSubmit(); })()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-favorite-id]')].map(node => ({ customName: node.querySelector('strong').textContent, placeName: node.querySelector('[data-favorite-place-name]').textContent }))`), [
      { customName: '헬스장', placeName: '실제 헬스장 상호' },
      { customName: '커피숍', placeName: '실제 카페 상호' },
    ]);

    await evaluate(`document.querySelector('[data-favorite-action="rename"]').click()`);
    await evaluate(`(() => { const input=document.querySelector('#favoriteNameInput'); input.value='단골 헬스장'; document.querySelector('#favoriteEditorForm').requestSubmit(); })()`);
    await evaluate(`document.querySelector('[data-favorite-action="location"]').click()`);
    await evaluate(`document.querySelector('#selectOnMapBtn').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`state.screen === 'map' && document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await evaluate(`openPlace(${JSON.stringify(shop)})`);
    const mapPickerState = await evaluate(`({ screen:state.screen, selection:myPlaceSelection, hasConfirm:document.querySelector('#confirmMyPlaceMap') !== null })`);
    assert.equal(mapPickerState.hasConfirm, true, JSON.stringify(mapPickerState));
    await evaluate(`document.querySelector('#confirmMyPlaceMap').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`!document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.deepEqual(await evaluate(`(() => { const item=document.querySelector('[data-favorite-id]'); return { customName:item.querySelector('strong').textContent, placeName:item.querySelector('[data-favorite-place-name]').textContent }; })()`), { customName: '단골 헬스장', placeName: '실제 자전거점 상호' });
    await evaluate(`document.querySelectorAll('[data-favorite-action="delete"]')[1].click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-favorite-id]').length`), 1);

    await evaluate(`document.querySelector('#addFavoriteBtn').click()`);
    await evaluate(`document.querySelector('#selectOnMapBtn').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`state.screen === 'map' && document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await evaluate(`openPlace(${JSON.stringify(addressOnly)}); document.querySelector('#confirmMyPlaceMap').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`!document.querySelector('#favoriteEditor').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await evaluate(`(() => { const input=document.querySelector('#favoriteNameInput'); input.value='방앗간'; document.querySelector('#favoriteEditorForm').requestSubmit(); })()`);
    assert.equal(await evaluate(`(() => { const item=[...document.querySelectorAll('[data-favorite-id]')].find(node => node.querySelector('strong').textContent === '방앗간'); return (item.textContent.match(/서울 성북구 장위동 214-16/g)||[]).length; })()`), 1);

    await evaluate(`state.departure={ id:'saved-place-departure', name:'출발지', latitude:37.5, longitude:127 }; loadRoutes = async () => { globalThis.__savedPlaceRouteLoads = (globalThis.__savedPlaceRouteLoads || 0) + 1; return true; }; document.querySelector('#myPlacesBack').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await evaluate(`openSearch('destination'); document.querySelector('[data-quick="home"]').click()`);
    assert.equal(await evaluate(`state.destination.id`), newHome.id);
    await evaluate(`openSearch('destination'); document.querySelector('[data-quick="work"]').click()`);
    assert.equal(await evaluate(`state.destination.id`), work.id);
    await evaluate(`openSearch('destination'); document.querySelector('[data-quick="favorite"]').click()`);
    const favoriteSearch = await evaluate(`(() => ({
      title: document.querySelector('#searchLandingTitle').textContent.trim(),
      names: [...document.querySelectorAll('[data-saved-favorite] b')].map(node => node.textContent.trim()),
      overflowY: getComputedStyle(document.querySelector('#recentSearches')).overflowY,
      shortcutActive: document.querySelector('[data-quick="favorite"]').classList.contains('active')
    }))()`);
    assert.equal(favoriteSearch.title, '즐겨찾기');
    assert.deepEqual(favoriteSearch.names, ['단골 헬스장', '방앗간']);
    assert.equal(favoriteSearch.overflowY, 'auto');
    assert.equal(favoriteSearch.shortcutActive, true);
    await evaluate(`document.querySelector('[data-quick="favorite"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#searchLandingTitle').textContent.trim()`), '최근 검색');
    await evaluate(`document.querySelector('[data-quick="favorite"]').click(); document.querySelector('[data-saved-favorite]').click()`);
    assert.equal(await evaluate(`state.destination.id`), shop.id);

    await evaluate(`(() => { const places=profileRepository.readMyPlaces(activeProfileId); places.work=null; profileRepository.writeMyPlaces(activeProfileId,places); openSearch('destination'); document.querySelector('[data-quick="work"]').click(); })()`);
    assert.equal(await evaluate(`document.querySelector('#toast').textContent.trim()`), '회사 주소를 먼저 등록해주세요.');
    assert.ok(await evaluate(`globalThis.__savedPlaceRouteLoads >= 3`));

    const myPlacesStateBefore = await evaluate(`(() => {
      renderScreen('map', true);
      openMainMenu();
      document.querySelector('[data-menu-item="places"]').click();
      return JSON.stringify({ destination: state.destination, waypoints: state.waypoints, routes: state.routes, selectedRoute: state.selectedRoute });
    })()`);
    await evaluate(`document.querySelector('[data-my-place-delete="home"]').click()`);
    await evaluate(`(() => { const item=[...document.querySelectorAll('[data-favorite-id]')].find(node => node.querySelector('strong').textContent === '방앗간'); item.querySelector('[data-favorite-action="delete"]').click(); })()`);
    assert.equal(await evaluate(`document.querySelector('#myPlaceHome').textContent.includes('등록되지 않았습니다.')`), true);
    assert.equal(await evaluate(`document.querySelector('#myPlaceWork').textContent.includes('등록되지 않았습니다.')`), true);
    assert.deepEqual(await evaluate(`profileRepository.readMyPlaces(activeProfileId).favorites.map(item => ({ customName:item.customName, placeName:item.place.name }))`), [{ customName: '단골 헬스장', placeName: '실제 자전거점 상호' }]);

    await evaluate(`document.querySelector('#myPlacesBack').click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`document.querySelector('#myPlacesScreen').classList.contains('hidden')`)) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await evaluate(`document.querySelector('#myPlacesScreen').classList.contains('hidden')`), true);
    assert.equal(await evaluate(`JSON.stringify({ destination: state.destination, waypoints: state.waypoints, routes: state.routes, selectedRoute: state.selectedRoute })`), myPlacesStateBefore);
    await evaluate(`document.querySelector('#menuBtn').click()`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 844,
      screenHeight: 390,
    });
    const landscapeMenu = await evaluate(`(() => {
      const drawer = document.querySelector('#mainMenuDrawer').getBoundingClientRect();
      const close = document.querySelector('#mainMenuClose').getBoundingClientRect();
      const content = document.querySelector('#mainMenuContent');
      return { width: drawer.width, top: drawer.top, bottom: drawer.bottom, closeBottom: close.bottom, overflowY: getComputedStyle(content).overflowY, viewport: [innerWidth, innerHeight] };
    })()`);
    assert.ok(landscapeMenu.width < landscapeMenu.viewport[0] / 2);
    assert.ok(landscapeMenu.top >= 0 && landscapeMenu.bottom <= landscapeMenu.viewport[1]);
    assert.ok(landscapeMenu.closeBottom <= landscapeMenu.bottom);
    assert.equal(landscapeMenu.overflowY, 'auto');
    await evaluate(`document.querySelector('[data-menu-item="places"]').click()`);
    const landscapeMyPlaces = await evaluate(`(() => {
      const node = document.querySelector('#myPlacesScreen');
      const screen = node.getBoundingClientRect();
      const back = document.querySelector('#myPlacesBack').getBoundingClientRect();
      return { screenTop: screen.top, screenBottom: screen.bottom, backTop: back.top, overflowY: getComputedStyle(node).overflowY, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, viewport: [innerWidth, innerHeight] };
    })()`);
    assert.ok(landscapeMyPlaces.screenTop >= 0 && landscapeMyPlaces.screenBottom <= landscapeMyPlaces.viewport[1]);
    assert.ok(landscapeMyPlaces.backTop >= 0);
    assert.equal(landscapeMyPlaces.overflowY, 'auto');
    await evaluate(`document.querySelector('#myPlacesBack').click()`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });

    await reload();
    const restoredId = await assertRestoredProfile();
    await confirmProfile(restoredId);
    await reload();
    assert.equal(await assertRestoredProfile(), restoredId);

    await evaluate(`document.querySelector('#profileAddTop').click()`);
    await evaluate(`(() => { const input = document.querySelector('#profileNameInput'); input.value = '아이'; document.querySelector('input[name="profileAvatar"][value="leaf"]').checked = true; document.querySelector('#profileEditorForm').requestSubmit(); })()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-profile-select] strong')].map(node => node.textContent)`), ['메뉴 사용자', '아이']);
    await evaluate(`[...document.querySelectorAll('[data-profile-select]')].find(node => node.textContent.includes('아이')).click()`);
    const childId = await evaluate(`document.querySelector('[data-profile-select].selected').dataset.profileSelect`);
    assert.notEqual(childId, restoredId);
    await confirmProfile(childId);

    await reload();
    assert.equal(await assertRestoredProfile(), childId);
    for (let count = 0; count < 2; count += 1) {
      await evaluate(`document.querySelector('[data-profile-manage]').click()`);
      await evaluate(`document.querySelector('#profileDeleteButton').click()`);
      assert.equal(await evaluate(`document.querySelector('#profileDeleteConfirm').classList.contains('hidden')`), false);
      await evaluate(`document.querySelector('#profileDeleteConfirmButton').click()`);
    }
    const emptyState = await evaluate(`({
      text: document.querySelector('#profileEmptyState').textContent.trim(),
      hidden: document.querySelector('#profileEmptyState').classList.contains('hidden'),
      disabled: document.querySelector('#profileSelectButton').disabled,
      addAvailable: !!document.querySelector('#profileAddCard'),
      count: document.querySelectorAll('[data-profile-select]').length
    })`);
    assert.deepEqual(emptyState, { text: '등록된 프로필이 없습니다.', hidden: false, disabled: true, addAvailable: true, count: 0 });

    await reload();
    assert.equal(await evaluate(`document.querySelectorAll('[data-profile-select]').length`), 0);
    assert.equal(await evaluate(`document.querySelector('#profileEmptyState').classList.contains('hidden')`), false);
    process.stdout.write('BROWSER FLOW PASS: profile flow and main menu drawer regression cases\n');
  } catch (error) {
    bodyError = error;
    throw error;
  } finally {
    const cleanupErrors = await cleanupBrowserTest({ browser, closed, client, server, userDataDir, removeProfile });
    if (cleanupErrors.length) throw new AggregateError(bodyError ? [bodyError, ...cleanupErrors] : cleanupErrors,
      bodyError ? 'Browser test body and cleanup both failed' : 'Browser test cleanup failed');
  }
}

module.exports = { run };
if (require.main === module) run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
