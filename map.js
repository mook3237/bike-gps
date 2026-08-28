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



    // 🗺️ 지도 초기화

    initMap() {

        log('🗺️ 지도 초기화 시작...');



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



        } catch (error) {

            log('❌ 지도 초기화 오류', error.message);

        }

    }



    // 📍 현재 위치 마커 업데이트

    updateCurrentMarker(position) {

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



        } catch (error) {

            log('❌ 마커 오류', error.message);

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
