const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  createProfileRepository,
  createProfileSession,
  createProfileController,
} = require('../profile-system.js');

let foundation = null;
try { foundation = require('../settings-foundation.js'); } catch {}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function repository(options = {}) {
  let nextId = 0;
  return createProfileRepository(memoryStorage(), {
    createId: () => ['profile-a', 'profile-b'][nextId++],
    now: () => '2026-10-04T00:00:00.000Z',
    ...options,
  });
}

test('profile controller can safely return to selection and activate another profile without rebooting the map', async () => {
  const repo = repository();
  repo.initialize();
  const second = repo.addProfile('둘째');
  let mapStarts = 0;
  let profileShows = 0;
  let mapShows = 0;
  const session = createProfileSession(repo, { startMap: async () => { mapStarts += 1; } });
  const controller = createProfileController(repo, session, {
    render() {},
    showProfileScreen() { profileShows += 1; },
    showMapScreen() { mapShows += 1; },
  });

  const first = controller.start().profiles[0];
  controller.selectProfile(first.id);
  await controller.confirmSelection();
  controller.returnToSelection();
  controller.selectProfile(second.id);
  await controller.confirmSelection();

  assert.equal(session.getActiveProfileId(), second.id);
  assert.equal(mapStarts, 1);
  assert.equal(profileShows, 2);
  assert.equal(mapShows, 2);
  assert.equal(repo.getProfiles().length, 2);
});

test('settings are validated and remain isolated per profile', () => {
  const repo = repository();
  repo.initialize();
  const second = repo.addProfile('둘째');

  assert.deepEqual(repo.readSettings('profile-a'), {
    distanceUnit: 'km', keepScreenAwake: false, saveShortRides: false, clockFormat: 'device',
  });
  repo.updateSettings('profile-a', { distanceUnit: 'mi', keepScreenAwake: true, clockFormat: '24h' });
  repo.updateSettings(second.id, { distanceUnit: 'invalid', saveShortRides: true, clockFormat: 'invalid' });

  assert.deepEqual(repo.readSettings('profile-a'), {
    distanceUnit: 'mi', keepScreenAwake: true, saveShortRides: false, clockFormat: '24h',
  });
  assert.deepEqual(repo.readSettings(second.id), {
    distanceUnit: 'km', keepScreenAwake: false, saveShortRides: true, clockFormat: 'device',
  });
});

test('photo avatar metadata is normalized and replaced/deleted photo ids are cleaned up', () => {
  const removed = [];
  const repo = repository({ onPhotoRemoved: photoId => removed.push(photoId) });
  repo.initialize();

  repo.updateProfile('profile-a', { avatar: { type: 'photo', photoId: 'photo-1' } });
  assert.deepEqual(repo.getProfiles()[0].avatar, { type: 'photo', photoId: 'photo-1' });
  repo.updateProfile('profile-a', { avatar: { type: 'photo', photoId: 'photo-2' } });
  repo.deleteProfile('profile-a');

  assert.deepEqual(removed, ['photo-1', 'photo-2']);
});

test('display formatters convert values without mutating meter or meter-per-second inputs', () => {
  assert.ok(foundation, 'settings-foundation.js must exist');
  const { formatDistance, formatSpeed, formatPace } = foundation;
  const meters = 1609.344;
  const metersPerSecond = 10;

  assert.equal(formatDistance(meters, 'mi'), '1.0 mi');
  assert.equal(formatDistance(meters, 'km'), '1.6 km');
  assert.equal(formatSpeed(metersPerSecond, 'mi'), '22.4 mph');
  assert.equal(formatSpeed(metersPerSecond, 'km'), '36.0 km/h');
  assert.equal(formatPace(300, 'km'), '5:00 min/km');
  assert.equal(formatPace(300, 'mi'), '8:03 min/mi');
  assert.equal(formatPace(null, 'mi'), '--:-- min/mi');
  assert.equal(meters, 1609.344);
  assert.equal(metersPerSecond, 10);
});

test('clock formatter supports device, 12-hour and 24-hour preferences', () => {
  assert.ok(foundation, 'settings-foundation.js must exist');
  const date = new Date('2026-10-04T13:05:00Z');
  assert.match(foundation.formatClock(date, '12h', 'en-US', 'UTC'), /1:05\s*PM/i);
  assert.match(foundation.formatClock(date, '24h', 'en-GB', 'UTC'), /13:05/);
  assert.equal(typeof foundation.formatClock(date, 'device', 'en-US', 'UTC'), 'string');
});

test('wake lock rejection is harmless and disabling releases an acquired lock', async () => {
  assert.ok(foundation, 'settings-foundation.js must exist');
  const listeners = new Map();
  const document = { visibilityState: 'visible', addEventListener(type, listener) { listeners.set(type, listener); } };
  const rejected = foundation.createWakeLockController({ navigator: { wakeLock: { request: async () => { throw new Error('denied'); } } }, document });
  assert.equal(await rejected.setEnabled(true), false);

  let released = 0;
  const sentinel = { addEventListener() {}, async release() { released += 1; } };
  const acquired = foundation.createWakeLockController({ navigator: { wakeLock: { request: async () => sentinel } }, document });
  assert.equal(await acquired.setEnabled(true), true);
  await acquired.setEnabled(false);
  assert.equal(released, 1);
  assert.equal(acquired.isActive(), false);
});

test('settings and photo UI use existing menu/profile surfaces', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  assert.match(html, /id="profilePhotoInput"[^>]*accept="image\/\*"/);
  assert.match(html, /id="appSettingsScreen"/);
  assert.match(html, /data-setting="distanceUnit"/);
  assert.match(app, /function openProfileSelection\(\)[\s\S]*?profileController\.returnToSelection\(\)/);
  assert.match(app, /mainMenuProfile'\)\.onclick=openProfileSelection/);
  assert.match(app, /data-menu-item="app-settings"/);
});
