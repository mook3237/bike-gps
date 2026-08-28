/* 🗺️ NAVIGATION.JS - 편도/왕복 경로, 목적지 마커, 목표속도 체크 */

class BikeNavigation {
    constructor() {
        this.currentMode = 'single';
        this.destination = null;
        this.currentLocation = null;
        this.routePolyline = null;
        this.destinationMarker = null;
        this.targetReachedMarker = null;
        this.isTargetReached = false;
        
        this.init();
    }

    init() {
        // 네비게이션 토글 버튼
        document.querySelectorAll('.nav-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentMode = e.target.dataset.mode;
                if (this.destination && this.currentLocation) {
                    this.calculateRoute();
                }
            });
        });

        // 목적지 입력
        document.getElementById('destination-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query) this.searchDestination(query);
            }
        });

        // 초기화 버튼
        document.getElementById('clear-nav-btn').addEventListener('click', () => {
            this.clearNavigation();
        });

        log('✅ 네비게이션 초기화');
    }

    // 주소로 목적지 검색
    searchDestination(query) {
        if (!window.kakao || !mapManager.map) return;
        
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(query, (result, status) => {
            if (status === kakao.maps.services.Status.OK) {
                this.destination = { 
                    lat: parseFloat(result[0].y), 
                    lng: parseFloat(result[0].x) 
                };
                this.showDestinationMarker();
                if (this.currentLocation) this.calculateRoute();
            } else {
                alert('목적지를 찾을 수 없습니다');
            }
        });
    }

    // GPS 위치 업데이트
    updateLocation(lat, lng) {
        this.currentLocation = { lat, lng };
        
        if (this.destination && !this.routePolyline) {
            this.calculateRoute();
        }
    }

    // 경로 계산 & 그리기 (파란선)
    calculateRoute() {
        if (!this.currentLocation || !this.destination || !window.kakao || !mapManager.map) return;

        const directions = new kakao.maps.services.Directions();
        const start = new kakao.maps.LatLng(this.currentLocation.lat, this.currentLocation.lng);
        const end = new kakao.maps.LatLng(this.destination.lat, this.destination.lng);

        directions.getDirection({ 
            origin: start, 
            destination: end, 
            roadview: false, 
            alternatives: false, 
            asyncMode: true 
        }, (result, status) => {
            if (status !== kakao.maps.services.Status.OK) return;

            let pathCoords = [];
            result.routes[0].sections.forEach(section => {
                section.roads.forEach(road => {
                    pathCoords.push(new kakao.maps.LatLng(road.b_y, road.b_x));
                });
                const lastRoad = section.roads[section.roads.length - 1];
                pathCoords.push(new kakao.maps.LatLng(lastRoad.e_y, lastRoad.e_x));
            });

            const distance = result.routes[0].summary.distance;
            const duration = result.routes[0].summary.duration;

            // 왕복인 경우
            if (this.currentMode === 'round') {
                directions.getDirection({ 
                    origin: end, 
                    destination: start, 
                    roadview: false, 
                    alternatives: false, 
                    asyncMode: true 
                }, (result2, status2) => {
                    if (status2 === kakao.maps.services.Status.OK) {
                        let returnCoords = [];
                        result2.routes[0].sections.forEach(section => {
                            section.roads.forEach(road => {
                                returnCoords.push(new kakao.maps.LatLng(road.b_y, road.b_x));
                            });
                            const lastRoad = section.roads[section.roads.length - 1];
                            returnCoords.push(new kakao.maps.LatLng(lastRoad.e_y, lastRoad.e_x));
                        });
                        pathCoords = pathCoords.concat(returnCoords);
                        this.drawRoute(pathCoords, distance * 2, duration * 2);
                    }
                });
            } else {
                this.drawRoute(pathCoords, distance, duration);
            }
        });
    }

    // 경로 표시 (파란선)
    drawRoute(pathCoords, distance, duration) {
        if (this.routePolyline) this.routePolyline.setMap(null);

        this.routePolyline = new kakao.maps.Polyline({
            path: pathCoords,
            strokeWeight: 4,
            strokeColor: '#4B9BFF',
            strokeOpacity: 0.8,
            strokeStyle: 'solid',
            map: mapManager.map
        });

        // 거리/시간 표시
        document.getElementById('nav-distance').textContent = `${(distance / 1000).toFixed(1)} km`;
        document.getElementById('nav-time').textContent = `${Math.ceil(duration / 60)}분`;

        // 지도 경계 조정
        const bounds = new kakao.maps.LatLngBounds();
        pathCoords.forEach(coord => bounds.extend(coord));
        mapManager.map.setBounds(bounds);

        log('🗺️ 경로 표시됨');
    }

    // 목적지 마커 (빨강)
    showDestinationMarker() {
        if (this.destinationMarker) this.destinationMarker.setMap(null);

        const imageSize = new kakao.maps.Size(20, 20);
        const imageOption = { offset: new kakao.maps.Point(10, 10) };
        const markerImage = new kakao.maps.MarkerImage(
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjRkY2QjZCIiBzdHJva2U9IiNGRjQ0NDQiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==',
            imageSize,
            imageOption
        );

        this.destinationMarker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(this.destination.lat, this.destination.lng),
            map: mapManager.map,
            image: markerImage,
            title: '목적지',
            zIndex: 5
        });
    }

    // 🆕 목표속도 도달 → 마커 색상 변경
    markTargetReached() {
        if (!this.destinationMarker || this.isTargetReached) return;

        this.isTargetReached = true;
        const imageSize = new kakao.maps.Size(24, 24);
        const imageOption = { offset: new kakao.maps.Point(12, 12) };
        const reachedImage = new kakao.maps.MarkerImage(
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5IiBmaWxsPSIjRkY0NDQ0IiBzdHJva2U9IiNDQzAwMDAiIHN0cm9rZS13aWR0aD0iMyIvPjwvc3ZnPg==',
            imageSize,
            imageOption
        );
        this.destinationMarker.setImage(reachedImage);
        log('🚀 목표속도 도달 - 마커 색상 변경');
    }

    // 초기화
    clearNavigation() {
        if (this.routePolyline) {
            this.routePolyline.setMap(null);
            this.routePolyline = null;
        }
        if (this.destinationMarker) {
            this.destinationMarker.setMap(null);
            this.destinationMarker = null;
        }
        this.destination = null;
        this.isTargetReached = false;
        document.getElementById('destination-input').value = '';
        document.getElementById('nav-distance').textContent = '-';
        document.getElementById('nav-time').textContent = '-';
        log('🧹 네비게이션 초기화');
    }

    // 지도 클릭 → 목적지 설정
    setupMapClick() {
        if (!mapManager.map) return;
        kakao.maps.event.addListener(mapManager.map, 'click', (e) => {
            const lat = e.latLng.getLat();
            const lng = e.latLng.getLng();
            this.destination = { lat, lng };
            document.getElementById('destination-input').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            this.showDestinationMarker();
            if (this.currentLocation) this.calculateRoute();
        });
    }
}

// 전역 인스턴스
const bikeNav = new BikeNavigation();
