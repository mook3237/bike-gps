// 🔍 진단 시스템과 호환
if (typeof diagnostic !== 'undefined') {
    diagnostic.add('CONFIG 로드 시작', 'load');
}

const CONFIG = {
    KAKAO_MAP_API_KEY: 'YOUR_KAKAO_API_KEY_HERE',

    MAP: {
        centerLat: 37.5665,
        centerLng: 126.9780,
        initialZoom: 3
    }
};
    GPS: {
        highAccuracy: true,
        timeout: 5000,
        maximumAge: 2000,
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

