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
        this.speeds = [];
        this.targetSpeedReached = false;
        
        // DOM 캐싱
        this.$targetSpeedInput = document.getElementById('target-speed');
        
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
                
                // 🆕 목표속도 체크
                this.checkTargetSpeed(position.coords);
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

    // 🆕 목표속도 체크
    checkTargetSpeed(coords) {
        const targetSpeed = parseFloat(this.$targetSpeedInput.value);
        if (!targetSpeed || targetSpeed <= 0) return;

        // 현재 속도 계산 (m/s -> km/h)
        if (this.positions.length >= 2) {
            const last = this.positions[this.positions.length - 1];
            const prev = this.positions[this.positions.length - 2];
            
            const distance = this.calculateDistance(
                prev.latitude, prev.longitude,
                last.latitude, last.longitude
            );
            
            const speed = (distance / this.lastUpdateTime) * 3.6; // m/s to km/h
            
            if (speed >= 0 && speed < 100) {
                this.speeds.push(speed);
                if (this.speeds.length > 100) this.speeds.shift();
            }

            // 목표속도 도달 체크
            if (speed >= targetSpeed && !this.targetSpeedReached) {
                this.targetSpeedReached = true;
                log('🚀 목표속도 도달!');
                
                // 네비게이션 마커 색상 변경
                if (typeof bikeNav !== 'undefined') {
                    bikeNav.markTargetReached();
                }
            } else if (speed < targetSpeed && this.targetSpeedReached) {
                this.targetSpeedReached = false;
            }
        }
    }

    // 거리 계산 (Haversine)
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad;
        const dLng = (lng2 - lng1) * rad;
        
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }

    // 초기화
    reset() {
        this.positions = [];
        this.lastUpdateTime = null;
        this.lastTimestamp = null;
        this.speeds = [];
        this.targetSpeedReached = false;
    }
}

const gpsTracker = new GPSTracker();
