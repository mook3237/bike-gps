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
    places: { recentSearches: [], home: null, work: null, favorites: [] },
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

test('new ride records keep permanent summaries and routes without a hard 100-record cap', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  for (let index = 0; index < 101; index += 1) {
    repo.prependRide('profile-dad', {
      distance: index,
      route: [{ latitude: 37, longitude: 127 }],
      detailedSamples: [{ timestamp: index, accuracy: 3 }],
    });
  }
  const rides = repo.readRides('profile-dad');
  assert.equal(rides.length, 101);
  assert.deepEqual(rides[0].route, [{ latitude: 37, longitude: 127 }]);
  assert.equal('detailedSamples' in rides[0], false);
});

test('full ride samples can be retained explicitly without changing the default policy', () => {
  const repo = repository(memoryStorage());
  repo.initialize();
  repo.prependRide('profile-dad', { distance: 1000, detailedSamples: [{ timestamp: 1 }] }, { retainDetailed: true });
  assert.deepEqual(repo.readRides('profile-dad')[0].detailedSamples, [{ timestamp: 1 }]);
});

test('profile ride persistence preserves a Ghost-compatible enriched route', () => {
  const repo = repository(memoryStorage());
  repo.initialize();
  const record = {
    ghostDataVersion: 1,
    distance: 20,
    route: [
      { latitude: 37, longitude: 127, timestamp: 1000, distance: 0, movingTime: 0, filteredSpeed: 0, moving: false },
      { latitude: 37.0001, longitude: 127.0001, timestamp: 3000, distance: 20, movingTime: 2000, filteredSpeed: 10, moving: true },
    ],
    detailedSamples: [{ latitude: 37, longitude: 127, timestamp: 1000 }],
  };

  repo.prependRide('profile-dad', record);
  const saved = repo.readRides('profile-dad')[0];

  assert.equal(saved.ghostDataVersion, 1);
  assert.deepEqual(saved.route, record.route);
  assert.equal('detailedSamples' in saved, false);
});

test('my places persist home, work, and independently named favorites per profile', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  const second = repo.addProfile('둘째');
  const home = { id: 'home-place', name: '한강아파트', address: '서울 집 주소', latitude: 37.5, longitude: 127 };
  const work = { id: 'work-place', name: '라이드메이트', address: '서울 회사 주소', latitude: 37.6, longitude: 127.1 };
  const cafe = { id: 'cafe-place', name: '실제 카페 상호', address: '서울 카페 주소', latitude: 37.55, longitude: 127.05 };
  const shop = { id: 'shop-place', name: '실제 자전거점 상호', address: '서울 자전거점 주소', latitude: 37.56, longitude: 127.06 };

  assert.deepEqual(repo.readMyPlaces('profile-dad'), { home: null, work: null, favorites: [] });
  repo.writeMyPlaces('profile-dad', {
    home,
    work,
    favorites: [
      { id: 'favorite-1', customName: '커피숍', place: cafe },
      { id: 'favorite-2', customName: '자전거샵', place: shop },
    ],
  });

  assert.deepEqual(repo.readMyPlaces('profile-dad'), {
    home,
    work,
    favorites: [
      { id: 'favorite-1', customName: '커피숍', place: cafe },
      { id: 'favorite-2', customName: '자전거샵', place: shop },
    ],
  });
  assert.deepEqual(repo.readMyPlaces(second.id), { home: null, work: null, favorites: [] });

  repo.writeMyPlaces('profile-dad', {
    home: null,
    work: { ...work, name: '새 회사 위치' },
    favorites: [{ id: 'favorite-1', customName: '단골 카페', place: shop }],
  });
  assert.deepEqual(repo.readMyPlaces('profile-dad'), {
    home: null,
    work: { ...work, name: '새 회사 위치' },
    favorites: [{ id: 'favorite-1', customName: '단골 카페', place: shop }],
  });
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

test('a successfully activated profile is restored without moving its saved places', async () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  repo.initialize();
  const second = repo.addProfile('Second');
  const home = { id: 'home', name: 'Home', latitude: 37.5, longitude: 127 };
  const work = { id: 'work', name: 'Work', latitude: 37.6, longitude: 127.1 };
  repo.writeMyPlaces('profile-dad', { home, work: null, favorites: [] });
  repo.writeMyPlaces(second.id, { home: null, work, favorites: [] });
  const session = createProfileSession(repo, { startMap: async () => {} });

  session.selectProfile(second.id);
  await session.activateSelected();

  const restoredRepo = repository(storage);
  restoredRepo.initialize();
  const restoredSession = createProfileSession(restoredRepo, { startMap: async () => {} });
  assert.equal(restoredSession.getSelectedProfileId(), second.id);
  assert.deepEqual(restoredRepo.readMyPlaces('profile-dad'), { home, work: null, favorites: [] });
  assert.deepEqual(restoredRepo.readMyPlaces(second.id), { home: null, work, favorites: [] });
  assert.equal(restoredRepo.getProfiles().length, 2);
});

test('an invalid remembered profile falls back to no selection', () => {
  const storage = memoryStorage();
  const initialRepo = repository(storage);
  const store = initialRepo.initialize();
  storage.setItem(PROFILE_STORE_KEY, JSON.stringify({ ...store, lastActiveProfileId: 'missing-profile' }));

  const restoredRepo = repository(storage);
  restoredRepo.initialize();
  const session = createProfileSession(restoredRepo, { startMap: async () => {} });

  assert.equal(session.getSelectedProfileId(), null);
  assert.equal(session.getProfiles().length, 1);
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
