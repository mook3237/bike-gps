// ========================================
// 📍 GPS 트래커
// ========================================

function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}

class GPSTracker {
    constructor() {
        this.watchId = null;
        this.positions = [];
        this.lastUpdateTime = null;
        this.lastTimestamp = null;

        log('📍 GPSTracker 생성됨');
    }

    // ========================================
    // GPS 추적 시작
    // ========================================
    startTracking(onSuccess, onError) {
        log('📍 GPS 추적 시작');

        if (!navigator.geolocation) {
            const message = '이 브라우저는 위치 정보를 지원하지 않습니다.';
            log('❌', message);

            if (typeof onError === 'function') {
                onError(message, { code: 0 });
            }

            return;
        }

        // 모바일 실사용에서는 HTTPS 필요
        if (!window.isSecureContext) {
            const message =
                '모바일 기기에서 GPS를 사용하려면 HTTPS 연결이 필요합니다.';

            log('⚠️', message);

            if (typeof onError === 'function') {
                onError(message, { code: 0 });
            }

            return;
        }

        // 기존 watch가 있으면 제거
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        // ========================================
        // 위치 수신 성공
        // ========================================
        const handlePosition = (position) => {
            const {
                latitude,
                longitude,
                accuracy,
                speed,
                altitude,
                heading
            } = position.coords;

            const now = Date.now();

            if (this.lastTimestamp !== null) {
                this.lastUpdateTime =
                    (now - this.lastTimestamp) / 1000;
            } else {
                this.lastUpdateTime = 0;
            }

            this.lastTimestamp = now;

            const coords = {
                latitude,
                longitude,
                accuracy,
                speed: Number.isFinite(speed) ? speed : null,
                altitude: Number.isFinite(altitude) ? altitude : null,
                heading: Number.isFinite(heading) ? heading : null,
                timestamp: position.timestamp
            };

            this.positions.push(coords);

            log('✅ GPS 위치 수신', {
                latitude: latitude.toFixed(6),
                longitude: longitude.toFixed(6),
                accuracy: Math.round(accuracy),
                speed: coords.speed
            });

            if (typeof onSuccess === 'function') {
                onSuccess(coords);
            }
        };

        // ========================================
        // GPS 오류
        // ========================================
        const handleError = (error) => {
            log('⚠️ GPS 오류', {
                code: error.code,
                message: error.message
            });

            let message = 'GPS 오류가 발생했습니다.';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    message = 'GPS 권한이 거부되었습니다.';
                    break;

                case error.POSITION_UNAVAILABLE:
                    message =
                        '현재 위치를 확인할 수 없습니다. GPS 신호를 기다리는 중입니다.';
                    break;

                case error.TIMEOUT:
                    message =
                        'GPS 신호 수신 시간이 초과되었습니다. 계속 재시도합니다.';
                    break;
            }

            if (typeof onError === 'function') {
                onError(message, error);
            }

            // 중요:
            // TIMEOUT / POSITION_UNAVAILABLE가 발생해도
            // watchPosition을 종료하지 않습니다.
        };

        // ========================================
        // GPS 설정
        // ========================================
        const gpsConfig = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 2000
        };

        log('⚙️ GPS 설정', gpsConfig);

        // ========================================
        // 실시간 GPS 추적
        // ========================================
        this.watchId = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            gpsConfig
        );

        log('👀 GPS watch 시작:', this.watchId);
    }

    // ========================================
    // GPS 추적 중지
    // ========================================
    stopTracking() {
        log('⏹️ GPS 추적 중지');

        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;

            log('✅ GPS watch 제거 완료');
        }
    }

    // ========================================
    // GPS 데이터 초기화
    // ========================================
    reset() {
        this.positions = [];
        this.lastUpdateTime = null;
        this.lastTimestamp = null;

        log('🔄 GPS 데이터 초기화');
    }
}

// ========================================
// ⭐ 전역 GPS 트래커 생성
// ========================================
const gpsTracker = new GPSTracker();

log('✅ gpsTracker 생성 완료');
