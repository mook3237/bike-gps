/*
 * GitHub Pages build template.
 *
 * IMPORTANT:
 * This value is replaced during GitHub Actions deployment from:
 * Settings -> Secrets and variables -> Actions -> KAKAO_MAP_API_KEY
 *
 * Do not put your real Kakao key in this file and commit it.
 */
window.APP_CONFIG = {
  KAKAO_MAP_API_KEY: '__KAKAO_MAP_API_KEY__',

  MAP: {
    centerLat: 37.4979,
    centerLng: 127.0276,
    initialLevel: 5
  },

  GPS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 2000
  },

  ROUTING: {
    VALHALLA_URL: 'https://valhalla1.openstreetmap.de/route',
    CLIENT_ID: 'bike-gps-tracker',
    DEFAULT_BICYCLE_TYPE: 'hybrid',
    MAX_ROUTE_REFRESH_MS: 15000
  }
};
