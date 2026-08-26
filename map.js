// 🗺️ 카카오맵 매니저
class MapManager {
    constructor() {
        this.map = null;
        this.currentMarker = null;
        this.polyline = null;
        this.pathCoords = [];
        log('MapManager 생성됨');
    }

    // 🗺️ 지도 초기화 (kakao.maps.load 콜백 후 호출됨)
    initMap() {
        log('initMap 호출');

        const mapElement = document.getElementById('map');
        if (!mapElement) {
            log('❌ map 요소 없음');
            return;
        }

        try {
            this.map = new kakao.maps.Map(mapElement, {
                center: new kakao.maps.LatLng(CONFIG.MAP.centerLat, CONFIG.MAP.centerLng),
                level: CONFIG.MAP.initialZoom,
            });

            log('✅ 지도 초기화 성공!');

        } catch (error) {
            log('❌ 지도 초기화 오류', error.message);
        }
    }

    // 📍 마커 업데이트
    updateCurrentMarker(position) {
        if (!this.map) {
            log('⚠️ 지도 미준비');
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

            this.map.setLevel(21);  // 줌 21 고정 (매우 확대!)
            this.map.panTo(location);
            this.pathCoords.push(location);

        } catch (error) {
            log('❌ 마커 오류', error.message);
        }
    }

    // 🛣️ 경로선 그리기
    updatePolyline() {
        if (!this.map || this.pathCoords.length < 2) {
            return;
        }

        try {
            if (!this.polyline) {
                this.polyline = new kakao.maps.Polyline({
                    path: this.pathCoords,
                    strokeColor: '#FF0000',
                    strokeWeight: 3,
                    strokeOpacity: 0.7,
                    strokeStyle: 'solid',
                    map: this.map,
                });
            } else {
                this.polyline.setPath(this.pathCoords);
            }
        } catch (error) {
            log('❌ 경로선 오류', error.message);
        }
    }

    // 🎯 자동 줌
    fitBounds() {
        if (!this.map || this.pathCoords.length < 2) {
            return;
        }

        try {
            const bounds = new kakao.maps.LatLngBounds();
            this.pathCoords.forEach(coord => bounds.extend(coord));
            this.map.setBounds(bounds);
        } catch (error) {
            log('❌ 자동 줌 오류', error.message);
        }
    }

    // 🔄 초기화
    reset() {
        try {
            if (this.currentMarker) {
                this.currentMarker.setMap(null);
                this.currentMarker = null;
            }
            if (this.polyline) {
                this.polyline.setMap(null);
                this.polyline = null;
            }
            this.pathCoords = [];
        } catch (error) {
            log('❌ 리셋 오류', error.message);
        }
    }
}

const mapManager = new MapManager();
