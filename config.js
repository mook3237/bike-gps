// ⚙️ 설정 샘플 (로컬 테스트용)
//
// 사용 방법:
// 1. 이 파일을 config.js로 복사
// 2. config.js에서 YOUR_KAKAO_API_KEY_HERE를 본인의 키로 변경
// 3. 저장!
//
// cp config.example.js config.js
// # config.js 편집 (본인 키 입력)

const CONFIG = {
    // 🔑 카카오 API 키 (https://developers.kakao.com에서 발급)
    // 로컬 테스트: 여기에 본인의 JavaScript 키 입력
    // GitHub 배포: Repository Secrets에 KAKAO_MAP_API_KEY 설정
    KAKAO_MAP_API_KEY: 'KAKAO_API_KEY',
    
    // 🗺️ 지도 설정
    MAP: {
        initialZoom: 3,  // 줌 레벨 (1-21, 낮을수록 확대)
        centerLat: 37.4979,
        centerLng: 127.0276,
    },
    
    // 📍 GPS 설정
    GPS: {
        highAccuracy: true,  // 높은 정확도
        timeout: 10000,      // 10초
        maximumAge: 0,       // 캐시 안 함
    },
};

// 🔧 디버그 로그
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}
