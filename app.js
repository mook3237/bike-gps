// 🚴 APP.JS - 메인 애플리케이션

class BikeApp {
    constructor() {
        this.isRunning = false;
        this.elapsedTime = 0;
        this.timerInterval = null;

        this.$startBtn = document.getElementById('startBtn');
        this.$stopBtn = document.getElementById('stopBtn');
        this.$saveBtn = document.getElementById('saveBtn');
        this.$elapsedTime = document.getElementById('elapsed-time');

        this.init();
    }

    init() {
        // 탭 전환
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
                
                // 지도 탭 진입 시 맵 클릭 이벤트 설정
                if (tabName === 'map' && typeof bikeNav !== 'undefined') {
                    bikeNav.setupMapClick();
                }
            });
        });

        // 버튼 이벤트
        this.$startBtn.addEventListener('click', () => this.start());
        this.$stopBtn.addEventListener('click', () => this.stop());
        this.$saveBtn.addEventListener('click', () => this.saveRecord());

        // 지도 초기화
        if (typeof mapManager !== 'undefined') {
            mapManager.initMap();
            log('✅ 지도 준비됨');
        }

        log('✅ 앱 초기화 완료');
    }

    // 탭 전환
    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    }

    // ▶️ 시작
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.$startBtn.disabled = true;
        this.$stopBtn.disabled = false;
        this.$saveBtn.disabled = true;

        // GPS 트래킹 시작
        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.reset();
            gpsTracker.startTracking(
                (position) => {
                    const { latitude, longitude } = position;
                    if (typeof mapManager !== 'undefined') {
                        mapManager.updateCurrentMarker({ latitude, longitude });
                        mapManager.updatePolyline();
                    }
                    if (typeof bikeNav !== 'undefined') {
                        bikeNav.updateLocation(latitude, longitude);
                    }
                },
                (error) => {
                    log('❌ GPS 오류: ' + error);
                    alert(error);
                }
            );
        }

        // 시간 계산 시작
        this.timerInterval = setInterval(() => {
            this.elapsedTime++;
            this.updateTimeDisplay();
        }, 1000);

        log('▶️ 기록 시작');
    }

    // ⏹️ 정지
    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        this.$startBtn.disabled = false;
        this.$stopBtn.disabled = true;
        this.$saveBtn.disabled = false;

        // GPS 트래킹 정지
        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.stopTracking();
        }

        // 시간 계산 정지
        clearInterval(this.timerInterval);

        log('⏹️ 기록 정지');
    }

    // 💾 기록 저장
    saveRecord() {
        if (typeof gpsTracker === 'undefined') return;

        const record = {
            timestamp: new Date().toISOString(),
            duration: this.elapsedTime,
            distance: ((gpsTracker.positions.length || 0) * 0.1).toFixed(2),
            pointCount: gpsTracker.positions.length,
        };

        let records = JSON.parse(localStorage.getItem('bikeRecords') || '[]');
        records.push(record);
        localStorage.setItem('bikeRecords', JSON.stringify(records));

        alert(`기록 저장됨!\n위치 데이터: ${record.pointCount}개\n시간: ${Math.floor(this.elapsedTime / 60)}분`);

        // 초기화
        this.reset();

        log('💾 기록 저장됨:', record);
    }

    // 🔄 초기화
    reset() {
        this.elapsedTime = 0;
        this.$elapsedTime.textContent = '00:00:00';
        this.$startBtn.disabled = false;
        this.$stopBtn.disabled = true;
        this.$saveBtn.disabled = true;

        if (typeof gpsTracker !== 'undefined') {
            gpsTracker.reset();
        }

        if (typeof mapManager !== 'undefined') {
            mapManager.reset();
        }

        log('🔄 데이터 초기화');
    }

    // ⏱️ 시간 표시
    updateTimeDisplay() {
        const hours = Math.floor(this.elapsedTime / 3600);
        const minutes = Math.floor((this.elapsedTime % 3600) / 60);
        const seconds = this.elapsedTime % 60;

        this.$elapsedTime.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

const app = new BikeApp();
