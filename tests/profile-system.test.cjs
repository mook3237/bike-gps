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
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
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

function memoryRecordStore() {
  const entries = new Map();
  let fail = false;
  return {
    setFail(value) { fail = value; },
    async readAll() { return [...entries.values()].map(value => structuredClone(value)); },
    async saveBest(entry, prefix, sameCourse) {
      const comparable = [...entries.values()].filter(saved => saved.key.startsWith(prefix)
        && typeof sameCourse === 'function' && sameCourse(saved.value.record, entry.value.record));
      if (comparable.some(saved => saved.value.record.completed !== false && Number(saved.value.record.movingTime) > 0
        && Number(saved.value.record.movingTime) <= Number(entry.value.record.movingTime))) throw new Error('not faster');
      await this.write([entry], comparable.map(saved => saved.key));
      return this.readAll();
    },
    async write(added, removed = []) {
      if (fail) throw new Error('quota');
      const next = new Map(entries);
      for (const entry of added) next.set(entry.key, structuredClone(entry));
      for (const key of removed) next.delete(key);
      entries.clear();
      for (const [key, value] of next) entries.set(key, value);
    },
  };
}

test('IndexedDB migration keeps legacy records, order, profile ownership and detailed GPS', async () => {
  const storage = memoryStorage();
  const old = repository(storage);
  old.initialize();
  old.prependRide('profile-dad', { name: 'first' });
  old.prependRide('profile-dad', { name: 'second' });
  const other = old.addProfile('other');
  old.prependRide(other.id, { name: 'other ride' });
  old.prependRacing('profile-dad', { name: 'old race', courseId: 'course', movingTime: 10000 });
  old.prependRacing('profile-dad', { name: 'race', courseId: 'course', movingTime: 9000, route: [{ latitude: 37, longitude: 127 }], detailedSamples: [{ timestamp: 1 }] }, { sameCourse: (a, b) => a.courseId === b.courseId });
  const indexed = memoryRecordStore();
  const repo = createProfileRepository(storage, { recordStore: indexed });
  await repo.initializeRecords();
  assert.deepEqual(repo.readRides('profile-dad').map(ride => ride.name), ['second', 'first']);
  assert.deepEqual(repo.readRides(other.id).map(ride => ride.name), ['other ride']);
  assert.deepEqual(repo.readRacing('profile-dad')[0].detailedSamples, [{ timestamp: 1 }]);
  assert.equal(repo.readRacing('profile-dad').length, 1);
  assert.equal(JSON.parse(storage.getItem(PROFILE_STORE_KEY)).recordsIndexedDB, true);
  assert.equal(Object.keys(storage.snapshot()).filter(key => key.includes(':record:')).length, 0);
  const reopened = createProfileRepository(storage, { recordStore: indexed });
  await reopened.initializeRecords();
  assert.deepEqual(reopened.readRides('profile-dad').map(ride => ride.name), ['second', 'first']);
  await reopened.prependRide('profile-dad', { name: 'third' });
  assert.deepEqual(repo.readRides('profile-dad').map(ride => ride.name), ['second', 'first']);
  await repo.refreshRecords();
  assert.deepEqual(repo.readRides('profile-dad').map(ride => ride.name), ['third', 'second', 'first']);
});

test('IndexedDB best replacement commits once and failed writes retain the old GPS record', async () => {
  const storage = memoryStorage();
  const indexed = memoryRecordStore();
  const repo = createProfileRepository(storage, { recordStore: indexed, createId: () => 'profile-dad' });
  repo.initialize();
  await repo.initializeRecords();
  const sameCourse = (a, b) => a.courseId === b.courseId;
  const old = { courseId: 'route', movingTime: 10000, detailedSamples: [{ timestamp: 1 }] };
  await repo.prependRacing('profile-dad', old, { sameCourse });
  indexed.setFail(true);
  await assert.rejects(repo.prependRacing('profile-dad', { ...old, movingTime: 9000 }, { sameCourse }), /quota/);
  assert.deepEqual(repo.readRacing('profile-dad'), [old]);
  indexed.setFail(false);
  await repo.prependRacing('profile-dad', { ...old, movingTime: 9000 }, { sameCourse });
  assert.deepEqual(repo.readRacing('profile-dad').map(record => record.movingTime), [9000]);
  assert.equal((await indexed.readAll()).length, 1);
});

test('failed IndexedDB migration leaves every legacy record readable', async () => {
  const storage = memoryStorage();
  const old = repository(storage);
  old.initialize();
  old.prependRide('profile-dad', { name: 'saved' });
  const indexed = memoryRecordStore();
  indexed.setFail(true);
  const repo = createProfileRepository(storage, { recordStore: indexed });
  await assert.rejects(repo.initializeRecords(), /quota/);
  assert.equal(old.readRides('profile-dad')[0].name, 'saved');
  assert.equal(JSON.parse(storage.getItem(PROFILE_STORE_KEY)).recordsIndexedDB, undefined);
  indexed.setFail(false);
  await repo.initializeRecords();
  assert.equal(repo.readRides('profile-dad')[0].name, 'saved');
});

test('first profile import sends legacy rides to IndexedDB without duplicating localStorage', async () => {
  const storage = memoryStorage({ ridemate_rides: JSON.stringify([{ name: 'older ride' }]) });
  const indexed = memoryRecordStore();
  const repo = createProfileRepository(storage, { recordStore: indexed, createId: () => 'profile-dad' });
  repo.initialize();
  assert.deepEqual(JSON.parse(storage.getItem(PROFILE_STORE_KEY)).dataByProfileId['profile-dad'].rides, []);
  assert.ok(storage.getItem('ridemate_rides'));
  await repo.initializeRecords();
  assert.deepEqual(repo.readRides('profile-dad').map(ride => ride.name), ['older ride']);
  assert.equal(storage.getItem('ridemate_rides'), null);
});

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

test('separate tabs preserve rides when another tab saves settings and recent searches', () => {
  const storage = memoryStorage();
  const first = repository(storage), second = repository(storage);
  first.initialize(); second.initialize();
  first.prependRide('profile-dad', { distance: 1234 });
  second.updateSettings('profile-dad', { distanceUnit: 'mi' });
  second.replaceRecentSearches('profile-dad', [{ query: '도봉동' }]);
  assert.equal(first.readRides('profile-dad')[0].distance, 1234);
  assert.equal(second.readRides('profile-dad')[0].distance, 1234);
  assert.equal(first.readSettings('profile-dad').distanceUnit, 'mi');
});

test('concurrent independent ride writes keep both records and failed writes keep old data', () => {
  const backing = memoryStorage(); let fail = false;
  const storage = { get length() { return backing.length; }, key: index => backing.key(index), getItem: key => backing.getItem(key), setItem(key, value) { if (fail) throw new Error('quota'); backing.setItem(key, value); } };
  const first = repository(storage), second = repository(storage);
  first.initialize(); second.initialize();
  first.prependRide('profile-dad', { distance: 100 });
  second.prependRide('profile-dad', { distance: 200 });
  fail = true;
  assert.throws(() => first.prependRide('profile-dad', { distance: 300 }), /quota/);
  assert.deepEqual(second.readRides('profile-dad').map(ride => ride.distance).sort(), [100, 200]);
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

test('reading settings does not clone ride and racing records', () => {
  const repo = repository(memoryStorage());
  repo.initialize();
  repo.prependRide('profile-dad', { distance: 100, route: [{ latitude: 37, longitude: 127 }] });
  repo.prependRacing('profile-dad', { distance: 200, route: [{ latitude: 38, longitude: 128 }] });
  repo.updateSettings('profile-dad', { distanceUnit: 'mi' });
  const originalStringify = JSON.stringify;
  let serializedProfileData = false;
  JSON.stringify = function observedStringify(value, ...args) {
    if (value && Array.isArray(value.rides) && Array.isArray(value.racing)) serializedProfileData = true;
    return originalStringify.call(this, value, ...args);
  };
  try {
    assert.equal(repo.readSettings('profile-dad').distanceUnit, 'mi');
  } finally {
    JSON.stringify = originalStringify;
  }
  assert.equal(serializedProfileData, false);
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
  repo.prependRide('profile-dad', { distance: 1 });
  repo.prependRacing('profile-dad', { distance: 1 });

  assert.equal(repo.deleteProfile('profile-dad'), true);
  assert.equal(Object.keys(storage.snapshot()).filter(key => key.includes(':record:')).length, 0);
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


test('best racing replacement is atomic, retains full GPS, and isolates courses and profiles', () => {
  const backing=memoryStorage();let fail=false;
  const storage={get length(){return backing.length},key:index=>backing.key(index),getItem:key=>backing.getItem(key),setItem(key,value){if(fail)throw new Error('quota');backing.setItem(key,value)}};
  const repo=repository(storage);repo.initialize();repo.addProfile('second');
  const sameCourse=(a,b)=>a.courseId===b.courseId;
  const old={courseId:'A',completed:true,movingTime:10000,route:[{latitude:37,longitude:127}],detailedSamples:[{timestamp:1000,accuracy:3}]};
  repo.prependRacing('profile-dad',old);repo.prependRacing('profile-dad',{...old,courseId:'B'});repo.prependRacing('profile-new',old);
  const better={...old,movingTime:9000,detailedSamples:[{timestamp:1000,accuracy:3},{timestamp:2000,accuracy:80}]};
  const before=repo.readRacing('profile-dad');fail=true;
  assert.throws(()=>repo.prependRacing('profile-dad',better,{sameCourse}),/quota/);
  assert.deepEqual(repo.readRacing('profile-dad'),before);
  fail=false;repo.prependRacing('profile-dad',better,{sameCourse});
  const saved=repo.readRacing('profile-dad');
  assert.deepEqual(saved.map(record=>record.courseId),['A','B']);
  assert.deepEqual(saved[0].detailedSamples,better.detailedSamples);
  assert.equal(repo.readRacing('profile-new')[0].movingTime,10000);
  assert.throws(()=>repo.prependRacing('profile-dad',old,{sameCourse}));
  assert.throws(()=>repo.prependRacing('profile-dad',better,{sameCourse}));
  assert.deepEqual(repo.readRacing('profile-dad'),saved);
});

test('a faster racing record uses short replacement IDs and releases the old record after saving', () => {
  const backing = memoryStorage();
  let limit = Infinity;
  const size = entries => Object.entries(entries).reduce((total, [key, value]) => total + key.length + value.length, 0);
  const storage = {
    get length() { return backing.length; },
    key: index => backing.key(index),
    getItem: key => backing.getItem(key),
    removeItem: key => backing.removeItem(key),
    setItem(key, value) {
      if (size({ ...backing.snapshot(), [key]: String(value) }) > limit) throw new Error('quota');
      backing.setItem(key, value);
    },
  };
  const repo = repository(storage);
  repo.initialize();
  const sameCourse = (a, b) => a.courseId === b.courseId;
  const route = Array.from({ length: 100 }, (_, index) => ({ latitude: 37 + index / 10000, longitude: 127 + index / 10000 }));
  const old = { courseId: 'A', completed: true, movingTime: 10000, route };
  const better = { ...old, movingTime: 9000 };
  repo.prependRacing('profile-dad', old);
  const before = backing.snapshot();
  limit = size(before) + JSON.stringify({ record: better, supersedes: ['x'.repeat(80)] }).length + 200;

  assert.doesNotThrow(() => repo.prependRacing('profile-dad', better, { sameCourse }));
  assert.equal(repo.readRacing('profile-dad').length, 1);
  assert.equal(repo.readRacing('profile-dad')[0].movingTime, 9000);
  const racingKeys = Object.keys(backing.snapshot()).filter(key => key.includes(':racing:'));
  assert.equal(racingKeys.length, 1);
  assert.deepEqual(JSON.parse(backing.getItem(racingKeys[0])).supersedes.length, 1);
  assert.ok(JSON.parse(backing.getItem(racingKeys[0])).supersedes[0].length < 100);

  limit = size(backing.snapshot());
  assert.throws(() => repo.prependRacing('profile-dad', { ...better, movingTime: 8000 }, { sameCourse }), /quota/);
  assert.equal(repo.readRacing('profile-dad')[0].movingTime, 9000);
});

test('replacing an old-format racing entry keeps its hidden base record hidden', () => {
  const storage = memoryStorage();
  const repo = repository(storage);
  const store = repo.initialize();
  const old = { courseId: 'A', completed: true, movingTime: 10000 };
  const sameCourse = (a, b) => a.courseId === b.courseId;
  store.dataByProfileId['profile-dad'].racing = [old];
  storage.setItem(PROFILE_STORE_KEY, JSON.stringify(store));
  storage.setItem(`${PROFILE_STORE_KEY}:record:profile-dad:racing:0000000000:old`, JSON.stringify({
    record: { ...old, movingTime: 9000 },
    supersedes: [JSON.stringify(old)],
  }));
  assert.deepEqual(repo.readRacing('profile-dad').map(record => record.movingTime), [9000]);

  repo.prependRacing('profile-dad', { ...old, movingTime: 8000 }, { sameCourse });
  assert.deepEqual(repo.readRacing('profile-dad').map(record => record.movingTime), [8000]);
  repo.prependRacing('profile-dad', { ...old, movingTime: 7000 }, { sameCourse });

  assert.deepEqual(repo.readRacing('profile-dad').map(record => record.movingTime), [7000]);
  const keys = Object.keys(storage.snapshot()).filter(key => key.includes(':racing:'));
  assert.equal(keys.length, 1);
  assert.ok(JSON.parse(storage.getItem(keys[0])).supersedes.includes('base:0'));
});
