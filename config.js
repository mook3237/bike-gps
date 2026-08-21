// ⚙️ 설정 파일
// 여기서 API 키와 기본값들을 관리합니다

const CONFIG = {
    // 🔑 구글맵 API 키 
    // Vercel 환경 변수에서 가져옴 (안전!)
    GOOGLE_MAP_API_KEY: process.env.GOOGLE_MAP_API_KEY,
    
    // 🗺️ 지도 초기 설정
    MAP: {
        initialZoom: 16,  // 줌 레벨 (1-20, 작을수록 멀리보임)
        centerLat: 37.4979,  // 서울 기본 좌표
        centerLng: 127.0276,
        tileZoom: 18,  // 추적 중 자동 줌
    },
    
    // 📍 GPS 설정
    GPS: {
        highAccuracy: true,  // 높은 정확도 사용
        timeout: 10000,  // 10초 내 응답
        maximumAge: 0,  // 캐시 안 함 (항상 최신)
    },
    
    // 📊 UI 갱신 간격
    UPDATE_INTERVAL: 1000,  // 1초마다 화면 갱신
};

// 디버그 모드 (콘솔에 로그 표시)
const DEBUG = true;

function log(message, data = '') {
    if (DEBUG) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`, data);
    }
}
