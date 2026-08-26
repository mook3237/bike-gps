// ⚙️ 설정
// 
// ⚠️ 주의: 로컬에서는 여기에 본인의 API 키를 입력하세요.
// GitHub에는 API 키가 올라가지 않습니다. (.gitignore로 제외)

const CONFIG = {
    // 🔑 카카오 API 키
    // 로컬 테스트: 아래에 본인의 키 입력
    // GitHub Actions: Secrets에 설정
    KAKAO_MAP_API_KEY: process.env.KAKAO_MAP_API_KEY,  // ← 로컬에서 본인 키 입력
    
    // 🗺️ 지도 설정
    MAP: {
        initialZoom: 3,  // 줌 레벨 (낮을수록 확대 - 동/구 수준)
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

// 🔧 디버그 로그
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}
