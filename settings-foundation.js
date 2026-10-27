(function exposeSettingsFoundation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideMateSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSettingsFoundationApi() {
  const PHOTO_DB = 'ridemate-profile-photos';
  const PHOTO_STORE = 'photos';
  const METER_PER_MILE = 1609.344;

  function formatDistance(meters, unit = 'km') {
    const value = Math.max(0, Number(meters) || 0);
    if (unit === 'mi') return `${(value / METER_PER_MILE).toFixed(value >= METER_PER_MILE * 10 ? 0 : 1)} mi`;
    const rounded = Math.round(value);
    return rounded < 1000 ? `${rounded} m` : `${(value / 1000).toFixed(1)} km`;
  }

  function formatSpeed(metersPerSecond, unit = 'km') {
    const value = Math.max(0, Number(metersPerSecond) || 0);
    return unit === 'mi' ? `${(value * 2.2369362921).toFixed(1)} mph` : `${(value * 3.6).toFixed(1)} km/h`;
  }

  function formatPace(secondsPerKilometer, unit = 'km') {
    const value = Number(secondsPerKilometer);
    const suffix = unit === 'mi' ? 'min/mi' : 'min/km';
    if (!Number.isFinite(value) || value <= 0) return `--:-- ${suffix}`;
    const seconds = Math.round(unit === 'mi' ? value * METER_PER_MILE / 1000 : value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} ${suffix}`;
  }

  function formatClock(value, preference = 'device', locale, timeZone) {
    const options = { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) };
    if (preference === '12h') options.hour12 = true;
    if (preference === '24h') options.hour12 = false;
    return new Date(value).toLocaleTimeString(locale, options);
  }

  function createProfilePhotoStore(indexedDb = globalThis.indexedDB) {
    let databasePromise = null;
    function database() {
      if (!indexedDb) return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다.'));
      if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(PHOTO_DB, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(PHOTO_STORE)) request.result.createObjectStore(PHOTO_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('프로필 사진 저장소를 열 수 없습니다.'));
      });
      return databasePromise;
    }
    async function transaction(mode, action) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, mode);
        const request = action(tx.objectStore(PHOTO_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('프로필 사진 저장에 실패했습니다.'));
      });
    }
    return {
      async put(blob, photoId = `photo-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`) {
        await transaction('readwrite', store => store.put(blob, photoId));
        return photoId;
      },
      get(photoId) { return transaction('readonly', store => store.get(photoId)); },
      delete(photoId) { return photoId ? transaction('readwrite', store => store.delete(photoId)) : Promise.resolve(); },
    };
  }

  function calculateProfilePhotoCrop(sourceWidth, sourceHeight, frameSize, zoom = 1, offsetX = 0, offsetY = 0) {
    const width = Math.max(1, Number(sourceWidth) || 1);
    const height = Math.max(1, Number(sourceHeight) || 1);
    const frame = Math.max(1, Number(frameSize) || 1);
    const zoomLevel = Math.max(1, Math.min(4, Number(zoom) || 1));
    const scale = Math.max(frame / width, frame / height) * zoomLevel;
    const renderedWidth = width * scale;
    const renderedHeight = height * scale;
    const maxOffsetX = Math.max(0, (renderedWidth - frame) / 2);
    const maxOffsetY = Math.max(0, (renderedHeight - frame) / 2);
    const clampedX = maxOffsetX ? Math.max(-maxOffsetX, Math.min(maxOffsetX, Number(offsetX) || 0)) : 0;
    const clampedY = maxOffsetY ? Math.max(-maxOffsetY, Math.min(maxOffsetY, Number(offsetY) || 0)) : 0;
    return {
      scale, renderedWidth, renderedHeight, maxOffsetX, maxOffsetY,
      offsetX: clampedX, offsetY: clampedY,
      sourceX: (renderedWidth / 2 - frame / 2 - clampedX) / scale,
      sourceY: (renderedHeight / 2 - frame / 2 - clampedY) / scale,
      sourceSize: frame / scale,
    };
  }

  function renderProfilePhotoCrop(source, crop, size = 384) {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const sourceSize = Math.max(1, Math.min(Number(crop?.sourceSize) || Math.min(width, height), width, height));
    const sourceX = Math.max(0, Math.min(width - sourceSize, Number(crop?.sourceX) || 0));
    const sourceY = Math.max(0, Math.min(height - sourceSize, Number(crop?.sourceY) || 0));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(source, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 처리할 수 없습니다.')), 'image/jpeg', .82));
  }

  async function resizeProfilePhoto(file, size = 384) {
    if (!file?.type?.startsWith('image/')) throw new Error('이미지 파일을 선택해주세요.');
    let source;
    let cleanup = () => {};
    if (typeof createImageBitmap === 'function') source = await createImageBitmap(file);
    else {
      const url = URL.createObjectURL(file);
      cleanup = () => URL.revokeObjectURL(url);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('사진을 불러올 수 없습니다.'));
        image.src = url;
      });
    }
    try {
      const width = source.width || source.naturalWidth;
      const height = source.height || source.naturalHeight;
      const crop = Math.min(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(source, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, size, size);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 처리할 수 없습니다.')), 'image/jpeg', .82));
    } finally {
      source.close?.();
      cleanup();
    }
  }

  function createWakeLockController({ navigator: nav = globalThis.navigator, document: doc = globalThis.document } = {}) {
    let enabled = false;
    let sentinel = null;
    async function release() {
      const current = sentinel;
      sentinel = null;
      if (current) try { await current.release(); } catch {}
    }
    async function sync() {
      if (!enabled || doc?.visibilityState === 'hidden') {
        await release();
        return false;
      }
      if (sentinel) return true;
      if (!nav?.wakeLock?.request) return false;
      try {
        const acquired = await nav.wakeLock.request('screen');
        sentinel = acquired;
        acquired.addEventListener?.('release', () => { if (sentinel === acquired) sentinel = null; });
        return true;
      } catch {
        sentinel = null;
        return false;
      }
    }
    async function setEnabled(value) {
      enabled = value === true;
      return sync();
    }
    doc?.addEventListener?.('visibilitychange', sync);
    return { setEnabled, sync, release, isActive: () => Boolean(sentinel) };
  }

  return { formatDistance, formatSpeed, formatPace, formatClock, createProfilePhotoStore, calculateProfilePhotoCrop, renderProfilePhotoCrop, resizeProfilePhoto, createWakeLockController };
});
