// ⚙️ 설정
const CONFIG = {
    KAKAO_MAP_API_KEY: process.env.KAKAO_MAP_API_KEY,
    
    MAP: {
        initialZoom: 21,  // ⭐️ 줌 3 (매우 확대 - 동/구 수준)
        centerLat: 37.4979,
        centerLng: 127.0276,
    },
    
    GPS: {
        highAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
    },
};

// 🔧 로그
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}
