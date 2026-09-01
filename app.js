// 🎯 메인 앱 클래스
class BikeGPSApp {
    constructor() {
        log('BikeGPSApp 생성됨');

        // ═══════════════════ UI 요소 ═══════════════════
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.saveBtn = document.getElementById('saveBtn');

        // 통계 (큰 글씨)
        this.elapsedTimeEl = document.getElementById('elapsed-time');
        this.currentSpeedEl = document.getElementById('current-speed');

        // 상세 정보
        this.avgSpeedEl = document.getElementById('avg-speed');
        this.maxSpeedEl = document.getElementById('max-speed');
        this.currentDistanceEl = document.getElementById('current-distance');
        this.remainingDistanceEl = document.getElementById('remaining-distance');
        this.targetSpeedInput = document.getElementById('target-speed');
        this.gpsStatusEl = document.getElementById('gps-status');

        // GPS 정보
        this.latitudeEl = document.getElementById('latitude');
        this.longitudeEl = document.getElementById('longitude');
        this.accuracyEl = document.getElementById('accuracy');

        // 탭
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');

        // 설정 메뉴
        this.settingsMenu = document.getElementById('settings-menu');
        this.mainStatsLongPress =
            document.getElementById('main-stats-long-press');
        this.settingsBtns =
            document.querySelectorAll('.settings-btn');

        // 선택된 메트릭
        this.mainMetrics = ['time', 'speed'];

        // ═══════════════════ 상태 변수 ═══════════════════
        this.isTracking = false;
        this.startTime = null;
        this.elapsedSeconds = 0;

        this.totalDistance = 0; // km
        this.speeds = [];

        this.lastLocation = null;
        this.lastAltitude = null;

        this.maxSpeed = 0;
        this.currentSpeed = 0;

        this.timerInterval = null;

        // 마지막으로 정상 처리한 위치
        this.lastAcceptedTimestamp = null;

        // 이벤트 리스너
        this.startBtn.addEventListener(
            'click',
            () => this.handleStart()
        );

        this.stopBtn.addEventListener(
            'click',
            () => this.handleStop()
        );

        this.saveBtn.addEventListener(
            'click',
            () => this.handleSave()
        );
        // ========================================
        // 🚴 네비게이션 안내 시작 이벤트
        // ========================================
document.addEventListener(
    'bike-navigation-start',
    () => {

        log(
            '🚴 네비게이션 → GPS 추적 시작'
        );

        if (!this.isTracking) {
            this.handleStart();
        }

        this.updateGPSStatus(
            '🚴 네비게이션 안내 중...'
        );
    }
);


// ========================================
// ⏹️ 네비게이션 안내 중지 이벤트
// ========================================
document.addEventListener(
    'bike-navigation-stop',
    () => {

        log(
            '⏹️ 네비게이션 → GPS 추적 중지'
        );

        if (this.isTracking) {
            this.handleStop();
        }
    }
);

        // 탭 전환
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 긴 누름
        this.setupLongPress();

        // 저장된 메트릭 복원
        const savedMetrics =
            localStorage.getItem('mainMetrics');

        if (savedMetrics) {
            try {
                const parsed = JSON.parse(savedMetrics);

                if (
                    Array.isArray(parsed) &&
                    parsed.length === 2
                ) {
                    this.mainMetrics = parsed;
                }
            } catch (error) {
                log('⚠️ mainMetrics 복원 실패', error);
            }
        }

        log('✅ 앱 생성 완료');
    }

    // ========================================
    // 긴 누름 설정
    // ========================================
    setupLongPress() {
        let longPressTimer = null;

        const startLongPress = () => {
            clearTimeout(longPressTimer);

            longPressTimer = setTimeout(() => {
                this.openSettingsMenu();
            }, 500);
        };

        const cancelLongPress = () => {
            clearTimeout(longPressTimer);
        };

        this.mainStatsLongPress.addEventListener(
            'mousedown',
            startLongPress
        );

        this.mainStatsLongPress.addEventListener(
            'mouseup',
            cancelLongPress
        );

        this.mainStatsLongPress.addEventListener(
            'mouseleave',
            cancelLongPress
        );

        this.mainStatsLongPress.addEventListener(
            'touchstart',
            startLongPress,
            { passive: true }
        );

        this.mainStatsLongPress.addEventListener(
            'touchend',
            cancelLongPress
        );

        // 설정 버튼
        this.settingsBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const metric = btn.dataset.metric;
                const position = index < 3 ? 0 : 1;

                this.selectMetric(
                    metric,
                    position
                );

                this.closeSettingsMenu();
            });
        });

        // 메뉴 외부 클릭
        this.settingsMenu.addEventListener(
            'click',
            (e) => {
                if (e.target === this.settingsMenu) {
                    this.closeSettingsMenu();
                }
            }
        );
    }

    // ========================================
    // 설정 메뉴 열기
    // ========================================
    openSettingsMenu() {
        this.settingsMenu.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // ========================================
    // 설정 메뉴 닫기
    // ========================================
    closeSettingsMenu() {
        this.settingsMenu.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    // ========================================
    // 메트릭 선택
    // ========================================
    selectMetric(metric, position) {
        this.mainMetrics[position] = metric;

        localStorage.setItem(
            'mainMetrics',
            JSON.stringify(this.mainMetrics)
        );

        this.updateMainDisplay();
    }

    // ========================================
    // 메인 정보 업데이트
    // ========================================
    updateMainDisplay() {
        const stats =
            this.mainStatsLongPress.querySelectorAll(
                '.stat-item'
            );

        this.mainMetrics.forEach((metric, index) => {
            const label =
                stats[index].querySelector('label');

            const value =
                stats[index].querySelector('.big-text');

            switch (metric) {
                case 'time':
                    label.textContent = '시간';
                    value.textContent =
                        this.formatTime(
                            this.elapsedSeconds
                        );
                    break;

                case 'speed':
                    label.textContent = '시속';
                    value.textContent =
                        this.currentSpeed.toFixed(1) +
                        ' km/h';
                    break;

                case 'avg-speed': {
                    label.textContent = '평균속도';

                    const avgSpeed =
                        this.elapsedSeconds > 0
                            ? (
                                this.totalDistance /
                                (this.elapsedSeconds / 3600)
                            )
                            : 0;

                    value.textContent =
                        avgSpeed.toFixed(1) +
                        ' km/h';

                    break;
                }

                case 'max-speed':
                    label.textContent = '최고속도';

                    value.textContent =
                        this.maxSpeed.toFixed(1) +
                        ' km/h';

                    break;

                case 'distance':
                    label.textContent = '거리';

                    value.textContent =
                        this.totalDistance.toFixed(2) +
                        ' km';

                    break;

                case 'altitude':
                    label.textContent = '고도';

                    value.textContent =
                        this.lastAltitude !== null
                            ? this.lastAltitude.toFixed(0) +
                              ' m'
                            : '-';

                    break;
            }
        });
    }

    // ========================================
    // 지도 초기화
    // ========================================
    initMap() {
        log('🗺️ 지도 초기화');

        mapManager.initMap();

        this.updateGPSStatus(
            '준비 완료! 시작 버튼을 클릭하세요.'
        );

        this.updateMainDisplay();
    }

    // ========================================
    // 추적 시작
    // ========================================
    handleStart() {
        log('▶️ 추적 시작 버튼 클릭');

        if (this.isTracking) {
            log('⚠️ 이미 추적 중입니다.');
            return;
        }

        // HTTP + IP 접속 경고
        if (
            window.location.protocol === 'http:' &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1'
        ) {
            alert(
                '⚠️ 현재 접속 주소가 HTTP입니다.\n\n' +
                '모바일 GPS 실사용은 HTTPS 환경에서 테스트하세요.'
            );
        }

        // ========================================
        // 상태 초기화
        // ========================================
        this.isTracking = true;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;

        this.totalDistance = 0;
        this.speeds = [];

        this.lastLocation = null;
        this.lastAltitude = null;

        this.maxSpeed = 0;
        this.currentSpeed = 0;

        this.lastAcceptedTimestamp = null;

        // 저장된 메트릭
        const saved =
            localStorage.getItem('mainMetrics');

        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                if (
                    Array.isArray(parsed) &&
                    parsed.length === 2
                ) {
                    this.mainMetrics = parsed;
                }
            } catch (error) {
                log(
                    '⚠️ mainMetrics 불러오기 실패',
                    error
                );
            }
        }

        // 초기화
        mapManager.reset();
        gpsTracker.reset();

        // ========================================
        // GPS 시작
        // ========================================
        gpsTracker.startTracking(
            (coords) =>
                this.onLocationUpdate(coords),

            (message, error) =>
                this.onGPSError(message, error)
        );

        // 타이머
        this.startTimer();

        // UI
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.saveBtn.disabled = false;

        this.updateGPSStatus(
            '📡 GPS 신호를 찾는 중...'
        );

        this.updateMainDisplay();
    }

    // ========================================
    // 추적 중지
    // ========================================
    handleStop() {
        if (!this.isTracking) {
            return;
        }

        log('⏹️ 추적 중지 버튼 클릭');

        this.isTracking = false;

        this.stopTimer();

        gpsTracker.stopTracking();

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;

        this.updateGPSStatus(
            '⏹️ 추적 중지됨'
        );

        this.updateMainDisplay();
    }

    // ========================================
    // 기록 저장
    // ========================================
    handleSave() {
        log('💾 기록 저장 버튼 클릭');

        alert(
            '기록 저장 기능은 준비 중입니다.'
        );
    }

    // ========================================
    // 📍 위치 업데이트
    // ========================================
    onLocationUpdate(coords) {
        if (!this.isTracking) {
            return;
        }

        const {
            latitude,
            longitude,
            accuracy
        } = coords;

        // ========================================
        // 숫자 검증
        // ========================================
        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            !Number.isFinite(accuracy)
        ) {
            log(
                '⚠️ 잘못된 GPS 데이터 - 무시',
                coords
            );

            return;
        }

        // ========================================
        // GPS 정확도 필터
        // ========================================
        // 첫 위치는 최대 100m까지 허용
        // 이후는 50m 초과하면 계산에서 제외
        const accuracyLimit =
            this.lastLocation
                ? 200
                : 300;

        if (accuracy > accuracyLimit) {
            log(
                '⚠️ GPS 정확도 낮음 - 위치 계산 제외',
                {
                    accuracy: Math.round(accuracy),
                    limit: accuracyLimit
                }
            );

            this.accuracyEl.textContent =
                Math.round(accuracy) + ' m';

            this.updateGPSStatus(
                `📡 GPS 보정 중... 정확도 ${Math.round(accuracy)}m`
            );

            return;
        }

        // ========================================
        // 화면에 GPS 표시
        // ========================================
        this.latitudeEl.textContent =
            latitude.toFixed(6);

        this.longitudeEl.textContent =
            longitude.toFixed(6);

        this.accuracyEl.textContent =
            Math.round(accuracy) + ' m';

        // 고도
        if (Number.isFinite(coords.altitude)) {
            this.lastAltitude =
                coords.altitude;
        }

        // ========================================
        // 첫 위치
        // ========================================
        if (!this.lastLocation) {
            this.lastLocation = {
                latitude,
                longitude
            };

            this.lastAcceptedTimestamp =
                Date.now();

            mapManager.updateCurrentMarker(
                coords
            );

            mapManager.updatePolyline();

            this.updateGPSStatus(
                `📍 GPS 정상 · 정확도 ${Math.round(accuracy)}m`
            );

            this.updateStats();

            log('📍 첫 GPS 위치 확정');

            return;
        }

        // ========================================
        // 이전 위치와 거리 계산
        // ========================================
        const distance =
            this.calculateDistance(
                this.lastLocation.latitude,
                this.lastLocation.longitude,
                latitude,
                longitude
            );

        const timeDiff =
            gpsTracker.lastUpdateTime;

        // ========================================
        // 시간 간격 이상
        // ========================================
        if (
            !Number.isFinite(timeDiff) ||
            timeDiff <= 0 ||
            timeDiff > 120
        ) {
            log(
                '⚠️ GPS 시간 간격 이상 - 속도 계산 제외',
                {
                    timeDiff
                }
            );

            this.lastLocation = {
                latitude,
                longitude
            };

            this.lastAcceptedTimestamp =
                Date.now();

            mapManager.updateCurrentMarker(
                coords
            );

            mapManager.updatePolyline();

            this.updateGPSStatus(
                `📍 GPS 정상 · 정확도 ${Math.round(accuracy)}m`
            );

            this.updateStats();

            return;
        }

        // ========================================
        // 이동속도 계산
        // ========================================
        const calculatedSpeed =
            (distance / timeDiff) * 3600;

        // 100km/h 이상이면 GPS 점프로 판단
        const isPlausibleSpeed =
            Number.isFinite(calculatedSpeed) &&
            calculatedSpeed >= 0 &&
            calculatedSpeed <= 100;

        if (!isPlausibleSpeed) {
            log(
                '⚠️ GPS 점프 - 이동 데이터 제외',
                {
                    distanceKm: distance,
                    timeDiff,
                    calculatedSpeed
                }
            );

            this.lastLocation = {
                latitude,
                longitude
            };

            this.lastAcceptedTimestamp =
                Date.now();

            mapManager.updateCurrentMarker(
                coords
            );

            mapManager.updatePolyline();

            this.updateGPSStatus(
                '📡 GPS 보정 중...'
            );

            return;
        }

        // ========================================
        // 3m 이하 흔들림 무시
        // ========================================
        const meaningfulDistance =
            distance >= 0.003;

        if (meaningfulDistance) {

            this.totalDistance += distance;

            let rawSpeed =
                calculatedSpeed;

            // 브라우저가 제공한 GPS 속도가 있으면 사용
            if (
                Number.isFinite(coords.speed) &&
                coords.speed >= 0 &&
                coords.speed <= (100 / 3.6)
            ) {
                rawSpeed =
                    coords.speed * 3.6;
            }

            // ========================================
            // 현재 속도 부드럽게 보정
            // ========================================
            if (this.speeds.length === 0) {
                this.currentSpeed =
                    rawSpeed;
            } else {
                this.currentSpeed =
                    (this.currentSpeed * 0.65) +
                    (rawSpeed * 0.35);
            }

            this.speeds.push(
                this.currentSpeed
            );

            if (
                this.currentSpeed >
                this.maxSpeed
            ) {
                this.maxSpeed =
                    this.currentSpeed;
            }

            log('🚴 이동 데이터', {
                distanceKm:
                    distance.toFixed(4),

                timeDiff:
                    timeDiff.toFixed(1),

                rawSpeed:
                    rawSpeed.toFixed(1),

                currentSpeed:
                    this.currentSpeed.toFixed(1)
            });

        } else {

            // 거의 멈춰 있으면 속도를 서서히 감소
            this.currentSpeed *= 0.5;

            if (this.currentSpeed < 0.3) {
                this.currentSpeed = 0;
            }
        }

        // ========================================
        // 현재 위치 저장
        // ========================================
        this.lastLocation = {
            latitude,
            longitude
        };

        this.lastAcceptedTimestamp =
            Date.now();

        // ========================================
        // 지도 업데이트
        // ========================================
        mapManager.updateCurrentMarker(
            coords
        );

        mapManager.updatePolyline();

        // 상태
        this.updateGPSStatus(
            `📍 GPS 정상 · 정확도 ${Math.round(accuracy)}m`
        );

        this.updateStats();
    }

    // ========================================
    // GPS 오류
    // ========================================
    onGPSError(message, error = null) {
        log(
            '⚠️ GPS 상태',
            {
                message,
                code: error?.code
            }
        );

        // 권한 거부는 실제로 추적할 수 없으므로 중지
        if (
            error &&
            error.code === error.PERMISSION_DENIED
        ) {
            this.updateGPSStatus(
                '❌ GPS 권한이 거부되었습니다.'
            );

            this.handleStop();

            return;
        }

        // TIMEOUT / POSITION_UNAVAILABLE
        // → 추적 유지
        this.updateGPSStatus(
            '📡 GPS 신호를 기다리는 중...'
        );
    }

    // ========================================
    // 거리 계산
    // ========================================
    calculateDistance(
        lat1,
        lon1,
        lat2,
        lon2
    ) {
        const R = 6371;

        const dLat =
            (lat2 - lat1) *
            Math.PI / 180;

        const dLon =
            (lon2 - lon1) *
            Math.PI / 180;

        const a =
            Math.sin(dLat / 2) *
            Math.sin(dLat / 2) +

            Math.cos(
                lat1 * Math.PI / 180
            ) *

            Math.cos(
                lat2 * Math.PI / 180
            ) *

            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const c =
            2 *

            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );

        return R * c;
    }

    // ========================================
    // 통계 업데이트
    // ========================================
    updateStats() {
        const avgSpeed =
            this.elapsedSeconds > 0
                ? this.totalDistance /
                  (this.elapsedSeconds / 3600)
                : 0;

        this.currentSpeedEl.textContent =
            this.currentSpeed.toFixed(1) +
            ' km/h';

        this.avgSpeedEl.textContent =
            avgSpeed.toFixed(1) +
            ' km/h';

        this.maxSpeedEl.textContent =
            this.maxSpeed.toFixed(1) +
            ' km/h';

        this.currentDistanceEl.textContent =
            this.totalDistance.toFixed(2) +
            ' km';

        // 목표 속도
        const targetSpeed =
            parseFloat(
                this.targetSpeedInput.value
            ) || 0;

        let remainingDistance = 0;

        if (
            targetSpeed > 0 &&
            this.elapsedSeconds > 0
        ) {
            const predictedTotal =
                avgSpeed *
                (this.elapsedSeconds / 3600) +
                targetSpeed * 2;

            remainingDistance =
                Math.max(
                    0,
                    predictedTotal -
                    this.totalDistance
                );
        }

        this.remainingDistanceEl.textContent =
            remainingDistance.toFixed(2) +
            ' km';

        this.updateMainDisplay();
    }

    // ========================================
    // 타이머
    // ========================================
    startTimer() {
        this.stopTimer();

        this.timerInterval =
            setInterval(() => {

                if (
                    !this.isTracking ||
                    !this.startTime
                ) {
                    return;
                }

                // 실제 경과시간 사용
                this.elapsedSeconds =
                    Math.floor(
                        (Date.now() -
                            this.startTime) /
                        1000
                    );

                this.elapsedTimeEl.textContent =
                    this.formatTime(
                        this.elapsedSeconds
                    );

                // GPS 데이터가 10초 이상 끊기면
                // 현재 속도를 서서히 0으로
                if (
                    gpsTracker.lastTimestamp &&
                    Date.now() -
                        gpsTracker.lastTimestamp >
                        10000
                ) {
                    this.currentSpeed *= 0.85;

                    if (
                        this.currentSpeed < 0.3
                    ) {
                        this.currentSpeed = 0;
                    }
                }

                this.updateStats();

            }, 1000);
    }

    // ========================================
    // 타이머 정지
    // ========================================
    stopTimer() {
        if (
            this.timerInterval !== null
        ) {
            clearInterval(
                this.timerInterval
            );

            this.timerInterval = null;
        }
    }

    // ========================================
    // 시간 포맷
    // ========================================
    formatTime(seconds) {
        const safeSeconds =
            Math.max(
                0,
                Math.floor(seconds)
            );

        const hours =
            Math.floor(
                safeSeconds / 3600
            );

        const minutes =
            Math.floor(
                (safeSeconds % 3600) / 60
            );

        const secs =
            safeSeconds % 60;

        return (
            `${String(hours).padStart(2, '0')}:` +
            `${String(minutes).padStart(2, '0')}:` +
            `${String(secs).padStart(2, '0')}`
        );
    }

    // ========================================
    // GPS 상태
    // ========================================
    updateGPSStatus(message) {
        this.gpsStatusEl.textContent =
            message;
    }

    // ========================================
    // 탭 전환
    // ========================================
    switchTab(tabName) {
        log(`📋 탭 전환: ${tabName}`);

        this.tabBtns.forEach(btn => {
            btn.classList.remove('active');

            if (
                btn.dataset.tab ===
                tabName
            ) {
                btn.classList.add('active');
            }
        });

        this.tabContents.forEach(
            content => {

                content.classList.remove(
                    'active'
                );

                if (
                    content.id ===
                    `${tabName}-tab`
                ) {
                    content.classList.add(
                        'active'
                    );

                    // 지도 탭 진입
                    if (
                        tabName === 'map' &&
                        mapManager.map
                    ) {
                        setTimeout(() => {

                            if (
                                window.kakao?.maps
                            ) {

                                mapManager.map.relayout();

                            }

                        }, 100);
                    }
                }
            }
        );
    }
}


// ========================================
// 앱 초기화
// ========================================
log('app.js 로드됨');

if (
    document.readyState ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        () => {

            log(
                '✅ DOM 로드 완료 - 앱 시작!'
            );

            const app =
                new BikeGPSApp();

            app.initMap();
        }
    );

} else {

    log(
        '✅ DOM 이미 로드됨 - 앱 시작!'
    );

    const app =
        new BikeGPSApp();

    app.initMap();
}