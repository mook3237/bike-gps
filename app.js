console.log('1단계: app.js 파일 파싱 시작됨');

window.addEventListener('error', function(e) {
    console.error('🚨 [전역 에러 감지]:', e.message, '파일:', e.filename, '라인:', e.lineno);
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('2단계: DOMContentLoaded 이벤트 발생 완료');
});

// 🎯 메인 앱 클래스
class BikeGPSApp {
    constructor() {
        log('BikeGPSApp 생성됨');

        // ═══════════════════ UI 요소 ═══════════════════
        // 버튼
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.saveBtn = document.getElementById('saveBtn');

        // 통계 (큰 글씨)
        this.elapsedTimeEl = document.getElementById('elapsed-time');
        this.currentSpeedEl = document.getElementById('current-speed');

        // 상세 정보 (안전 장치 추가: 요소가 없어도 에러 안 나도록 처리)
        this.avgSpeedEl = document.getElementById('avg-speed');
        this.maxSpeedEl = document.getElementById('max-speed');
        this.currentDistanceEl = document.getElementById('current-distance') || document.querySelector('.sub-speedometer-stat');
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

        // 설정 메뉴 (HTML에 없을 수도 있으므로 예외처리)
        this.settingsMenu = document.getElementById('settings-menu');
        this.mainStatsLongPress = document.getElementById('main-stats-long-press');
        this.settingsBtns = document.querySelectorAll('.settings-btn');

        // 선택된 메트릭 (기본값: 시간, 속도)
        this.mainMetrics = ['time', 'speed'];  // 왼쪽, 오른쪽

        // ═══════════════════ 상태 변수 ═══════════════════
        this.isTracking = false;
        this.startTime = null;
        this.elapsedSeconds = 0;
        this.totalDistance = 0; // km
        this.speeds = []; // 속도 기록
        this.lastLocation = null;
        this.lastAltitude = null;  // 고도
        this.maxSpeed = 0;
        this.timerInterval = null;

        // 이벤트 리스너 안전 연결
        if (this.startBtn) this.startBtn.addEventListener('click', () => this.handleStart());
        if (this.stopBtn) this.stopBtn.addEventListener('click', () => this.handleStop());
        if (this.saveBtn) this.saveBtn.addEventListener('click', () => this.handleSave());

        // 탭 전환
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });

        // 긴 누름 (메인 정보)
        if (this.mainStatsLongPress && this.settingsMenu) {
            this.setupLongPress();
        }

        log('✅ 앱 생성 완료');
    }

    // 🔧 긴 누름 설정
    setupLongPress() {
        let longPressTimer = null;

        this.mainStatsLongPress.addEventListener('mousedown', () => {
            longPressTimer = setTimeout(() => {
                this.openSettingsMenu();
            }, 500);  // 0.5초 = 긴 누름
        });

        this.mainStatsLongPress.addEventListener('mouseup', () => {
            clearTimeout(longPressTimer);
        });

        this.mainStatsLongPress.addEventListener('mouseleave', () => {
            clearTimeout(longPressTimer);
        });

        // 터치 장치용
        this.mainStatsLongPress.addEventListener('touchstart', () => {
            longPressTimer = setTimeout(() => {
                this.openSettingsMenu();
            }, 500);
        });

        this.mainStatsLongPress.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });

        // 설정 메뉴 버튼
        this.settingsBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const metric = btn.dataset.metric;
                const position = index < 3 ? 0 : 1;  // 첫 3개는 왼쪽, 나머지는 오른쪽
                this.selectMetric(metric, position);
                this.closeSettingsMenu();
            });
        });

        // 메뉴 외부 클릭으로 닫기
        this.settingsMenu.addEventListener('click', (e) => {
            if (e.target === this.settingsMenu) {
                this.closeSettingsMenu();
            }
        });
    }

    // 📋 설정 메뉴 열기
    openSettingsMenu() {
        if (this.settingsMenu) {
            this.settingsMenu.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    // 📋 설정 메뉴 닫기
    closeSettingsMenu() {
        if (this.settingsMenu) {
            this.settingsMenu.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }

    // 📊 메트릭 선택
    selectMetric(metric, position) {
        this.mainMetrics[position] = metric;
        localStorage.setItem('mainMetrics', JSON.stringify(this.mainMetrics));
        this.updateMainDisplay();
    }

    // 🎨 메인 정보 업데이트
    updateMainDisplay() {
        if (!this.mainStatsLongPress) return;
        const stats = this.mainStatsLongPress.querySelectorAll('.stat-item');

        this.mainMetrics.forEach((metric, index) => {
            if (!stats[index]) return;
            const label = stats[index].querySelector('label');
            const value = stats[index].querySelector('.big-text');
            if (!label || !value) return;

            switch (metric) {
                case 'time':
                    label.textContent = '시간';
                    value.textContent = this.formatTime(this.elapsedSeconds);
                    break;
                case 'speed':
                    label.textContent = '시속';
                    value.textContent = (this.speeds.length > 0
                        ? this.speeds.slice(-10).reduce((a, b) => a + b, 0) / Math.min(this.speeds.length, 10)
                        : 0).toFixed(1) + ' km/h';
                    break;
                case 'avg-speed':
                    label.textContent = '평균속도';
                    const avgSpeed = this.elapsedSeconds > 0
                        ? (this.totalDistance / (this.elapsedSeconds / 3600))
                        : 0;
                    value.textContent = avgSpeed.toFixed(1) + ' km/h';
                    break;
                case 'max-speed':
                    label.textContent = '최고속도';
                    value.textContent = this.maxSpeed.toFixed(1) + ' km/h';
                    break;
                case 'distance':
                    label.textContent = '거리';
                    value.textContent = this.totalDistance.toFixed(2) + ' km';
                    break;
                case 'altitude':
                    label.textContent = '고도';
                    value.textContent = this.lastAltitude ? this.lastAltitude.toFixed(0) + ' m' : '-';
                    break;
            }
        });
    }

    // 🗺️ 지도 초기화
    initMap() {
        log('🗺️ 지도 초기화');
        if (typeof mapManager !== 'undefined' && typeof mapManager.initMap === 'function') {
            mapManager.initMap();
        }
        this.updateGPSStatus('준비 완료! 시작 버튼을 클릭하세요.');
    }

    // ▶️ 추적 시작
    handleStart() {
        log('▶️ 추적 시작 버튼 클릭');

        this.isTracking = true;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.totalDistance = 0;
        this.speeds = [];
        this.lastLocation = null;
        this.lastAltitude = null;
        this.maxSpeed = 0;

        // 저장된 메트릭 로드
        const saved = localStorage.getItem('mainMetrics');
        if (saved) {
            try { this.mainMetrics = JSON.parse(saved); } catch (e) {}
        }

        // 초기화
        if (typeof mapManager !== 'undefined') mapManager.reset();
        if (typeof gpsTracker !== 'undefined') gpsTracker.reset();

        // GPS 시작
        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.startTracking(
                (coords) => this.onLocationUpdate(coords),
                (error) => this.onGPSError(error)
            );
        }

        // 타이머 시작
        this.startTimer();

        // UI 업데이트
        if (this.startBtn) this.startBtn.disabled = true;
        if (this.stopBtn) this.stopBtn.disabled = false;
        if (this.saveBtn) this.saveBtn.disabled = false;
        this.updateGPSStatus('📍 위치 추적 중...');
        this.updateMainDisplay();
    }

    // ⏹️ 추적 중지
    handleStop() {
        log('⏹️ 추적 중지 버튼 클릭');

        this.isTracking = false;
        if (typeof gpsTracker !== 'undefined') gpsTracker.stopTracking();
        this.stopTimer();

        if (this.startBtn) this.startBtn.disabled = false;
        if (this.stopBtn) this.stopBtn.disabled = true;
        this.updateGPSStatus('✅ 추적 완료');

        if (typeof mapManager !== 'undefined') mapManager.fitBounds();
    }

    // 💾 기록 저장
    handleSave() {
        log('💾 기록 저장');

        const recordData = {
            distance: this.totalDistance,
            time: this.elapsedSeconds,
            avgSpeed: this.elapsedSeconds > 0 ? this.totalDistance / (this.elapsedSeconds / 3600) : 0,
            maxSpeed: this.maxSpeed,
            timestamp: new Date().toISOString(),
        };

        console.log('기록 저장됨:', recordData);
        alert(`✅ 기록 저장!\n거리: ${this.totalDistance.toFixed(2)} km\n시간: ${this.formatTime(this.elapsedSeconds)}\n평균속도: ${recordData.avgSpeed.toFixed(1)} km/h`);
    }

    // 📍 위치 업데이트
    onLocationUpdate(coords) {
        const { latitude, longitude, accuracy } = coords;

        // GPS 정보 표시
        if (this.latitudeEl) this.latitudeEl.textContent = latitude.toFixed(6);
        if (this.longitudeEl) this.longitudeEl.textContent = longitude.toFixed(6);
        if (this.accuracyEl) this.accuracyEl.textContent = Math.round(accuracy) + ' m';

        // 거리 계산
        if (this.lastLocation) {
            const distance = this.calculateDistance(
                this.lastLocation.latitude,
                this.lastLocation.longitude,
                latitude,
                longitude
            );
            this.totalDistance += distance;

            // 속도 계산
            const timeDiff = (typeof gpsTracker !== 'undefined' && gpsTracker.lastUpdateTime) ? gpsTracker.lastUpdateTime : 5;
            const speed = timeDiff > 0 ? (distance / timeDiff) * 3600 : 0; // km/h

            this.speeds.push(speed);
            if (this.speeds.length > 100) this.speeds.shift();
            if (speed > this.maxSpeed) {
                this.maxSpeed = speed;
            }
        }

        this.lastLocation = { latitude, longitude };

        // 지도 업데이트
        if (typeof mapManager !== 'undefined') {
            mapManager.updateCurrentMarker(coords);
            mapManager.updatePolyline();
        }

        // 통계 업데이트
        this.updateStats();
    }

    // ❌ GPS 오류
    onGPSError(error) {
        log('❌ GPS 오류', error);
        this.updateGPSStatus('❌ 오류: ' + error);
        this.handleStop();
    }

    // ═══════════════════ 계산 함수 ═══════════════════

    // 📏 두 GPS 좌표 간 거리 (Haversine 공식)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // 지구 반지름 (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 통계 업데이트
    updateStats() {
        const avgRecentSpeed = this.speeds.length > 0
            ? this.speeds.slice(-10).reduce((a, b) => a + b, 0) / Math.min(this.speeds.length, 10)
            : 0;

        if (this.currentSpeedEl) this.currentSpeedEl.textContent = avgRecentSpeed.toFixed(1);

        const avgSpeed = this.elapsedSeconds > 0
            ? (this.totalDistance / (this.elapsedSeconds / 3600))
            : 0;
        if (this.avgSpeedEl) this.avgSpeedEl.textContent = avgSpeed.toFixed(1) + ' km/h';

        if (this.maxSpeedEl) this.maxSpeedEl.textContent = this.maxSpeed.toFixed(1) + ' km/h';

        if (this.currentDistanceEl) {
            this.currentDistanceEl.innerHTML = `${this.totalDistance.toFixed(2)}<span>km</span>`;
        }

        // 남은 거리 (목표속도 기반)
        const targetSpeed = (this.targetSpeedInput) ? parseFloat(this.targetSpeedInput.value) || 0 : 0;
        let remainingDistance = 0;
        if (targetSpeed > 0 && this.elapsedSeconds > 0) {
            const predictedTotal = avgSpeed * (this.elapsedSeconds / 3600) + targetSpeed * 2;
            remainingDistance = Math.max(0, predictedTotal - this.totalDistance);
        }
        if (this.remainingDistanceEl) this.remainingDistanceEl.textContent = remainingDistance.toFixed(2) + ' km';

        this.updateMainDisplay();
    }

    // ⏱️ 타이머
    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            this.elapsedSeconds++;
            if (this.elapsedTimeEl) this.elapsedTimeEl.textContent = this.formatTime(this.elapsedSeconds);
            this.updateStats();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // 시간 포맷
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // GPS 상태 메시지
    updateGPSStatus(message) {
        if (this.gpsStatusEl) this.gpsStatusEl.textContent = message;
    }

    // 탭 전환
    switchTab(tabName) {
        if (!tabName) return;
        log(`📋 탭 전환: ${tabName}`);

        this.tabBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        this.tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');

                // 🗺️ 지도 탭을 누른 순간에 화면이 확실히 눈에 보일 때 생성/새로고침
                if (tabName === 'map') {
                    setTimeout(() => {
                        if (typeof mapManager !== 'undefined') {
                            if (!mapManager.map) {
                                // 지도가 아직 생성 안 됐으면 지금 생성! (크기가 0이 아닐 때 만들어짐)
                                mapManager.initMap();
                            } else {
                                // 이미 생성되어 있다면 레이아웃 재계산 및 중심 이동
                                mapManager.map.relayout();
                                if (this.lastLocation) {
                                    mapManager.map.setCenter(new kakao.maps.LatLng(this.lastLocation.latitude, this.lastLocation.longitude));
                                }
                            }
                        }
                    }, 100);
                }
            }
        });
    }
} // ⬅️ 여기에 빠져 있던 클래스 닫는 괄호 추가 완료

// ====== 앱 초기화 ======
log('app.js 로드됨');

let bikeApp = null;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        log('✅ DOM 로드 완료 - 앱 시작!');
        bikeApp = new BikeGPSApp();
    });
} else {
    log('✅ DOM 이미 로드됨 - 앱 시작!');
    bikeApp = new BikeGPSApp();
}
