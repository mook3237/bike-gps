// 🔍 진단 시스템과 호환
if (typeof diagnostic !== 'undefined') {
    diagnostic.add('CONFIG 로드 시작', 'load');
}

const CONFIG = {
    KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || '',
    MAP: {
        initialZoom: 3,
        centerLat: 37.4979,
        centerLng: 127.0276,
    },
    GPS: {
        highAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
    },
};

if (typeof diagnostic !== 'undefined') {
    diagnostic.add(
        'CONFIG 완료: API=' + (CONFIG.KAKAO_MAP_API_KEY ? 'O' : 'X') + 
        ' | Zoom=' + CONFIG.MAP.initialZoom,
        'ok'
    );
}

const DEBUG = true;
function log(msg, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${msg}`, data);
    }
}

log('✅ config.js 로드 완료');

