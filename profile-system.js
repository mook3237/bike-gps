(function exposeProfileSystem(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfileSystemApi() {
  const PROFILE_STORE_KEY = 'ridemate_profile_store_v1';
  const PROFILE_SCHEMA_VERSION = 1;
  const LEGACY_RECENT_KEY = 'ridemate_recent_searches';
  const LEGACY_RIDES_KEY = 'ridemate_rides';
  const DEFAULT_AVATAR = Object.freeze({ type: 'icon', iconId: 'rider' });
  const DEFAULT_SETTINGS = Object.freeze({ distanceUnit: 'km', keepScreenAwake: false, saveShortRides: false, clockFormat: 'device' });

  const clone = value => JSON.parse(JSON.stringify(value));

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
      keepScreenAwake: settings.keepScreenAwake === true,
      saveShortRides: settings.saveShortRides === true,
      clockFormat: ['12h', '24h'].includes(settings.clockFormat) ? settings.clockFormat : 'device',
      ...(settings.dashboard && typeof settings.dashboard === 'object' ? { dashboard: clone(settings.dashboard) } : {}),
    };
  }

  function createProfileRepository(storage, options = {}) {
    if (!storage?.getItem || !storage?.setItem) throw new Error('프로필 저장소가 필요합니다.');
    const createId = options.createId || defaultCreateId;
    const now = options.now || (() => new Date().toISOString());
    const onPhotoRemoved = typeof options.onPhotoRemoved === 'function' ? options.onPhotoRemoved : () => {};
    let currentStore = null;

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
        currentStore = parsed;
        return clone(currentStore);
      }

      const id = createId();
      const timestamp = now();
      const recent = readLegacyArray(storage, LEGACY_RECENT_KEY);
      const rides = readLegacyArray(storage, LEGACY_RIDES_KEY);
      const data = emptyProfileData();
      data.places.recentSearches = recent.items;
      data.rides = rides.items;
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
        migration: {
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
      return clone(data);
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
      const next = clone(store);
      next.profiles = next.profiles.filter(profile => profile.id !== profileId);
      delete next.dataByProfileId[profileId];
      if (next.lastActiveProfileId === profileId) delete next.lastActiveProfileId;
      persist(next);
      if (removedProfile.avatar?.type === 'photo') onPhotoRemoved(removedProfile.avatar.photoId);
      return true;
    }

    function readSettings(profileId) {
      return normalizeSettings(getProfileData(profileId).settings);
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
      const data = getProfileData(profileId);
      return Array.isArray(data.places?.recentSearches) ? data.places.recentSearches.slice(0, 10) : [];
    }

    function readMyPlaces(profileId) {
      const places = getProfileData(profileId).places || {};
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
      const next = clone(store);
      const rides = Array.isArray(next.dataByProfileId[profileId].rides) ? next.dataByProfileId[profileId].rides : [];
      const storedRide = clone(ride);
      if (options.retainDetailed !== true) delete storedRide.detailedSamples;
      next.dataByProfileId[profileId].rides = [storedRide, ...rides];
      persist(next);
      return clone(next.dataByProfileId[profileId].rides);
    }

    function readRides(profileId) {
      const data = getProfileData(profileId);
      return Array.isArray(data.rides) ? data.rides.slice() : [];
    }

    return {
      initialize,
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
    PROFILE_SCHEMA_VERSION,
    DEFAULT_AVATAR,
    DEFAULT_SETTINGS,
    createProfileRepository,
    createProfileSession,
    createProfileController,
  };
});
