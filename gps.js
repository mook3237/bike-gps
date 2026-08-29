// 📍 GPS 트래커 클래스 (디버깅 에러 추적 버전)

// 🔧 로그 함수
function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 🟢 [GPS LOG] ${message}`, data);
}

class GPSTracker {
    constructor() {
        try {
            log('GPSTracker 생성자 진입');
            this.watchId = null;
            this.positions = [];
            this.lastUpdateTime = null;
            this.lastTimestamp = null;
            this.speeds = [];
            this.targetSpeedReached = false;
            
            // DOM 캐싱 (없을 경우를 대비한 안전 장치 포함)
            this.$targetSpeedInput = document.getElementById('target-speed');
            if (!this.$targetSpeedInput) {
                console.warn('⚠️ [GPS 경고] target-speed 입력 요소를 찾지 못했습니다.');
            }
            
            log('✅ GPSTracker 생성 완료');
        } catch (e) {
            console.error('❌ [GPS 에러] GPSTracker 생성 중 예외 발생:', e);
        }
    }

    // GPS 추적 시작
    startTracking(onSuccess, onError) {
        try {
            log('📍 GPS 추적 시작 시도');

            if (!navigator.geolocation) {
                console.error('❌ [GPS 에러] 이 브라우저는 Geolocation을 지원하지 않습니다.');
                if (onError) onError('이 브라우저는 GPS를 지원하지 않습니다.');
                return;
            }

            if (typeof CONFIG === 'undefined' || !CONFIG.GPS) {
                console.error('❌ [GPS 에러] CONFIG.GPS 설정 객체를 찾을 수 없습니다!');
            }

            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    try {
                        const { latitude, longitude, accuracy } = position.coords;
                        const now = Date.now();

                        // 타이밍 정보 저장 (속도 계산용)
                        if (this.lastTimestamp) {
                            this.lastUpdateTime = (now - this.lastTimestamp) / 1000;
                        } else {
                            this.lastUpdateTime = 1;
                        }
                        this.lastTimestamp = now;

                        const coords = { latitude, longitude, accuracy };
                        this.positions.push(coords);

                        if (typeof onSuccess === 'function') {
                            onSuccess(coords);
                        }
                        
                        // 목표속도 체크 실행
                        this.checkTargetSpeed(position.coords);
                    } catch (innerErr) {
                        console.error('❌ [GPS 에러] watchPosition 콜백 내부 실행 중 에러:', innerErr);
                    }
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
                    console.error('❌ [GPS  geolocation 에러]', errorMsg);
                    if (typeof onError === 'function') onError(errorMsg);
                },
                (typeof CONFIG !== 'undefined' && CONFIG.GPS) ? CONFIG.GPS : { highAccuracy: true }
            );
            log('✅ watchPosition 등록 성공 (watchId:', this.watchId + ')');
        } catch (e) {
            console.error('❌ [GPS 에러] startTracking 실행 중 예외 발생:', e);
        }
    }

    // GPS 추적 중지
    stopTracking() {
        try {
            log('⏹️ GPS 추적 중지 시도');
            if (this.watchId) {
                navigator.geolocation.clearWatch(this.watchId);
                this.watchId = null;
                log('✅ GPS 추적 해제 완료');
            } else {
                log('ℹ️ 중지할 활성 watchId가 없습니다.');
            }
        } catch (e) {
            console.error('❌ [GPS 에러] stopTracking 중 예외 발생:', e);
        }
    }

    // 목표속도 체크
    checkTargetSpeed(coords) {
        try {
            if (!this.$targetSpeedInput) {
                this.$targetSpeedInput = document.getElementById('target-speed');
            }
            const targetSpeed = this.$targetSpeedInput ? parseFloat(this.$targetSpeedInput.value) : 0;
            if (!targetSpeed || targetSpeed <= 0) return;

            if (this.positions.length >= 2) {
                const last = this.positions[this.positions.length - 1];
                const prev = this.positions[this.positions.length - 2];
                
                const distance = this.calculateDistance(
                    prev.latitude, prev.longitude,
                    last.latitude, last.longitude
                );
                
                const speed = (distance / (this.lastUpdateTime || 1)) * 3.6;
                
                if (speed >= 0 && speed < 100) {
                    this.speeds.push(speed);
                    if (this.speeds.length > 100) this.speeds.shift();
                }

                if (speed >= targetSpeed && !this.targetSpeedReached) {
                    this.targetSpeedReached = true;
                    log('🚀 목표속도 도달!');
                    
                    if (typeof bikeNav !== 'undefined' && typeof bikeNav.markTargetReached === 'function') {
                        bikeNav.markTargetReached();
                    }
                } else if (speed < targetSpeed && this.targetSpeedReached) {
                    this.targetSpeedReached = false;
                }
            }
        } catch (e) {
            console.error('❌ [GPS 에러] checkTargetSpeed 실행 중 예외 발생:', e);
        }
    }

    // 거리 계산 (Haversine)
    calculateDistance(lat1, lng1, lat2, lng2) {
        try {
            const R = 6371000;
            const rad = Math.PI / 180;
            const dLat = (lat2 - lat1) * rad;
            const dLng = (lng2 - lng1) * rad;
            
            const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            
            return R * c;
        } catch (e) {
            console.error('❌ [GPS 에러] calculateDistance 계산 중 예외 발생:', e);
            return 0;
        }
    }

    // 초기화
    reset() {
        try {
            log('🔄 GPS Tracker 데이터 리셋');
            this.positions = [];
            this.lastUpdateTime = null;
            this.lastTimestamp = null;
            this.speeds = [];
            this.targetSpeedReached = false;
        } catch (e) {
            console.error('❌ [GPS 에러] reset 실행 중 예외 발생:', e);
        }
    }
}

let gpsTracker = null;
try {
    gpsTracker = new GPSTracker();
} catch (e) {
    console.error('❌ [GPS 에러] gpsTracker 인스턴스 생성 실패:', e);
}
