// 📍 GPS 관련 로직
// 위치 추적, 권한 요청 등을 담당합니다

class GPSTracker {
    constructor() {
        this.watchId = null;  // GPS 추적 ID
        this.isTracking = false;  // 추적 중인지 여부
        this.currentPosition = null;  // 현재 위치
        this.positions = [];  // 모든 위치 데이터 저장
        this.callbacks = {};  // 콜백 함수들 저장
    }

    // 📍 GPS 권한 확인 및 추적 시작
    startTracking(onLocationUpdate, onError) {
        log('GPS 추적 시작 요청');

        // 콜백 저장
        this.callbacks.onLocationUpdate = onLocationUpdate;
        this.callbacks.onError = onError;

        // GPS 사용 가능 확인
        if (!navigator.geolocation) {
            this.callbacks.onError('이 브라우저는 GPS를 지원하지 않습니다.');
            return;
        }

        // GPS 추적 시작
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handlePositionSuccess(position),
            (error) => this.handlePositionError(error),
            CONFIG.GPS
        );

        this.isTracking = true;
        log('GPS 추적 시작됨');
    }

    // ✅ GPS 위치 수신 성공
    handlePositionSuccess(position) {
        const { latitude, longitude, accuracy } = position.coords;
        
        // 현재 위치 저장
        this.currentPosition = {
            latitude,
            longitude,
            accuracy,
            timestamp: new Date().getTime(),
        };

        // 경로 배열에 추가
        this.positions.push(this.currentPosition);

        log('위치 업데이트', {
            lat: latitude.toFixed(6),
            lng: longitude.toFixed(6),
            acc: accuracy.toFixed(0) + 'm'
        });

        // 콜백 실행
        if (this.callbacks.onLocationUpdate) {
            this.callbacks.onLocationUpdate(this.currentPosition);
        }
    }

    // ❌ GPS 위치 수신 실패
    handlePositionError(error) {
        let errorMsg = '';

        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMsg = '위치 권한이 거부되었습니다. 설정에서 허용해주세요.';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMsg = '위치 정보를 사용할 수 없습니다.';
                break;
            case error.TIMEOUT:
                errorMsg = '위치 정보 수신 시간 초과';
                break;
            default:
                errorMsg = '알 수 없는 오류: ' + error.message;
        }

        log('GPS 오류', errorMsg);

        if (this.callbacks.onError) {
            this.callbacks.onError(errorMsg);
        }
    }

    // 🛑 GPS 추적 중지
    stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
            this.isTracking = false;
            log('GPS 추적 중지됨');
        }
    }

    // 📍 현재 위치 반환
    getCurrentPosition() {
        return this.currentPosition;
    }

    // 📊 모든 기록된 위치 반환
    getAllPositions() {
        return this.positions;
    }

    // 🔄 초기화
    reset() {
        this.stopTracking();
        this.positions = [];
        this.currentPosition = null;
        log('GPS 데이터 초기화됨');
    }
}

// 전역 GPS 트래커 객체
const gpsTracker = new GPSTracker();
