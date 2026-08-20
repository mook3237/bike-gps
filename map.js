// 🗺️ 지도 관련 로직
// 구글맵 초기화, 마커 표시, 이동 등을 담당합니다

class MapManager {
    constructor() {
        this.map = null;
        this.currentMarker = null;  // 현재 위치 마커
        this.polyline = null;  // 경로 선
        this.infoWindow = null;
        this.pathCoords = [];  // 경로 좌표 저장
    }

    // 🗺️ 지도 초기화
    initMap() {
        log('지도 초기화 중...');

        const mapElement = document.getElementById('map');

        // 지도 생성
        this.map = new google.maps.Map(mapElement, {
            zoom: CONFIG.MAP.initialZoom,
            center: {
                lat: CONFIG.MAP.centerLat,
                lng: CONFIG.MAP.centerLng,
            },
            mapTypeControl: true,
            fullscreenControl: true,
            zoomControl: true,
        });

        log('지도 초기화 완료');
    }

    // 📍 현재 위치 마커 표시/업데이트
    updateCurrentMarker(position) {
        const { latitude, longitude } = position;
        const location = {
            lat: latitude,
            lng: longitude,
        };

        // 첫 번째 마커 생성
        if (!this.currentMarker) {
            this.currentMarker = new google.maps.Marker({
                position: location,
                map: this.map,
                title: '현재 위치',
                icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            });
            log('현재 위치 마커 생성');
        } else {
            // 마커 위치 업데이트
            this.currentMarker.setPosition(location);
        }

        // 지도 중심을 현재 위치로 이동
        this.map.panTo(location);

        // 경로에 좌표 추가
        this.pathCoords.push(location);
    }

    // 🛣️ 경로 선 그리기
    updatePolyline() {
        if (this.pathCoords.length < 2) {
            return;  // 2개 이상의 포인트 필요
        }

        if (!this.polyline) {
            // 첫 번째 경로선 생성
            this.polyline = new google.maps.Polyline({
                path: this.pathCoords,
                geodesic: true,
                strokeColor: '#FF0000',  // 빨간색
                strokeOpacity: 0.7,
                strokeWeight: 3,
                map: this.map,
            });
            log('경로선 생성됨');
        } else {
            // 기존 경로선 업데이트
            this.polyline.setPath(this.pathCoords);
        }
    }

    // 🎯 지도 자동 줌 (모든 경로가 보이도록)
    fitBounds() {
        if (this.pathCoords.length < 2) {
            return;
        }

        const bounds = new google.maps.LatLngBounds();
        this.pathCoords.forEach(coord => {
            bounds.extend(coord);
        });

        this.map.fitBounds(bounds);
        log('지도 자동 줌 조정');
    }

    // 🔄 초기화
    reset() {
        // 마커 제거
        if (this.currentMarker) {
            this.currentMarker.setMap(null);
            this.currentMarker = null;
        }

        // 경로선 제거
        if (this.polyline) {
            this.polyline.setMap(null);
            this.polyline = null;
        }

        // 경로 데이터 초기화
        this.pathCoords = [];

        log('지도 초기화 완료');
    }

    // 📍 지도에 마커 추가 (커스텀)
    addMarker(lat, lng, title = '', color = 'red') {
        const marker = new google.maps.Marker({
            position: { lat, lng },
            map: this.map,
            title: title,
            icon: `http://maps.google.com/mapfiles/ms/icons/${color}-dot.png`,
        });
        return marker;
    }
}

// 전역 지도 매니저 객체
const mapManager = new MapManager();
