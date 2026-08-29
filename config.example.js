// ⚙️ 설정 파일

const CONFIG = {
    // 🔑 카카오 API 키
    KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || 'YOUR_KAKAO_API_KEY',
    
    // 🗺️ 지도 설정 (모두 zoom 3으로 통일)
    MAP: {
        initialZoom: 3,  // ✅ 줌 레벨 3 (전체 지도)
        centerLat: 37.4979,  // 서울 강남역
        centerLng: 127.0276,
    },
    
    // 📍 GPS 설정
    GPS: {
        highAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
    },
};

// 🔧 디버그 로그
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}

log('✅ CONFIG 로드됨:', CONFIG);
