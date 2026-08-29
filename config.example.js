// ⚙️ 설정 파일 (깃허브 업로드용 - 키 미포함)
try {
    const CONFIG = {
        // GitHub Actions 빌드 시 치환되거나 런타임에 주입됨
        KAKAO_MAP_API_KEY: window.__KAKAO_API_KEY__ || 'YOUR_KAKAO_API_KEY',
        MAP: {
            initialZoom: 3,
            centerLat: 37.4979,
            centerLng: 127.0276,
            ZOOM_LEVELS: { SLOW: 1, FAST: 2 }
        },
        GPS: { highAccuracy: true, timeout: 10000, maximumAge: 0 },
    };

    const DEBUG = true;

    function log(message, data = '') {
        if (DEBUG) {
            console.log(`[${new Date().toLocaleTimeString()}] 🟢 [LOG] ${message}`, data);
        }
    }
    console.log('✅ config.js 로드 완료');
} catch (e) {
    console.error('❌ config.js 실행 중 에러 발생:', e);
}
