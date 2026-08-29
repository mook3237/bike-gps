// ⚙️ DEBUG: addDebug 함수 호환
if (typeof addDebug === 'undefined') {
    window.addDebug = function(msg) { console.log(msg); };
}
addDebug('📦 config.js 로드 시작');

// ⚙️ 설정
const CONFIG = {
    // 🔑 카카오 API 키 (GitHub 환경 변수 또는 직접 입력)
    KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || 'YOUR_KAKAO_API_KEY',
    
    // 🗺️ 지도 설정
    MAP: {
        initialZoom: 3,  // 줌 레벨 (낮을수록 확대)
        centerLat: 37.4979,
        centerLng: 127.0276,
    },
    
    // 📍 GPS 설정
    GPS: {
        highAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
    },
};

addDebug('✅ CONFIG 로드 완료: ' + JSON.stringify(CONFIG.MAP));
