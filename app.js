// 🎯 메인 앱 클래스
class BikeGPSApp {
    constructor() {
        log('BikeGPSApp 생성됨');
        
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusEl = document.getElementById('status');
        this.latitudeEl = document.getElementById('latitude');
        this.longitudeEl = document.getElementById('longitude');
        this.accuracyEl = document.getElementById('accuracy');

        // 버튼 이벤트
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.stopBtn.addEventListener('click', () => this.handleStop());

        log('✅ 앱 생성 완료');
    }

    // 🗺️ 지도 초기화
    initMap() {
        log('🗺️ 지도 초기화');
        mapManager.initMap();
        this.updateStatus('준비 완료! 버튼을 클릭하세요.');
    }

    // ▶️ 추적 시작
    handleStart() {
        log('▶️ 추적 시작 버튼 클릭');
        
        // ⭐️ 줌 21로 명확하게 설정 (매우 확대!)
        if (mapManager.map) {
            mapManager.map.setLevel(3);
        }
        
        // 초기화
        mapManager.reset();
        gpsTracker.reset();

        // GPS 시작
        gpsTracker.startTracking(
            (coords) => this.onLocationUpdate(coords),
            (error) => this.onGPSError(error)
        );

        // UI
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.updateStatus('📍 위치 추적 중...');
    }

    // ⏹️ 추적 중지
    handleStop() {
        log('⏹️ 추적 중지 버튼 클릭');
        
        gpsTracker.stopTracking();

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.updateStatus('✅ 추적 완료');

        mapManager.fitBounds();
    }

    // 📍 위치 업데이트
    onLocationUpdate(coords) {
        const { latitude, longitude, accuracy } = coords;

        this.latitudeEl.textContent = latitude.toFixed(6);
        this.longitudeEl.textContent = longitude.toFixed(6);
        this.accuracyEl.textContent = Math.round(accuracy) + ' m';

        mapManager.updateCurrentMarker(coords);
        mapManager.updatePolyline();

        this.updateStatus(
            `📍 정확도: ${Math.round(accuracy)}m | 포인트: ${gpsTracker.positions.length}개`
        );
    }

    // ❌ GPS 오류
    onGPSError(error) {
        log('❌ GPS 오류', error);
        this.updateStatus('❌ 오류: ' + error);
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    // 💬 상태 메시지
    updateStatus(message) {
        this.statusEl.textContent = message;
    }
}

// ====== 앱 시작 (kakao.maps.load 콜백에서!) ======
log('app.js 로드됨');

// ⭐️ 모든 초기화를 kakao.maps.load 콜백 내에서 수행
kakao.maps.load(function() {
    log('✅ kakao.maps.load 콜백 실행!');
    
    // DOM 준비 대기
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            log('✅ DOM 로드 완료');
            const app = new BikeGPSApp();
            app.initMap();
        });
    } else {
        log('✅ DOM 이미 로드됨');
        const app = new BikeGPSApp();
        app.initMap();
    }
});
