// 🗺️ 지도 관리자 클래스

// 🔧 로그 함수 (config.js 로드 전에 필요)
function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}

class MapManager {
    constructor() {
        this.map = null;
        this.currentMarker = null;
        this.polyline = null;
        this.pathCoords = [];
        log('MapManager 생성됨');
    }

    // 🗺️ 지도 초기화 (kakao.maps.load로 감싸서 안전하게 로드)
    initMap() {
        log('🗺️ 지도 초기화 시작...');

        if (typeof kakao === 'undefined' || !kakao.maps) {
            log('❌ 카카오맵 SDK가 아직 로드되지 않았습니다.');
            return;
        }

        kakao.maps.load(() => {
            try {
                const mapContainer = document.getElementById('map');
                
                if (!mapContainer) {
                    log('❌ 지도 컨테이너를 찾을 수 없음');
                    return;
                }

                const mapOption = {
                    center: new kakao.maps.LatLng(CONFIG.MAP.centerLat, CONFIG.MAP.centerLng),
                    level: CONFIG.MAP.initialZoom,
                };

                this.map = new kakao.maps.Map(mapContainer, mapOption);
                log('✅ 지도 초기화 완료!');

                // 초기 생성 직후 레이아웃 강제 새로고침 (탭 전환 시 안 깨지도록)
                setTimeout(() => {
                    this.map.relayout();
                }, 200);

            } catch (error) {
                log('❌ 지도 초기화 오류', error.message);
            }
        });
    }

    // 📍 현재 위치 마커 업데이트 및 속도별 자동 줌 적용
    updateCurrentMarker(position, currentSpeed = 0) {
        if (!this.map) {
            log('⚠️ 지도가 준비되지 않음');
            return;
        }

        const { latitude, longitude } = position;
        const location = new kakao.maps.LatLng(latitude, longitude);

        try {
            if (!this.currentMarker) {
                this.currentMarker = new kakao.maps.Marker({
                    position: location,
                    map: this.map,
                    title: '현재 위치',
                });
            } else {
                this.currentMarker.setPosition(location);
            }

            // 지도 중심을 현재 위치로 이동
            this.map.setCenter(location);
            this.pathCoords.push(location);

            // 🚀 30km/h 기준 자동 줌 레벨 조절 (카카오맵: 1=확대, 2=축소)
            // config.js에 설정된 값이 있다면 그 값을 쓰고, 없으면 기본값 적용
            const slowZoom = (CONFIG.MAP.ZOOM_LEVELS && CONFIG.MAP.ZOOM_LEVELS.SLOW) || 1;
            const fastZoom = (CONFIG.MAP.ZOOM_LEVELS && CONFIG.MAP.ZOOM_LEVELS.FAST) || 2;

            const targetZoom = currentSpeed < 30 ? slowZoom : fastZoom;
            if (this.map.getLevel() !== targetZoom) {
                this.map.setLevel(targetZoom);
            }

        } catch (error) {
            log('❌ 마커 및 줌 업데이트 오류', error.message);
        }
    }

    // 📈 경로 폴리라인 업데이트
    updatePolyline() {
        if (!this.map || this.pathCoords.length < 2) {
            return;
        }

        try {
            if (this.polyline) {
                this.polyline.setPath(this.pathCoords);
            } else {
                this.polyline = new kakao.maps.Polyline({
                    path: this.pathCoords,
                    strokeWeight: 3,
                    strokeColor: '#4CAF50',
                    strokeOpacity: 0.8,
                    strokeStyle: 'solid',
                    map: this.map,
                });
            }
        } catch (error) {
            log('❌ 폴리라인 오류', error.message);
        }
    }

    // 🔄 초기화
    reset() {
        this.pathCoords = [];
        if (this.polyline) {
            this.polyline.setMap(null);
            this.polyline = null;
        }
        log('🔄 지도 초기화됨');
    }

    // 📏 경로 범위에 맞게 줌 조정
    fitBounds() {
        if (!this.map || this.pathCoords.length === 0) {
            return;
        }

        try {
            const bounds = new kakao.maps.LatLngBounds();
            this.pathCoords.forEach(coord => {
                bounds.extend(coord);
            });
            this.map.setBounds(bounds);
            log('✅ 경로에 맞게 줌 조정됨');
        } catch (error) {
            log('❌ 줌 조정 오류', error.message);
        }
    }
}

// 전역 객체 생성
const mapManager = new MapManager();
