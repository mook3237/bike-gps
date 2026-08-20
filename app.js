// 🎯 메인 앱 로직
// 버튼 이벤트, UI 업데이트, 전체 흐름을 담당합니다

class BikeGPSApp {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusEl = document.getElementById('status');
        this.latitudeEl = document.getElementById('latitude');
        this.longitudeEl = document.getElementById('longitude');
        this.accuracyEl = document.getElementById('accuracy');

        this.init();
    }

    // 🚀 앱 초기화
    init() {
        log('앱 초기화 중...');

        // 1. 지도 초기화
        mapManager.initMap();

        // 2. 버튼 이벤트 연결
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.stopBtn.addEventListener('click', () => this.handleStop());

        // 3. 초기 상태 업데이트
        this.updateStatus('준비 완료. 버튼을 클릭하세요.');

        log('앱 초기화 완료');
    }

    // ▶️ 추적 시작 버튼 클릭
    handleStart() {
        log('추적 시작 버튼 클릭됨');

        // 초기화
        mapManager.reset();
        gpsTracker.reset();

        // GPS 추적 시작
        gpsTracker.startTracking(
            (position) => this.onLocationUpdate(position),
            (error) => this.onGPSError(error)
        );

        // UI 업데이트
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.updateStatus('📍 위치 추적 중...');
    }

    // ⏹️ 추적 중지 버튼 클릭
    handleStop() {
        log('추적 중지 버튼 클릭됨');

        // GPS 추적 중지
        gpsTracker.stopTracking();

        // UI 업데이트
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.updateStatus('✅ 추적 완료. 다시 시작할 수 있습니다.');

        // 지도 자동 줌 조정
        mapManager.fitBounds();
    }

    // 📍 위치 업데이트 콜백
    onLocationUpdate(position) {
        const { latitude, longitude, accuracy } = position;

        // UI 업데이트
        this.latitudeEl.textContent = latitude.toFixed(6);
        this.longitudeEl.textContent = longitude.toFixed(6);
        this.accuracyEl.textContent = accuracy.toFixed(0) + ' m';

        // 지도 업데이트
        mapManager.updateCurrentMarker(position);
        mapManager.updatePolyline();

        // 상태 메시지
        this.updateStatus(
            `📍 정확도: ${accuracy.toFixed(0)}m | 포인트: ${gpsTracker.positions.length}개`
        );
    }

    // ❌ GPS 오류 처리
    onGPSError(error) {
        log('GPS 오류', error);
        this.updateStatus('❌ 오류: ' + error);
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    // 💬 상태 메시지 업데이트
    updateStatus(message) {
        this.statusEl.textContent = message;
        log('상태 업데이트', message);
    }
}

// 📄 DOM이 모두 로드되면 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    log('=== 자전거 GPS 트래커 시작 ===');
    
    // API 키 확인
    if (CONFIG.GOOGLE_MAP_API_KEY === 'YOUR_GOOGLE_MAP_API_KEY') {
        alert('⚠️ 구글맵 API 키를 설정해주세요!\n\nconfig.js 파일의 GOOGLE_MAP_API_KEY를 수정하세요.');
        return;
    }

    const app = new BikeGPSApp();
});
