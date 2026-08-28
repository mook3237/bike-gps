// ⚙️ GitHub 배포용 설정
const CONFIG = {
    // 🔑 GitHub Secrets에서 주입된 키 또는 전역 윈도우 객체에서 가져옴
    KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || '',
    
    // 🗺️ 지도 설정
    MAP: {
        initialZoom: 1,  // 기본 초기 줌 레벨 (카카오맵: 1=최대확대)
        centerLat: 37.4979,
        centerLng: 127.0276,
        // 🚀 속도별 자동 줌 레벨 설정 (30km/h 기준)
        ZOOM_LEVELS: {
            SLOW: 1,  // 30km/h 미만 시 (확대)
            FAST: 2   // 30km/h 이상 시 (축소)
        }
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
