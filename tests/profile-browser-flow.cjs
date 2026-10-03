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
if (!chromePath) throw new Error('Browser verification requires Chrome or Edge.');

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
    const timeout = setTimeout(() => reject(new Error(`DevTools did not start. ${output}`)), 10000);
    child.stderr.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Browser exited before DevTools was ready (${code}). ${output}`));
    });
  });
}

async function connectPage(browserWebSocketUrl) {
  const port = new URL(browserWebSocketUrl).port;
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const page = pages.find(target => target.type === 'page');
  if (!page) throw new Error('No browser page target was created.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
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

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ridemate-profile-qa-'));
  const browser = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-gpu',
    '--disable-background-networking',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
    const browserWebSocketUrl = await waitForDevtools(browser);
    const client = await connectPage(browserWebSocketUrl);
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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
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

    await client.send('Page.navigate', { url });
    await ready();
    await evaluate('localStorage.clear()');
    await reload();

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

    const menuItems = ['내 장소 집 · 회사 · 즐겨찾기', '레이싱 기록', '화면 설정', '앱 설정', '공지사항', '도움말', '앱 정보'];
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
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-menu-item]')].map(node => node.textContent.trim().replace(/\\s+/g, ' '))`), menuItems);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').textContent.includes('라이딩 기록')`), false);
    assert.equal(await evaluate(`document.querySelector('#mainMenu').textContent.includes('저장 경로')`), false);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-menu-item]')].every(node => node.getBoundingClientRect().height >= 44)`), true);
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
    await evaluate(`document.querySelector('#mainMenuClose').click()`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });

    await reload();
    assert.equal(await evaluate(`document.querySelectorAll('.profile-select-control.selected').length`), 0);
    assert.equal(await evaluate(`document.querySelector('#profileSelectButton').disabled`), true);

    await evaluate(`document.querySelector('#profileAddTop').click()`);
    await evaluate(`(() => { const input = document.querySelector('#profileNameInput'); input.value = '아이'; document.querySelector('input[name="profileAvatar"][value="leaf"]').checked = true; document.querySelector('#profileEditorForm').requestSubmit(); })()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-profile-select] strong')].map(node => node.textContent)`), ['메뉴 사용자', '아이']);
    await evaluate(`[...document.querySelectorAll('[data-profile-select]')].find(node => node.textContent.includes('아이')).click()`);
    await evaluate(`document.querySelector('#profileSelectButton').click()`);
    assert.equal(await evaluate(`document.querySelector('#profileScreen').classList.contains('hidden')`), true);

    await reload();
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
    client.socket.close();
    process.stdout.write('BROWSER FLOW PASS: profile flow and main menu drawer regression cases\n');
  } finally {
    if (browser.exitCode == null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    await new Promise(resolve => server.close(resolve));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error.code !== 'EPERM' || attempt === 19) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
