// ⚙️ CONFIG.JS - 애플리케이션 설정

const CONFIG = {
    // 🗺️ 지도 설정
    MAP: {
        centerLat: 37.4979,      // 기본: 서울 강남역
        centerLng: 127.0276,
        initialZoom: 15,
    },

    // 📍 GPS 설정
    GPS: {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
    },

    // 🔑 Kakao API 키
    KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || 'YOUR_KAKAO_API_KEY',
};
