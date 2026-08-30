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

    startTracking(onSuccess, onError) {
        log('GPS 추적 시작');
        if (!navigator.geolocation) {
            onError('GPS 미지원');
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
                        errorMsg = 'GPS 거부됨';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = 'GPS 신호 없음';
                        break;
                    case error.TIMEOUT:
                        errorMsg = 'GPS 타임아웃';
                        break;
                    default:
                        errorMsg = error.message;
                }
                onError(errorMsg);
            },
            CONFIG.GPS
        );
    }

    stopTracking() {
        log('GPS 추적 중지');
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
    diagnostic.add('gpsTracker 생성됨');
}
