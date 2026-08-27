// ⚙️ 설정 샘플 (config.example.js)
//
// 사용 방법:
// 1. 이 파일을 config.js로 복사 (cp config.example.js config.js)
// 2. config.js에서 YOUR_KAKAO_API_KEY_HERE를 본인의 실제 카카오 API 키로 변경
// 3. config.js 파일은 .gitignore에 추가하여 깃허브에 올라가지 않도록 설정
//

const CONFIG = {
    // 🔑 카카오 API 키 (https://developers.kakao.com 에서 발급)
    // 로컬 테스트: 여기에 본인의 JavaScript 키 입력
    KAKAO_MAP_API_KEY: 'YOUR_KAKAO_API_KEY_HERE',
    
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

// 🔧 디버그 로그
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}
