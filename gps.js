// 📍 GPS 트래커 클래스

// 🔧 로그 함수 (config.js 로드 전에 필요)
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
        log('GPSTracker 생성됨');
    }

    // GPS 추적 시작
    startTracking(onSuccess, onError) {
        log('📍 GPS 추적 시작');

        if (!navigator.geolocation) {
            onError('이 브라우저는 GPS를 지원하지 않습니다.');
            return;
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const now = Date.now();

                // 타이밍 정보 저장 (속도 계산용)
                if (this.lastTimestamp) {
                    this.lastUpdateTime = (now - this.lastTimestamp) / 1000; // 초 단위로 변환
                } else {
                    this.lastUpdateTime = 1; // 첫 업데이트는 1초로 초기화
                }
                this.lastTimestamp = now;

                const coords = { latitude, longitude, accuracy };
                this.positions.push(coords);

                onSuccess(coords);
            },
            (error) => {
                let errorMsg = '';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = 'GPS 권한이 거부되었습니다.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = 'GPS 신호를 수신할 수 없습니다.';
                        break;
                    case error.TIMEOUT:
                        errorMsg = 'GPS 신호 수신 시간 초과.';
                        break;
                    default:
                        errorMsg = '알 수 없는 오류: ' + error.message;
                }
                onError(errorMsg);
            },
            CONFIG.GPS
        );
    }

    // GPS 추적 중지
    stopTracking() {
        log('⏹️ GPS 추적 중지');
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    // 초기화
    reset() {
        this.positions = [];
        this.lastUpdateTime = null;
        this.lastTimestamp = null;
    }
}

const gpsTracker = new GPSTracker();
