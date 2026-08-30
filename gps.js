// 📍 GPS 추적기
if (typeof diagnostic !== 'undefined') {
    diagnostic.add('gps.js 실행 시작', 'load');
}

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

    startTracking(onSuccess, onError) {
        log('시작: GPS 추적');
        if (!navigator.geolocation) {
            onError('이 브라우저는 GPS를 지원하지 않습니다.');
            return;
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const now = Date.now();

                if (this.lastTimestamp) {
                    this.lastUpdateTime = (now - this.lastTimestamp) / 1000;
                } else {
                    this.lastUpdateTime = 1;
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

    stopTracking() {
        log('중지: GPS 추적');
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    reset() {
        this.positions = [];
        this.lastUpdateTime = null;
        this.lastTimestamp = null;
    }
}

const gpsTracker = new GPSTracker();
if (typeof diagnostic !== 'undefined') {
    diagnostic.add('gpsTracker 인스턴스 생성됨', 'ok');
}
