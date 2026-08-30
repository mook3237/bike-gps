function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}

class BikeGPSApp {
    constructor() {
        log('BikeGPSApp 생성 시작');
        
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.saveBtn = document.getElementById('saveBtn');
        this.elapsedTimeEl = document.getElementById('elapsed-time');
        this.currentSpeedEl = document.getElementById('current-speed');
        this.avgSpeedEl = document.getElementById('avg-speed');
        this.maxSpeedEl = document.getElementById('max-speed');
        this.currentDistanceEl = document.getElementById('current-distance');
        this.gpsStatusEl = document.getElementById('gps-status');
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');

        this.isTracking = false;
        this.startTime = null;
        this.elapsedSeconds = 0;
        this.totalDistance = 0;
        this.speeds = [];
        this.lastLocation = null;
        this.maxSpeed = 0;
        this.timerInterval = null;

        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => {
                log('startBtn 클릭');
                this.handleStart();
            });
        }

        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => {
                log('stopBtn 클릭');
                this.handleStop();
            });
        }

        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => {
                log('saveBtn 클릭');
                this.handleSave();
            });
        }

        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        if (this.gpsStatusEl) {
            this.gpsStatusEl.textContent = '준비 완료! 시작 버튼을 누르세요.';
        }

        log('BikeGPSApp 생성 완료');
    }

    handleStart() {
        log('추적 시작');
        this.isTracking = true;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.totalDistance = 0;
        this.speeds = [];
        this.lastLocation = null;
        this.maxSpeed = 0;

        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.reset();
            gpsTracker.startTracking(
                (coords) => this.onLocationUpdate(coords),
                (error) => this.onGPSError(error)
            );
        }

        if (typeof mapManager !== 'undefined') {
            mapManager.reset();
            mapManager.initMap();
        }

        this.startTimer();
        
        if (this.startBtn) this.startBtn.disabled = true;
        if (this.stopBtn) this.stopBtn.disabled = false;
        if (this.saveBtn) this.saveBtn.disabled = false;
        if (this.gpsStatusEl) this.gpsStatusEl.textContent = '📍 위치 추적 중...';
    }

    handleStop() {
        log('추적 중지');
        this.isTracking = false;
        
        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.stopTracking();
        }
        
        this.stopTimer();
        
        if (this.startBtn) this.startBtn.disabled = false;
        if (this.stopBtn) this.stopBtn.disabled = true;
        if (this.gpsStatusEl) this.gpsStatusEl.textContent = '✅ 추적 완료';

        if (typeof mapManager !== 'undefined') {
            mapManager.fitBounds();
        }
    }

    handleSave() {
        log('기록 저장');
        alert(`기록 저장!\n거리: ${this.totalDistance.toFixed(2)} km\n시간: ${this.formatTime(this.elapsedSeconds)}`);
    }

    onLocationUpdate(coords) {
        const { latitude, longitude, accuracy } = coords;

        if (this.lastLocation) {
            const distance = this.calculateDistance(
                this.lastLocation.latitude, this.lastLocation.longitude,
                latitude, longitude
            );
            this.totalDistance += distance;

            const timeDiff = (typeof gpsTracker !== 'undefined' ? gpsTracker.lastUpdateTime : 5) || 5;
            const speed = (distance / timeDiff) * 3600;

            this.speeds.push(speed);
            if (speed > this.maxSpeed) this.maxSpeed = speed;
        }

        this.lastLocation = { latitude, longitude };

        if (typeof mapManager !== 'undefined') {
            mapManager.updateCurrentMarker(coords);
            mapManager.updatePolyline();
        }

        this.updateStats();
    }

    onGPSError(error) {
        log('GPS 에러: ' + error);
        if (this.gpsStatusEl) this.gpsStatusEl.textContent = 'GPS 에러: ' + error;
        this.handleStop();
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    updateStats() {
        const avgRecentSpeed = this.speeds.length > 0
            ? this.speeds.slice(-10).reduce((a, b) => a + b, 0) / Math.min(this.speeds.length, 10) : 0;

        if (this.currentSpeedEl) this.currentSpeedEl.textContent = avgRecentSpeed.toFixed(1);
        
        const avgSpeed = this.elapsedSeconds > 0 ? (this.totalDistance / (this.elapsedSeconds / 3600)) : 0;
        if (this.avgSpeedEl) this.avgSpeedEl.textContent = avgSpeed.toFixed(1) + ' km/h';
        if (this.maxSpeedEl) this.maxSpeedEl.textContent = this.maxSpeed.toFixed(1) + ' km/h';
        if (this.currentDistanceEl) this.currentDistanceEl.textContent = this.totalDistance.toFixed(2) + ' km';
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.elapsedSeconds++;
            if (this.elapsedTimeEl) {
                this.elapsedTimeEl.textContent = this.formatTime(this.elapsedSeconds);
            }
            this.updateStats();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    switchTab(tabName) {
        log('탭: ' + tabName);
        this.tabBtns.forEach(btn => btn.classList.remove('active'));
        this.tabContents.forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        document.getElementById(`${tabName}-tab`)?.classList.add('active');
    }
}

log('app.js 로드 완료');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof diagnostic !== 'undefined') {
            diagnostic.add('DOMContentLoaded 발생');
        }
        window.app = new BikeGPSApp();
    });
} else {
    if (typeof diagnostic !== 'undefined') {
        diagnostic.add('DOM 이미 로드됨');
    }
    window.app = new BikeGPSApp();
}
