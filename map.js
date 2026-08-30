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

    initMap() {
        log('지도 초기화');

        try {
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                log('ERROR: 지도 컨테이너 없음');
                return;
            }

            if (typeof kakao === 'undefined' || !kakao.maps) {
                log('ERROR: kakao.maps 없음');
                return;
            }

            const mapOption = {
                center: new kakao.maps.LatLng(CONFIG.MAP.centerLat, CONFIG.MAP.centerLng),
                level: CONFIG.MAP.initialZoom,
            };

            this.map = new kakao.maps.Map(mapContainer, mapOption);
            log('지도 초기화 OK');

        } catch (error) {
            log('ERROR: ' + error.message);
        }
    }

    updateCurrentMarker(position) {
        if (!this.map) return;

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

            this.map.setCenter(location);
            this.pathCoords.push(location);

        } catch (error) {
            log('ERROR: ' + error.message);
        }
    }

    updatePolyline() {
        if (!this.map || this.pathCoords.length < 2) return;

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
            log('ERROR: ' + error.message);
        }
    }

    reset() {
        this.pathCoords = [];
        if (this.polyline) {
            this.polyline.setMap(null);
            this.polyline = null;
        }
        log('지도 초기화');
    }

    fitBounds() {
        if (!this.map || this.pathCoords.length === 0) return;

        try {
            const bounds = new kakao.maps.LatLngBounds();
            this.pathCoords.forEach(coord => {
                bounds.extend(coord);
            });
            this.map.setBounds(bounds);
            log('줌 조정 OK');
        } catch (error) {
            log('ERROR: ' + error.message);
        }
    }
}

const mapManager = new MapManager();
if (typeof diagnostic !== 'undefined') {
    diagnostic.add('mapManager 생성됨');
}
