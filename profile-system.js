(function exposeProfileSystem(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfileSystemApi() {
  const PROFILE_STORE_KEY = 'ridemate_profile_store_v1';
  const RECORD_ENTRY_PREFIX = `${PROFILE_STORE_KEY}:record:`;
  const RECORD_REVISION_KEY = `${PROFILE_STORE_KEY}:record-revision`;
  const PROFILE_SCHEMA_VERSION = 1;
  const LEGACY_RECENT_KEY = 'ridemate_recent_searches';
  const LEGACY_RIDES_KEY = 'ridemate_rides';
  const DEFAULT_AVATAR = Object.freeze({ type: 'icon', iconId: 'rider' });
  const DEFAULT_SETTINGS = Object.freeze({ distanceUnit: 'km', keepScreenAwake: true, saveShortRides: false, clockFormat: 'device', voiceVolumePercent: 100 });

  const clone = value => JSON.parse(JSON.stringify(value));
  const recordNameSegmenter = typeof globalThis.Intl?.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
  function recordNameLength(name) { return recordNameSegmenter ? [...recordNameSegmenter.segment(String(name))].length : null; }

  function defaultCreateId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function emptyProfileData() {
    return {
      settings: {},
      places: { recentSearches: [], home: null, work: null, favorites: [] },
      routes: [],
      rides: [],
      racing: [],
    };
  }

  function readLegacyArray(storage, key) {
    const raw = storage.getItem(key);
    if (raw == null) return { items: [], source: { status: 'missing', count: 0 } };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { items: [], source: { status: 'malformed', count: 0 } };
      return { items: clone(parsed), source: { status: 'imported', count: parsed.length } };
    } catch {
      return { items: [], source: { status: 'malformed', count: 0 } };
    }
  }

  function validateStore(value) {
    return value
      && value.schemaVersion === PROFILE_SCHEMA_VERSION
      && Array.isArray(value.profiles)
      && value.dataByProfileId
      && typeof value.dataByProfileId === 'object';
  }

  function normalizeName(name) {
    const normalized = String(name ?? '').trim();
    if (!normalized) throw new Error('프로필 이름을 입력해주세요.');
    return normalized;
  }

  function normalizeAvatar(avatar) {
    if (avatar?.type === 'photo' && String(avatar.photoId || '').trim()) return { type: 'photo', photoId: String(avatar.photoId).trim() };
    if (avatar?.type === 'icon' && String(avatar.iconId || '').trim()) return { type: 'icon', iconId: String(avatar.iconId).trim() };
    return clone(DEFAULT_AVATAR);
  }

  function normalizeSettings(settings = {}) {
    return {
      distanceUnit: settings.distanceUnit === 'mi' ? 'mi' : 'km',
      keepScreenAwake: settings.keepScreenAwake !== false,
      saveShortRides: settings.saveShortRides === true,
      clockFormat: ['12h', '24h'].includes(settings.clockFormat) ? settings.clockFormat : 'device',
      voiceVolumePercent: Number.isFinite(settings.voiceVolumePercent) && settings.voiceVolumePercent >= 0 && settings.voiceVolumePercent <= 100 ? settings.voiceVolumePercent : 100,
      ...(settings.dashboard && typeof settings.dashboard === 'object' ? { dashboard: clone(settings.dashboard) } : {}),
    };
  }

  function createProfileRepository(storage, options = {}) {
    if (!storage?.getItem || !storage?.setItem) throw new Error('프로필 저장소가 필요합니다.');
    const createId = options.createId || defaultCreateId;
    const now = options.now || (() => new Date().toISOString());
    const onPhotoRemoved = typeof options.onPhotoRemoved === 'function' ? options.onPhotoRemoved : () => {};
    const recordStore = options.recordStore || null;
    let currentStore = null;
    let indexedRecords = null;

    function notifyRecordsChanged() {
      try { storage.setItem(RECORD_REVISION_KEY, defaultCreateId()); } catch {}
    }

    function recordEntries(profileId, kind) {
      if (indexedRecords) {
        const prefix = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:${kind}:`;
        return [...indexedRecords.values()].filter(entry => entry.key.startsWith(prefix))
          .sort((a, b) => a.key.localeCompare(b.key))
          .map(entry => ({ key: entry.key, id: entry.key.slice(prefix.length), value: clone(entry.value) }));
      }
      if (typeof storage.key !== 'function' || !Number.isInteger(storage.length)) return null;
      const prefix = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:${kind}:`;
      const entries = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const raw = storage.getItem(key);
        if (raw != null) entries.push({ key, id: key.slice(prefix.length), value: JSON.parse(raw) });
      }
      return entries.sort((a, b) => a.key.localeCompare(b.key));
    }

    function appendRecord(profileId, kind, value) {
      const key = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:${kind}:${Date.now().toString(36).padStart(10, '0')}:${defaultCreateId()}`;
      if (indexedRecords) {
        const entry = { key, value: clone(value) };
        return recordStore.write([entry]).then(() => { indexedRecords.set(key, entry); notifyRecordsChanged(); });
      }
      storage.setItem(key, JSON.stringify(value));
    }

    async function refreshRecords() {
      if (indexedRecords) indexedRecords = new Map((await recordStore.readAll()).map(entry => [entry.key, entry]));
    }

    async function initializeRecords() {
      if (!recordStore || indexedRecords) return;
      const existing = await recordStore.readAll();
      const store = ensureStore();
      if (store.recordsIndexedDB === true) {
        indexedRecords = new Map(existing.map(entry => [entry.key, entry]));
        return;
      }
      const migrated = [];
      const legacyKeys = [];
      for (const profile of store.profiles) {
        const prefix = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profile.id)}:`;
        const rideEntries = recordEntries(profile.id, 'rides') || [];
        legacyKeys.push(...rideEntries.map(entry => entry.key));
        const rides = recordsFor(profile.id, 'rides');
        if (store.legacyRidesPendingProfileId === profile.id)
          rides.push(...readLegacyArray(storage, LEGACY_RIDES_KEY).items);
        for (const [index, ride] of rides.entries())
          migrated.push({ key: `${prefix}rides:!legacy:${String(rides.length - index).padStart(10, '0')}`, value: ride });
        const racingEntries = recordEntries(profile.id, 'racing') || [];
        legacyKeys.push(...racingEntries.map(entry => entry.key));
        const races = racingEntriesFor(profile.id);
        for (const [index, entry] of races.entries())
          migrated.push({ key: `${prefix}racing:!legacy:${String(races.length - index).padStart(10, '0')}`, value: { record: entry.record, supersedes: [] } });
      }
      await recordStore.write(migrated);
      // The IndexedDB commit is durable before freeing the old localStorage quota.
      for (const key of legacyKeys) try { storage.removeItem?.(key); } catch {}
      const next = clone(store);
      for (const data of Object.values(next.dataByProfileId)) { data.rides = []; data.racing = []; }
      delete next.legacyRidesPendingProfileId;
      next.recordsIndexedDB = true;
      persist(next);
      if (store.migration?.legacyV1?.sources?.[LEGACY_RIDES_KEY]?.status === 'imported')
        try { storage.removeItem?.(LEGACY_RIDES_KEY); } catch {}
      indexedRecords = new Map([...existing, ...migrated].map(entry => [entry.key, entry]));
      notifyRecordsChanged();
    }

    function recordsFor(profileId, kind) {
      if (kind === 'racing') return racingEntriesFor(profileId).map(entry => entry.record);
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      const records = clone(Array.isArray(data[kind]) ? data[kind] : []);
      for (const entry of recordEntries(profileId, kind) || []) records.unshift(entry.value);
      return records;
    }

    function racingEntriesFor(profileId) {
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      let records = clone(Array.isArray(data.racing) ? data.racing : [])
        .map((record, index) => ({ id: `base:${index}`, key: null, record, supersedes: [] }));
      for (const entry of recordEntries(profileId, 'racing') || []) {
        const removed = new Set(entry.value.supersedes || []);
        const legacyRemoved = [...removed].filter(value => typeof value === 'string' && value.startsWith('{'));
        const hidden = records.filter(saved => removed.has(saved.id) || (legacyRemoved.length > 0 && legacyRemoved.includes(JSON.stringify(saved.record))));
        records = [
          {
            id: entry.id,
            key: entry.key,
            record: entry.value.record,
            supersedes: [...new Set([
              ...[...removed].filter(value => typeof value === 'string' && !value.startsWith('{')),
              ...hidden.flatMap(saved => [saved.id, ...saved.supersedes]),
            ])],
          },
          ...records.filter(saved => !hidden.includes(saved)),
        ];
      }
      return records;
    }

    function persist(nextStore) {
      storage.setItem(PROFILE_STORE_KEY, JSON.stringify(nextStore));
      currentStore = nextStore;
      return currentStore;
    }

    function initialize() {
      if (currentStore) return clone(currentStore);
      const raw = storage.getItem(PROFILE_STORE_KEY);
      if (raw != null) {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw new Error('프로필 저장 데이터를 읽을 수 없습니다.'); }
        if (!validateStore(parsed)) throw new Error('프로필 저장 데이터 형식이 올바르지 않습니다.');
        if (parsed.migration?.wakeLockDefaultOnV1?.completed !== true) {
          for (const profile of parsed.profiles) {
            const data = parsed.dataByProfileId[profile.id];
            if (data) data.settings = { ...data.settings, keepScreenAwake: true };
          }
          parsed.migration = { ...parsed.migration, wakeLockDefaultOnV1: { completed: true, completedAt: now() } };
          persist(parsed);
        } else currentStore = parsed;
        return clone(currentStore);
      }

      const id = createId();
      const timestamp = now();
      const recent = readLegacyArray(storage, LEGACY_RECENT_KEY);
      const rides = readLegacyArray(storage, LEGACY_RIDES_KEY);
      const data = emptyProfileData();
      data.places.recentSearches = recent.items;
      data.rides = recordStore ? [] : rides.items;
      return clone(persist({
        schemaVersion: PROFILE_SCHEMA_VERSION,
        profiles: [{
          id,
          name: '아빠',
          avatar: clone(DEFAULT_AVATAR),
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
        dataByProfileId: { [id]: data },
        ...(recordStore && rides.items.length ? { legacyRidesPendingProfileId: id } : {}),
        migration: {
          wakeLockDefaultOnV1: { completed: true, completedAt: timestamp },
          legacyV1: {
            completed: true,
            completedAt: timestamp,
            sources: {
              [LEGACY_RECENT_KEY]: recent.source,
              [LEGACY_RIDES_KEY]: rides.source,
            },
          },
        },
      }));
    }

    function ensureStore() {
      if (!currentStore) initialize();
      const raw = storage.getItem(PROFILE_STORE_KEY);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (!validateStore(parsed)) throw new Error('프로필 저장 데이터 형식이 올바르지 않습니다.');
        currentStore = parsed;
      }
      return currentStore;
    }

    function getProfiles() {
      return clone(ensureStore().profiles);
    }

    function readLastActiveProfileId() {
      const store = ensureStore();
      return store.profiles.some(profile => profile.id === store.lastActiveProfileId) ? store.lastActiveProfileId : null;
    }

    function writeLastActiveProfileId(profileId) {
      const store = ensureStore();
      if (!store.profiles.some(profile => profile.id === profileId)) return false;
      const next = clone(store);
      next.lastActiveProfileId = profileId;
      persist(next);
      return true;
    }

    function getProfileData(profileId) {
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      return { ...clone(data), rides: recordsFor(profileId, 'rides'), racing: recordsFor(profileId, 'racing') };
    }

    function addProfile(name, avatar = DEFAULT_AVATAR) {
      const store = ensureStore();
      const normalizedName = normalizeName(name);
      let id = createId();
      while (store.profiles.some(profile => profile.id === id)) id = createId();
      const timestamp = now();
      const profile = {
        id,
        name: normalizedName,
        avatar: normalizeAvatar(avatar),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const next = clone(store);
      next.profiles.push(profile);
      next.dataByProfileId[id] = emptyProfileData();
      persist(next);
      return clone(profile);
    }

    function updateProfile(profileId, updates = {}) {
      const store = ensureStore();
      const index = store.profiles.findIndex(profile => profile.id === profileId);
      if (index < 0) throw new Error('프로필을 찾을 수 없습니다.');
      const next = clone(store);
      const profile = next.profiles[index];
      const previousPhotoId = profile.avatar?.type === 'photo' ? profile.avatar.photoId : null;
      if (Object.hasOwn(updates, 'name')) profile.name = normalizeName(updates.name);
      if (Object.hasOwn(updates, 'avatar')) profile.avatar = normalizeAvatar(updates.avatar);
      profile.updatedAt = now();
      persist(next);
      if (previousPhotoId && previousPhotoId !== profile.avatar?.photoId) onPhotoRemoved(previousPhotoId);
      return clone(profile);
    }

    function deleteProfile(profileId) {
      const store = ensureStore();
      if (!store.profiles.some(profile => profile.id === profileId)) return false;
      const removedProfile = store.profiles.find(profile => profile.id === profileId);
      const recordKeys = [...(recordEntries(profileId, 'rides') || []), ...(recordEntries(profileId, 'racing') || [])].map(entry => entry.key);
      const next = clone(store);
      next.profiles = next.profiles.filter(profile => profile.id !== profileId);
      delete next.dataByProfileId[profileId];
      if (next.lastActiveProfileId === profileId) delete next.lastActiveProfileId;
      persist(next);
      if (indexedRecords) {
        for (const key of recordKeys) indexedRecords.delete(key);
        recordStore.write([], recordKeys).catch(() => {});
      } else for (const key of recordKeys) try { storage.removeItem?.(key); } catch {}
      if (removedProfile.avatar?.type === 'photo') onPhotoRemoved(removedProfile.avatar.photoId);
      return true;
    }

    function readSettings(profileId) {
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      return normalizeSettings(clone(data.settings || {}));
    }

    function updateSettings(profileId, updates = {}) {
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const next = clone(store);
      next.dataByProfileId[profileId].settings = normalizeSettings({
        ...next.dataByProfileId[profileId].settings,
        ...updates,
      });
      persist(next);
      return readSettings(profileId);
    }

    function replaceRecentSearches(profileId, items) {
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const next = clone(store);
      next.dataByProfileId[profileId].places.recentSearches = clone(Array.isArray(items) ? items.slice(0, 10) : []);
      persist(next);
      return clone(next.dataByProfileId[profileId].places.recentSearches);
    }

    function readRecentSearches(profileId) {
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      return clone(Array.isArray(data.places?.recentSearches) ? data.places.recentSearches.slice(0, 10) : []);
    }

    function readMyPlaces(profileId) {
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');
      const places = data.places || {};
      return {
        home: places.home ? clone(places.home) : null,
        work: places.work ? clone(places.work) : null,
        favorites: Array.isArray(places.favorites) ? clone(places.favorites) : [],
      };
    }

    function writeMyPlaces(profileId, myPlaces = {}) {
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const next = clone(store);
      const places = next.dataByProfileId[profileId].places || { recentSearches: [] };
      places.home = myPlaces.home ? clone(myPlaces.home) : null;
      places.work = myPlaces.work ? clone(myPlaces.work) : null;
      places.favorites = Array.isArray(myPlaces.favorites) ? clone(myPlaces.favorites) : [];
      next.dataByProfileId[profileId].places = places;
      persist(next);
      return readMyPlaces(profileId);
    }

    function prependRide(profileId, ride, options = {}) {
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const storedRide = clone(ride);
      if (options.retainDetailed !== true) delete storedRide.detailedSamples;
      if (indexedRecords) return appendRecord(profileId, 'rides', storedRide).then(() => readRides(profileId));
      if (recordEntries(profileId, 'rides') !== null) {
        appendRecord(profileId, 'rides', storedRide);
        return readRides(profileId);
      }
      const next = clone(store);
      const rides = Array.isArray(next.dataByProfileId[profileId].rides) ? next.dataByProfileId[profileId].rides : [];
      next.dataByProfileId[profileId].rides = [storedRide, ...rides];
      persist(next);
      return clone(next.dataByProfileId[profileId].rides);
    }

    function readRides(profileId) {
      return recordsFor(profileId, 'rides');
    }

    function prependRacing(profileId, record, { sameCourse } = {}) {
      if (indexedRecords) return (async () => {
        const store = ensureStore();
        if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
        const key = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:racing:${Date.now().toString(36).padStart(10, '0')}:${defaultCreateId()}`;
        const entry = { key, value: { record: clone(record), supersedes: [] } };
        const entries = await recordStore.saveBest(entry, `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:racing:`, sameCourse);
        indexedRecords = new Map(entries.map(saved => [saved.key, saved]));
        notifyRecordsChanged();
        return readRacing(profileId);
      })();
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const racing = racingEntriesFor(profileId);
      const comparable = typeof sameCourse === 'function' ? racing.filter(saved => sameCourse(saved.record, record)) : [];
      if (comparable.some(saved => saved.record.completed !== false && Number(saved.record.movingTime) > 0 && Number(saved.record.movingTime) <= Number(record.movingTime))) {
        throw new Error('기존 최고 기록을 이긴 기록만 저장할 수 있습니다.');
      }
      if (recordEntries(profileId, 'racing') !== null) {
        const prefix = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:racing:`;
        const supersedes = [...new Set(comparable.flatMap(saved => [saved.id, ...saved.supersedes]))]
          .filter(id => id.startsWith('base:') || storage.getItem(`${prefix}${id}`) !== null);
        appendRecord(profileId, 'racing', { record: clone(record), supersedes });
        for (const saved of comparable) if (saved.key) try { storage.removeItem?.(saved.key); } catch {}
        return readRacing(profileId);
      }
      const next = clone(store);
      next.dataByProfileId[profileId].racing = [clone(record), ...racing.filter(saved => !comparable.includes(saved)).map(saved => saved.record)];
      persist(next);
      return clone(next.dataByProfileId[profileId].racing);
    }

    function readRacing(profileId) {
      return recordsFor(profileId, 'racing');
    }

    function recordDetails(profileId, kind) {
      if (!['rides', 'racing'].includes(kind)) return [];
      const data = ensureStore().dataByProfileId[profileId];
      if (!data) return [];
      const entries = kind === 'racing' ? racingEntriesFor(profileId) : [
        ...(recordEntries(profileId, kind) || []).reverse().map(entry => ({ key: entry.key, record: entry.value })),
        ...(data.rides || []).map(value => ({ key: null, record: value })),
      ];
      return entries.map(entry => {
        const expected = JSON.stringify(entry.record);
        const safe = !!entry.key || entries.filter(other => !other.key && JSON.stringify(other.record) === expected).length === 1;
        return { record: clone(entry.record), target: safe ? { profileId, kind, key: entry.key, expected } : null };
      });
    }

    function recordTarget(profileId, kind, record) {
      const matches = recordDetails(profileId, kind).filter(entry => JSON.stringify(entry.record) === JSON.stringify(record));
      if (matches.length !== 1) return null;
      return matches[0].target;
    }

    async function changeRecord(target, name = null) {
      if (!target || !['rides', 'racing'].includes(target.kind)) throw new Error('기록을 안전하게 식별할 수 없습니다. 목록을 다시 열어주세요.');
      const { profileId, kind, key, expected } = target;
      if (name === null && kind === 'racing') throw new Error('레이싱 기록 삭제 정책이 정해지지 않았습니다.');
      if (name !== null) {
        name = String(name);
        const length = recordNameLength(name);
        if (length === null) throw new Error('이 브라우저는 글자 묶음 계산을 지원하지 않습니다.');
        if (!name.trim() || length > 13 || /[\r\n\t]/.test(name)) throw new Error('기록 이름은 공백 포함 최대 13자로 입력해주세요.');
        name = name.trim();
      }
      const store = ensureStore();
      if (!store.dataByProfileId[profileId]) throw new Error('프로필을 찾을 수 없습니다.');
      const update = value => {
        const record = kind === 'racing' ? value.record : value;
        if (JSON.stringify(record) !== expected) throw new Error('기록이 변경되었습니다. 목록을 다시 열어주세요.');
        return name === null ? null : kind === 'racing' ? { ...value, record: { ...record, name } } : { ...record, name };
      };
      if (key) {
        const prefix = `${RECORD_ENTRY_PREFIX}${encodeURIComponent(profileId)}:${kind}:`;
        if (!key.startsWith(prefix)) throw new Error('기록 소유자가 일치하지 않습니다.');
        if (indexedRecords) {
          const entry = await recordStore.changeRecord(key, update);
          if (entry) indexedRecords.set(key, entry); else indexedRecords.delete(key);
          notifyRecordsChanged();
        } else {
          const raw = storage.getItem(key);
          if (raw === null) throw new Error('기록을 찾을 수 없습니다.');
          const value = update(JSON.parse(raw));
          if (value === null) {
            if (!storage.removeItem) throw new Error('기록을 삭제할 수 없습니다.');
            storage.removeItem(key);
          } else storage.setItem(key, JSON.stringify(value));
        }
      } else {
        const values = store.dataByProfileId[profileId][kind] || [];
        const matches = values.map((value, index) => JSON.stringify(value) === expected ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new Error('기록을 안전하게 식별할 수 없습니다. 목록을 다시 열어주세요.');
        const next = clone(store), records = next.dataByProfileId[profileId][kind];
        const index = matches[0];
        if (name === null) records.splice(index, 1); else records[index] = { ...records[index], name };
        persist(next);
      }
      return name === null ? null : { ...JSON.parse(expected), name };
    }

    return {
      initialize,
      initializeRecords,
      refreshRecords,
      getProfiles,
      readLastActiveProfileId,
      writeLastActiveProfileId,
      getProfileData,
      addProfile,
      updateProfile,
      deleteProfile,
      readSettings,
      updateSettings,
      replaceRecentSearches,
      readRecentSearches,
      readMyPlaces,
      writeMyPlaces,
      prependRide,
      readRides,
      prependRacing,
      readRacing,
      recordTarget,
      recordDetails,
      changeRecord,
    };
  }

  function createIndexedRecordStore(indexedDb = globalThis.indexedDB) {
    let databasePromise;
    function database() {
      if (!indexedDb) return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다.'));
      if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDb.open('ridemate-records', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records', { keyPath: 'key' });
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); databasePromise = null; };
          resolve(request.result);
        };
        request.onerror = () => reject(request.error || new Error('기록 저장소를 열 수 없습니다.'));
      }).catch(error => { databasePromise = null; throw error; });
      return databasePromise;
    }
    return {
      async changeRecord(key, update) {
        const db = await database();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
          let entry = null, failure;
          tx.oncomplete = () => resolve(entry);
          tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('기록 변경을 저장하지 못했습니다.'));
          const request = store.get(key);
          request.onsuccess = () => {
            try {
              if (!request.result) throw new Error('기록을 찾을 수 없습니다.');
              const value = update(request.result.value);
              if (value === null) store.delete(key);
              else { entry = { ...request.result, value }; store.put(entry); }
            } catch (error) { failure = error; tx.abort(); }
          };
        });
      },
      async saveBest(entry, prefix, sameCourse) {
        const db = await database();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          let result, failure;
          tx.oncomplete = () => resolve(result);
          tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('최고 기록을 저장하지 못했습니다.'));
          const request = store.getAll();
          request.onsuccess = () => {
            try {
              const comparable = request.result.filter(saved => saved.key.startsWith(prefix)
                && typeof sameCourse === 'function' && sameCourse(saved.value.record, entry.value.record));
              if (comparable.some(saved => saved.value.record.completed !== false && Number(saved.value.record.movingTime) > 0
                && Number(saved.value.record.movingTime) <= Number(entry.value.record.movingTime)))
                throw new Error('기존 최고 기록을 이긴 기록만 저장할 수 있습니다.');
              store.put(entry);
              for (const saved of comparable) store.delete(saved.key);
              const removed = new Set(comparable.map(saved => saved.key));
              result = [...request.result.filter(saved => !removed.has(saved.key)), entry];
            } catch (error) { failure = error; tx.abort(); }
          };
        });
      },
      async readAll() {
        const db = await database();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readonly');
          const request = tx.objectStore('records').getAll();
          tx.oncomplete = () => resolve(request.result);
          tx.onerror = () => reject(tx.error || new Error('기록을 읽을 수 없습니다.'));
          tx.onabort = () => reject(tx.error || new Error('기록을 읽을 수 없습니다.'));
        });
      },
      async write(entries, removed = []) {
        const db = await database();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          for (const entry of entries) store.put(entry);
          for (const key of removed) store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('기록을 저장할 수 없습니다.'));
          tx.onabort = () => reject(tx.error || new Error('기록을 저장할 수 없습니다.'));
        });
      },
    };
  }

  function createProfileSession(repository, options = {}) {
    const startMap = options.startMap || (() => Promise.resolve());
    let profiles = repository.getProfiles();
    let selectedProfileId = repository.readLastActiveProfileId();
    let activeProfileId = null;
    let mapBootPromise = null;

    function refreshProfiles() {
      profiles = repository.getProfiles();
      if (!profiles.some(profile => profile.id === selectedProfileId)) selectedProfileId = null;
      if (!profiles.some(profile => profile.id === activeProfileId)) activeProfileId = null;
      return clone(profiles);
    }

    function selectProfile(profileId) {
      if (!profiles.some(profile => profile.id === profileId)) return false;
      selectedProfileId = profileId;
      return true;
    }

    async function activateSelected() {
      if (!selectedProfileId || !profiles.some(profile => profile.id === selectedProfileId)) return false;
      activeProfileId = selectedProfileId;
      if (!mapBootPromise) {
        mapBootPromise = Promise.resolve().then(startMap).catch(error => {
          activeProfileId = null;
          mapBootPromise = null;
          throw error;
        });
      }
      await mapBootPromise;
      repository.writeLastActiveProfileId(activeProfileId);
      return true;
    }

    return {
      refreshProfiles,
      selectProfile,
      activateSelected,
      getProfiles: () => clone(profiles),
      getSelectedProfileId: () => selectedProfileId,
      getActiveProfileId: () => activeProfileId,
    };
  }

  function createProfileController(repository, session, view) {
    let profiles = [];
    let mapShown = false;

    function model() {
      const selectedProfileId = session.getSelectedProfileId();
      return {
        profiles: clone(profiles),
        selectedProfileId,
        canSelect: Boolean(selectedProfileId && profiles.some(profile => profile.id === selectedProfileId)),
        emptyMessage: profiles.length ? '' : '등록된 프로필이 없습니다.',
      };
    }

    function render() {
      const nextModel = model();
      view.render(nextModel);
      return nextModel;
    }

    function refresh() {
      profiles = session.refreshProfiles();
      return render();
    }

    function start() {
      repository.initialize();
      view.showProfileScreen();
      return refresh();
    }

    function returnToSelection() {
      mapShown = false;
      view.showProfileScreen();
      return refresh();
    }

    function selectProfile(profileId) {
      if (!session.selectProfile(profileId)) return false;
      render();
      return true;
    }

    async function confirmSelection() {
      if (!model().canSelect) return false;
      if (!mapShown) {
        mapShown = true;
        view.showMapScreen();
      }
      try {
        return await session.activateSelected();
      } catch (error) {
        mapShown = false;
        view.showProfileScreen();
        throw error;
      }
    }

    function addProfile(name, avatar) {
      const profile = repository.addProfile(name, avatar);
      refresh();
      return profile;
    }

    function updateProfile(profileId, updates) {
      const profile = repository.updateProfile(profileId, updates);
      refresh();
      return profile;
    }

    function deleteProfile(profileId) {
      const deleted = repository.deleteProfile(profileId);
      if (deleted) refresh();
      return deleted;
    }

    return { start, returnToSelection, refresh, selectProfile, confirmSelection, addProfile, updateProfile, deleteProfile };
  }

  return {
    PROFILE_STORE_KEY,
    RECORD_REVISION_KEY,
    PROFILE_SCHEMA_VERSION,
    DEFAULT_AVATAR,
    DEFAULT_SETTINGS,
    recordNameLength,
    createProfileRepository,
    createIndexedRecordStore,
    createProfileSession,
    createProfileController,
  };
});
