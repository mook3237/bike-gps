const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PROFILE_STORE_KEY,
  createProfileRepository,
  createProfileSession,
  createProfileController,
} = require('../profile-system.js');

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function repository(storage, ids = ['profile-dad', 'profile-new']) {
  let idIndex = 0;
  return createProfileRepository(storage, {
    createId: () => ids[idIndex++],
    now: () => '2026-09-30T00:00:00.000Z',
  });
}

test('first initialization creates only Dad and imports both legacy arrays once', () => {
  const legacyRecent = [{ query: '한강', place: { id: 'river', name: '한강', latitude: 37.5, longitude: 127 } }];
  const legacyRides = [{ distance: 1200, duration: 300000, endedAt: '2026-09-01T00:00:00.000Z' }];
  const storage = memoryStorage({
    ridemate_recent_searches: JSON.stringify(legacyRecent),
    ridemate_rides: JSON.stringify(legacyRides),
  });
  const repo = repository(storage);

  const store = repo.initialize();

  assert.deepEqual(store.profiles.map(({ id, name }) => ({ id, name })), [{ id: 'profile-dad', name: '아빠' }]);
  assert.deepEqual(store.dataByProfileId['profile-dad'].places.recentSearches, legacyRecent);
  assert.deepEqual(store.dataByProfileId['profile-dad'].rides, legacyRides);
  assert.equal(store.migration.legacyV1.completed, true);
  assert.equal(storage.getItem('ridemate_recent_searches'), JSON.stringify(legacyRecent));
  assert.equal(storage.getItem('ridemate_rides'), JSON.stringify(legacyRides));

  assert.deepEqual(repo.initialize(), store);
  assert.equal(repo.getProfiles().length, 1);
  assert.equal(repo.readRides('profile-dad').length, 1);
});

test('an existing empty profile store stays empty across initialization', () => {
  const existing = {
    schemaVersion: 1,
    profiles: [],
    dataByProfileId: {},
    migration: { legacyV1: { completed: true, completedAt: '2026-09-29T00:00:00.000Z' } },
  };
  const storage = memoryStorage({ [PROFILE_STORE_KEY]: JSON.stringify(existing) });
  const repo = repository(storage);

  assert.deepEqual(repo.initialize().profiles, []);
  assert.deepEqual(repo.initialize().profiles, []);
});

test('adding a profile creates an isolated namespace and rejects blank names', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();

  assert.throws(() => repo.addProfile('   '), /프로필 이름/);
  const added = repo.addProfile('  민수  ', { type: 'icon', iconId: 'bike' });

  assert.equal(added.id, 'profile-new');
  assert.equal(added.name, '민수');
  assert.deepEqual(added.avatar, { type: 'icon', iconId: 'bike' });
  assert.deepEqual(repo.getProfileData(added.id), {
    settings: {},
    places: { recentSearches: [] },
    routes: [],
    rides: [],
    racing: [],
  });
});

test('renaming preserves the stable id and every owned data namespace', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  repo.replaceRecentSearches('profile-dad', [{ query: '카페' }]);
  repo.prependRide('profile-dad', { distance: 500 });
  const beforeData = repo.getProfileData('profile-dad');

  const renamed = repo.updateProfile('profile-dad', { name: '  아버지  ', avatar: { type: 'icon', iconId: 'mountain' } });

  assert.equal(renamed.id, 'profile-dad');
  assert.equal(renamed.name, '아버지');
  assert.deepEqual(renamed.avatar, { type: 'icon', iconId: 'mountain' });
  assert.deepEqual(repo.getProfileData('profile-dad'), beforeData);
});

test('deleting the last profile is allowed and does not recreate Dad', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();

  assert.equal(repo.deleteProfile('profile-dad'), true);
  assert.deepEqual(repo.getProfiles(), []);
  assert.deepEqual(repo.initialize().profiles, []);
  assert.equal(JSON.parse(storage.getItem(PROFILE_STORE_KEY)).profiles.length, 0);
});

test('recent searches and rides remain isolated by profile', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  const second = repo.addProfile('둘째');

  repo.replaceRecentSearches('profile-dad', [{ query: '아빠 검색' }]);
  repo.replaceRecentSearches(second.id, [{ query: '둘째 검색' }]);
  repo.prependRide('profile-dad', { distance: 100 });
  repo.prependRide(second.id, { distance: 200 });

  assert.deepEqual(repo.readRecentSearches('profile-dad'), [{ query: '아빠 검색' }]);
  assert.deepEqual(repo.readRecentSearches(second.id), [{ query: '둘째 검색' }]);
  assert.deepEqual(repo.readRides('profile-dad'), [{ distance: 100 }]);
  assert.deepEqual(repo.readRides(second.id), [{ distance: 200 }]);
});

test('malformed legacy values are preserved and recorded without destructive overwrite', () => {
  const storage = memoryStorage({
    ridemate_recent_searches: '{broken recent',
    ridemate_rides: '{broken rides',
  });
  const repo = repository(storage);

  const store = repo.initialize();

  assert.deepEqual(store.dataByProfileId['profile-dad'].places.recentSearches, []);
  assert.deepEqual(store.dataByProfileId['profile-dad'].rides, []);
  assert.equal(store.migration.legacyV1.sources.ridemate_recent_searches.status, 'malformed');
  assert.equal(store.migration.legacyV1.sources.ridemate_rides.status, 'malformed');
  assert.equal(storage.getItem('ridemate_recent_searches'), '{broken recent');
  assert.equal(storage.getItem('ridemate_rides'), '{broken rides');
});

test('profile session requires an explicit selection and starts the map only once', async () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  let mapStarts = 0;
  const session = createProfileSession(repo, { startMap: async () => { mapStarts += 1; } });

  assert.equal(session.getSelectedProfileId(), null);
  assert.equal(session.getActiveProfileId(), null);
  assert.equal(await session.activateSelected(), false);
  assert.equal(mapStarts, 0);

  assert.equal(session.selectProfile('profile-dad'), true);
  const [first, second] = await Promise.all([session.activateSelected(), session.activateSelected()]);

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(session.getActiveProfileId(), 'profile-dad');
  assert.equal(mapStarts, 1);
});

test('deleting a selected profile clears selection and zero-profile sessions cannot activate', async () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  let mapStarts = 0;
  const session = createProfileSession(repo, { startMap: async () => { mapStarts += 1; } });
  session.selectProfile('profile-dad');

  repo.deleteProfile('profile-dad');
  session.refreshProfiles();

  assert.equal(session.getSelectedProfileId(), null);
  assert.equal(await session.activateSelected(), false);
  assert.equal(mapStarts, 0);
});

test('profile controller renders zero-profile state and keeps selection disabled until a card is chosen', async () => {
  const storage = memoryStorage({
    [PROFILE_STORE_KEY]: JSON.stringify({
      schemaVersion: 1,
      profiles: [],
      dataByProfileId: {},
      migration: { legacyV1: { completed: true, completedAt: '2026-09-29T00:00:00.000Z' } },
    }),
  });
  const repo = repository(storage);
  const session = createProfileSession(repo, { startMap: async () => {} });
  const renders = [];
  const view = {
    render(model) { renders.push(model); },
    showProfileScreen() {},
    showMapScreen() {},
  };
  const controller = createProfileController(repo, session, view);

  controller.start();

  assert.equal(renders.at(-1).emptyMessage, '등록된 프로필이 없습니다.');
  assert.equal(renders.at(-1).canSelect, false);
  assert.equal(await controller.confirmSelection(), false);

  const added = controller.addProfile('새 사용자', { type: 'icon', iconId: 'leaf' });
  assert.equal(renders.at(-1).canSelect, false);
  controller.selectProfile(added.id);
  assert.equal(renders.at(-1).selectedProfileId, added.id);
  assert.equal(renders.at(-1).canSelect, true);
});

test('profile controller enters the map only after explicit selection and keeps duplicate confirmation guarded', async () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  let mapStarts = 0;
  let mapShows = 0;
  const session = createProfileSession(repo, { startMap: async () => { mapStarts += 1; } });
  const view = {
    render() {},
    showProfileScreen() {},
    showMapScreen() { mapShows += 1; },
  };
  const controller = createProfileController(repo, session, view);

  const model = controller.start();
  assert.equal(mapStarts, 0);
  assert.equal(await controller.confirmSelection(), false);
  controller.selectProfile(model.profiles[0].id);
  await Promise.all([controller.confirmSelection(), controller.confirmSelection()]);

  assert.equal(session.getActiveProfileId(), model.profiles[0].id);
  assert.equal(mapStarts, 1);
  assert.equal(mapShows, 1);
});
