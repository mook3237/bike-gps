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

```
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
```

}

// 전역 객체 생성
const mapManager = new MapManager();

맵.js

// 🗺️ 지도 관리자 클래스

// 🔧 로그 함수 (config.js 로드 전에 필요)
function log(message, data = '') {
const timestamp = new Date().toLocaleTimeString();
console.log(`[${timestamp}] ${message}`, data);
}

class MapManager {
constructor() {
this.map = null;
this.currentMarker = null;       // 🟡 현재 위치 마커
this.destinationMarker = null;   // 🔴 목적지 마커
this.polyline = null;            // 🔵 파란색 경로선
this.pathCoords = [];
this.destinationCoord = null;    // 목적지 좌표
log('MapManager 생성됨');
}

```
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

        // 🗺️ 지도 클릭 시 목적지(반환점) 지정 이벤트 추가
        kakao.maps.event.addListener(this.map, 'click', (mouseEvent) => {
            const latlng = mouseEvent.latLng;
            this.setDestination(latlng.getLat(), latlng.getLng());
        });

        log('✅ 지도 초기화 완료!');

    } catch (error) {
        log('❌ 지도 초기화 오류', error.message);
    }
}

// 🎨 마커 이미지 생성 헬퍼 (노랑 / 빨강 / 목표 도달 시 밝은 빨강)
createMarkerImage(color) {
    let colorCode = '#FFD700'; // 기본 노랑 (현재 위치)
    if (color === 'red') colorCode = '#FF3B30';         // 목적지 (빨강)
    if (color === 'bright-red') colorCode = '#FF2D55';   // 목표 속도 도달 시 (더 밝은 빨강)

    const svg = `<svg xmlns="<http://www.w3.org/2000/svg>" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${colorCode}" stroke="#ffffff" stroke-width="2"/></svg>`;
    return new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        new kakao.maps.Size(24, 24),
        { offset: new kakao.maps.Point(12, 12) }
    );
}

// 📍 현재 위치 마커 업데이트 (🟡 노랑)
updateCurrentMarker(position) {
    if (!this.map) {
        log('⚠️ 지도가 준비되지 않음');
        return;
    }

    const { latitude, longitude, speed } = position;
    const location = new kakao.maps.LatLng(latitude, longitude);

    try {
        if (!this.currentMarker) {
            this.currentMarker = new kakao.maps.Marker({
                position: location,
                map: this.map,
                image: this.createMarkerImage('yellow'),
                title: '현재 위치',
            });
        } else {
            this.currentMarker.setPosition(location);
        }

        // 지도 중심을 현재 위치로 이동
        this.map.setCenter(location);
        this.pathCoords.push(location);

        // 주행 중일 때 목적지가 설정되어 있다면 경로선 및 거리/시간 갱신
        if (this.destinationCoord) {
            this.updateRouteAndStats();
        }

        // 🎯 현재 속도와 목표 속도 비교하여 목적지 마커 색상 변경 체크
        const currentSpeedKmH = speed ? speed * 3.6 : 0;
        this.checkTargetSpeed(currentSpeedKmH);

    } catch (error) {
        log('❌ 마커 오류', error.message);
    }
}

// 🏁 목적지 설정 함수 (지도 클릭 시 호출)
setDestination(lat, lng) {
    this.destinationCoord = new kakao.maps.LatLng(lat, lng);

    try {
        if (!this.destinationMarker) {
            this.destinationMarker = new kakao.maps.Marker({
                position: this.destinationCoord,
                map: this.map,
                image: this.createMarkerImage('red'),
                title: '목적지'
            });
        } else {
            this.destinationMarker.setPosition(this.destinationCoord);
        }

        log('✅ 목적지 설정 완료');
        if (this.currentMarker) {
            this.updateRouteAndStats();
        }
    } catch (error) {
        log('❌ 목적지 설정 오류', error.message);
    }
}

// 🔵 파란색 경로선 및 거리/예상시간 계산 업데이트
updateRouteAndStats() {
    if (!this.map || !this.currentMarker || !this.destinationCoord) return;

    const currentPos = this.currentMarker.getPosition();
    const routeTypeSelect = document.getElementById('routeType');
    const routeType = routeTypeSelect ? routeTypeSelect.value : 'one-way';

    let linePath = [currentPos, this.destinationCoord];

    // 왕복 코스일 경우 반환점을 거쳐 다시 돌아오는 경로 표현
    if (routeType === 'round-trip' && this.pathCoords.length > 0) {
        const startPos = this.pathCoords[0]; // 출발지
        linePath = [currentPos, this.destinationCoord, startPos];
    }

    try {
        if (this.polyline) {
            this.polyline.setPath(linePath);
        } else {
            this.polyline = new kakao.maps.Polyline({
                path: linePath,
                strokeWeight: 5,
                strokeColor: '#0A84FF', // 🔵 파란 경로선
                strokeOpacity: 0.8,
                strokeStyle: 'solid',
                map: this.map,
            });
        }

        // 📏 거리 및 예상 시간 계산 후 화면(오버레이) 반영
        let totalMeters = 0;
        for (let i = 0; i < linePath.length - 1; i++) {
            totalMeters += linePath[i].getLength();
        }

        const km = (totalMeters / 1000).toFixed(2);
        const minutes = Math.round((totalMeters / 1000) / 15 * 60); // 자전거 평균 시속 15km 기준 예상 시간

        const distEl = document.getElementById('map-current-distance');
        const timeEl = document.getElementById('map-elapsed-time'); // 또는 예상 시간 표시용 엘리먼트

        if (distEl) distEl.innerText = km;
        log(`📊 경로 거리: ${km}km, 예상 시간: ${minutes}분`);

    } catch (error) {
        log('❌ 경로선 오류', error.message);
    }
}

// ⚡ 목표 속도 도달 시 목적지 마커 색상 변경 (🔴 빨강 ➔ ✨ 더 밝은 빨강)
checkTargetSpeed(currentSpeed) {
    if (!this.destinationMarker) return;

    const targetSpeedInput = document.getElementById('target-speed');
    const targetSpeed = targetSpeedInput ? parseFloat(targetSpeedInput.value) : 0;

    if (!isNaN(targetSpeed) && targetSpeed > 0 && currentSpeed >= targetSpeed) {
        // 목표 속도 도달 시 더 밝은 빨간색으로 변경
        this.destinationMarker.setImage(this.createMarkerImage('bright-red'));
    } else {
        // 미도달 시 기본 빨간색 유지
        this.destinationMarker.setImage(this.createMarkerImage('red'));
    }
}

// 📈 경로 폴리라인 업데이트 (기존 호환용)
updatePolyline() {
    if (this.destinationCoord && this.currentMarker) {
        this.updateRouteAndStats();
    }
}

// 🔄 초기화
reset() {
    this.pathCoords = [];
    this.destinationCoord = null;
    if (this.polyline) {
        this.polyline.setMap(null);
        this.polyline = null;
    }
    if (this.destinationMarker) {
        this.destinationMarker.setMap(null);
        this.destinationMarker = null;
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
        if (this.destinationCoord) {
            bounds.extend(this.destinationCoord);
        }
        this.map.setBounds(bounds);
        log('✅ 경로에 맞게 줌 조정됨');
    } catch (error) {
        log('❌ 줌 조정 오류', error.message);
    }
}
```

}

// 전역 객체 생성
const mapManager = new MapManager();
