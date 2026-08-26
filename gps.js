// 📍 GPS 추적
class GPSTracker {
    constructor() {
        this.watchId = null;
        this.positions = [];
        this.isTracking = false;
        log('GPSTracker 생성됨');
    }

    startTracking(onSuccess, onError) {
        if (!navigator.geolocation) {
            onError('GPS 미지원');
            return;
        }

        this.isTracking = true;
        this.positions = [];
        log('GPS 시작');

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                this.positions.push({ latitude, longitude, accuracy });
                onSuccess(position.coords);
            },
            (error) => {
                log('GPS 오류', error.message);
                onError(error.message);
            },
            CONFIG.GPS
        );
    }

    stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
            this.isTracking = false;
            log('GPS 중지');
        }
    }

    reset() {
        this.positions = [];
    }
}

const gpsTracker = new GPSTracker();
