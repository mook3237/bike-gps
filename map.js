// 🗺️ 카카오맵 관련 로직 (완전 재작성)
// 카카오맵 API와 완벽하게 호환되는 버전입니다

class MapManager {
    constructor() {
        this.map = null;
        this.currentMarker = null;
        this.polyline = null;
        this.pathCoords = [];
        this.kakaoReady = false;
        this.waitForKakao();
    }

    // 카카오맵 로드 대기
    waitForKakao() {
        log('카카오맵 API 대기 중...');
        
        if (typeof kakao !== 'undefined' && kakao.maps) {
            this.kakaoReady = true;
            log('카카오맵 API 로드 완료!');
        } else {
            // 500ms 후 다시 확인
            setTimeout(() => this.waitForKakao(), 500);
        }
    }

    // 🗺️ 카카오맵 초기화
    initMap() {
        // 카카오맵이 로드될 때까지 대기
        if (!this.kakaoReady) {
            log('카카오맵이 아직 로드 중입니다. 1초 후 재시도...');
            setTimeout(() => this.initMap(), 1000);
            return;
        }

        log('카카오맵 초기화 중...');

        const mapElement = document.getElementById('map');
        if (!mapElement) {
            log('오류: map 요소를 찾을 수 없습니다');
            return;
        }

        try {
            // 카카오맵 생성
            this.map = new kakao.maps.Map(mapElement, {
                center: new kakao.maps.LatLng(CONFIG.MAP.centerLat, CONFIG.MAP.centerLng),
                level: CONFIG.MAP.initialZoom,
            });

            log('카카오맵 초기화 성공!');
        } catch (error) {
            log('카카오맵 초기화 오류', error);
        }
    }

    // 📍 현재 위치 마커 표시/업데이트
    updateCurrentMarker(position) {
        if (!this.kakaoReady || !this.map) {
            log('지도가 아직 준비되지 않았습니다');
            return;
        }

        const { latitude, longitude } = position;
        const location = new kakao.maps.LatLng(latitude, longitude);

        try {
            // 첫 번째 마커 생성
            if (!this.currentMarker) {
                this.currentMarker = new kakao.maps.Marker({
                    position: location,
                    map: this.map,
                    title: '현재 위치',
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
        } catch (error) {
            log('마커 업데이트 오류', error);
        }
    }

    // 🛣️ 경로 선 그리기
    updatePolyline() {
        if (!this.kakaoReady || !this.map) {
            return;
        }

        if (this.pathCoords.length < 2) {
            return;
        }

        try {
            if (!this.polyline) {
                // 첫 번째 경로선 생성
                this.polyline = new kakao.maps.Polyline({
                    path: this.pathCoords,
                    strokeColor: '#FF0000',
                    strokeWeight: 3,
                    strokeOpacity: 0.7,
                    strokeStyle: 'solid',
                    map: this.map,
                });
                log('경로선 생성됨');
            } else {
                // 기존 경로선 업데이트
                this.polyline.setPath(this.pathCoords);
            }
        } catch (error) {
            log('경로선 그리기 오류', error);
        }
    }

    // 🎯 지도 자동 줌 (모든 경로가 보이도록)
    fitBounds() {
        if (!this.kakaoReady || !this.map) {
            return;
        }

        if (this.pathCoords.length < 2) {
            return;
        }

        try {
            const bounds = new kakao.maps.LatLngBounds();
            
            this.pathCoords.forEach(coord => {
                bounds.extend(coord);
            });

            this.map.setBounds(bounds);
            log('지도 자동 줌 조정');
        } catch (error) {
            log('자동 줌 오류', error);
        }
    }

    // 🔄 초기화
    reset() {
        try {
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
        } catch (error) {
            log('초기화 오류', error);
        }
    }

    // 📍 지도에 마커 추가 (커스텀)
    addMarker(lat, lng, title = '') {
        if (!this.kakaoReady || !this.map) {
            return null;
        }

        try {
            const location = new kakao.maps.LatLng(lat, lng);
            
            const marker = new kakao.maps.Marker({
                position: location,
                map: this.map,
                title: title,
            });

            return marker;
        } catch (error) {
            log('커스텀 마커 추가 오류', error);
            return null;
        }
    }
}

// 전역 지도 매니저 객체
const mapManager = new MapManager();
