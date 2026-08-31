// 🗺️ 지도 관리자 클래스

// 🔧 로그 함수
function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}

class MapManager {

    constructor() {
        this.map = null;

        // 📍 현재 위치
        this.currentMarker = null;

        // 🎯 목적지
        this.destinationMarker = null;
        this.destinationLocation = null;
        this.isSelectingDestination = false;

        // 📈 이동 경로
        this.polyline = null;
        this.pathCoords = [];

        // 버튼
        this.locationButton = null;
        this.destinationButton = null;

        log('MapManager 생성됨');
    }


    // ========================================
    // 🗺️ 지도 초기화
    // ========================================
    initMap() {

        log('🗺️ 지도 초기화 시작...');

        try {

            const mapContainer =
                document.getElementById('map');

            if (!mapContainer) {
                log('❌ 지도 컨테이너를 찾을 수 없음');
                return;
            }

            // 지도 컨테이너가 absolute 버튼의 기준점이 되도록 설정
            const positionStyle =
                window.getComputedStyle(
                    mapContainer
                ).position;

            if (positionStyle === 'static') {
                mapContainer.style.position =
                    'relative';
            }


            const mapOption = {

                center:
                    new kakao.maps.LatLng(
                        CONFIG.MAP.centerLat,
                        CONFIG.MAP.centerLng
                    ),

                level:
                    CONFIG.MAP.initialZoom
            };


            this.map =
                new kakao.maps.Map(
                    mapContainer,
                    mapOption
                );


            log('✅ 지도 초기화 완료!');


            // 📍 현재 위치 버튼
            this.createCurrentLocationButton();


            // 🎯 목적지 버튼
            this.createDestinationButton();


            // 🎯 지도 클릭 이벤트
            this.setupMapClickForDestination();


        } catch (error) {

            log(
                '❌ 지도 초기화 오류',
                error.message
            );
        }
    }


    // ========================================
    // 📍 현재 위치 버튼
    // ========================================
    createCurrentLocationButton() {

        if (!this.map) {
            return;
        }

        if (this.locationButton) {
            return;
        }


        const mapContainer =
            document.getElementById('map');

        if (!mapContainer) {
            return;
        }


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'current-location-button';


        button.setAttribute(
            'aria-label',
            '현재 위치'
        );


        button.setAttribute(
            'title',
            '현재 위치'
        );


        // SVG 스타일의 간단한 현재위치 아이콘
        button.innerHTML = `
            <span style="
                display:flex;
                align-items:center;
                justify-content:center;
                width:100%;
                height:100%;
                font-size:23px;
            ">📍</span>
        `;


        Object.assign(
            button.style,
            {
                position: 'absolute',

                right: '14px',
                bottom: '14px',

                width: '48px',
                height: '48px',

                border: 'none',
                borderRadius: '50%',

                background: '#ffffff',

                boxShadow:
                    '0 2px 8px rgba(0,0,0,0.25)',

                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',

                fontSize: '23px',

                cursor: 'pointer',

                zIndex: '1000',

                padding: '0',

                margin: '0',

                pointerEvents: 'auto',

                touchAction: 'manipulation',

                transition:
                    'transform 0.15s ease, box-shadow 0.15s ease'
            }
        );


        // PC 마우스 효과
        button.addEventListener(
            'mouseenter',
            () => {

                if (button.disabled) {
                    return;
                }

                button.style.transform =
                    'scale(1.05)';

                button.style.boxShadow =
                    '0 3px 10px rgba(0,0,0,0.30)';
            }
        );


        button.addEventListener(
            'mouseleave',
            () => {

                button.style.transform =
                    'scale(1)';

                button.style.boxShadow =
                    '0 2px 8px rgba(0,0,0,0.25)';
            }
        );


        // 터치 효과
        button.addEventListener(
            'touchstart',
            () => {

                if (button.disabled) {
                    return;
                }

                button.style.transform =
                    'scale(0.92)';
            },
            {
                passive: true
            }
        );


        button.addEventListener(
            'touchend',
            () => {

                button.style.transform =
                    'scale(1)';
            },
            {
                passive: true
            }
        );


        // 클릭
        button.addEventListener(
            'click',
            (event) => {

                event.preventDefault();
                event.stopPropagation();

                this.goToCurrentLocation();
            }
        );


        mapContainer.appendChild(button);

        this.locationButton =
            button;


        log(
            '✅ 현재 위치 버튼 생성 완료'
        );
    }


    // ========================================
// 📍 현재 위치로 이동
// ========================================
goToCurrentLocation() {

    log('📍 현재 위치 버튼 클릭');


    if (!this.map) {
        log('⚠️ 현재 위치 이동 실패: 지도 없음');
        return;
    }


    // ========================================
    // 1️⃣ GPS 추적기가 이미 받은 최신 위치 사용
    // ========================================
    if (
        typeof gpsTracker !== 'undefined' &&
        Array.isArray(gpsTracker.positions) &&
        gpsTracker.positions.length > 0
    ) {

        const latestPosition =
            gpsTracker.positions[
                gpsTracker.positions.length - 1
            ];


        if (
            Number.isFinite(latestPosition.latitude) &&
            Number.isFinite(latestPosition.longitude)
        ) {

            log(
                '⚡ 이미 받은 최신 GPS 위치 사용',
                latestPosition
            );


            const coords = {
                latitude:
                    latestPosition.latitude,

                longitude:
                    latestPosition.longitude,

                accuracy:
                    latestPosition.accuracy,

                speed:
                    latestPosition.speed,

                altitude:
                    latestPosition.altitude,

                heading:
                    latestPosition.heading,

                timestamp:
                    latestPosition.timestamp
            };


            // 현재 위치 마커 이동
            // ※ 경로에는 추가하지 않음
            this.updateCurrentMarker(
                coords,
                false
            );


            const location =
                new kakao.maps.LatLng(
                    coords.latitude,
                    coords.longitude
                );


            // 지도 중심 이동
            this.map.setCenter(
                location
            );


            // 현재 위치 보기 좋은 확대
            this.map.setLevel(2);


            log(
                '✅ 최신 GPS 위치로 즉시 이동 완료',
                {
                    latitude:
                        coords.latitude,

                    longitude:
                        coords.longitude,

                    accuracy:
                        coords.accuracy
                }
            );


            return;
        }
    }


    // ========================================
    // 2️⃣ 아직 GPS를 한 번도 받은 적이 없으면
    //    백업으로 현재 위치 1회 요청
    // ========================================
    log(
        '📡 아직 GPS 위치가 없음 → 현재 위치 1회 요청'
    );


    if (!navigator.geolocation) {

        alert(
            '이 브라우저는 위치 정보를 지원하지 않습니다.'
        );

        return;
    }


    // 버튼 로딩 상태
    if (this.locationButton) {

        this.locationButton.innerHTML =
            '⏳';

        this.locationButton.disabled =
            true;

        this.locationButton.style.opacity =
            '0.7';
    }


    const restoreButton = () => {

        if (!this.locationButton) {
            return;
        }


        this.locationButton.innerHTML =
            `
            <span style="
                display:flex;
                align-items:center;
                justify-content:center;
                width:100%;
                height:100%;
                font-size:23px;
            ">📍</span>
            `;


        this.locationButton.disabled =
            false;

        this.locationButton.style.opacity =
            '1';
    };


    navigator.geolocation.getCurrentPosition(

        (position) => {

            const {
                latitude,
                longitude,
                accuracy,
                speed,
                altitude,
                heading
            } = position.coords;


            const coords = {

                latitude,

                longitude,

                accuracy,

                speed:
                    Number.isFinite(speed)
                        ? speed
                        : null,

                altitude:
                    Number.isFinite(altitude)
                        ? altitude
                        : null,

                heading:
                    Number.isFinite(heading)
                        ? heading
                        : null,

                timestamp:
                    position.timestamp
            };


            log(
                '✅ 백업 GPS 위치 수신',
                coords
            );


            // 마커만 이동
            // 경로에는 추가하지 않음
            this.updateCurrentMarker(
                coords,
                false
            );


            const location =
                new kakao.maps.LatLng(
                    latitude,
                    longitude
                );


            this.map.setCenter(
                location
            );


            this.map.setLevel(2);


            restoreButton();


            log(
                '✅ 현재 위치로 이동 완료'
            );
        },


        (error) => {

            log(
                '❌ 백업 현재 위치 확인 실패',
                {
                    code:
                        error.code,

                    message:
                        error.message
                }
            );


            restoreButton();


            let message =
                '현재 위치를 확인할 수 없습니다.';


            switch (error.code) {

                case error.PERMISSION_DENIED:

                    message =
                        '위치 권한이 거부되었습니다.\n' +
                        '브라우저의 위치 권한을 허용해주세요.';

                    break;


                case error.POSITION_UNAVAILABLE:

                    message =
                        '현재 위치를 확인할 수 없습니다.\n' +
                        'GPS 신호를 확인해주세요.';

                    break;


                case error.TIMEOUT:

                    message =
                        '현재 위치를 아직 확인하지 못했습니다.\n' +
                        'GPS 신호를 조금 기다린 후 다시 눌러주세요.';

                    break;
            }


            alert(message);
        },


        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 2000
        }
    );
}

    // ========================================
    // 📍 현재 위치 버튼 복구
    // ========================================
    restoreLocationButton() {

        if (!this.locationButton) {
            return;
        }

        this.locationButton.innerHTML =
            `
            <span style="
                display:flex;
                align-items:center;
                justify-content:center;
                width:100%;
                height:100%;
                font-size:23px;
            ">📍</span>
            `;

        this.locationButton.disabled =
            false;

        this.locationButton.style.opacity =
            '1';
    }


    // ========================================
    // 🎯 목적지 버튼
    // ========================================
    createDestinationButton() {

        if (!this.map) {
            return;
        }

        if (this.destinationButton) {
            return;
        }


        const mapContainer =
            document.getElementById('map');

        if (!mapContainer) {
            return;
        }


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'destination-button';


        button.setAttribute(
            'aria-label',
            '목적지 설정'
        );


        button.setAttribute(
            'title',
            '목적지 설정'
        );


        button.innerHTML = '🎯';


        Object.assign(
            button.style,
            {
                position: 'absolute',

                right: '14px',
                bottom: '72px',

                width: '48px',
                height: '48px',

                border: 'none',
                borderRadius: '50%',

                background: '#ffffff',

                boxShadow:
                    '0 2px 8px rgba(0,0,0,0.25)',

                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',

                fontSize: '22px',

                cursor: 'pointer',

                zIndex: '1000',

                padding: '0',

                margin: '0',

                pointerEvents: 'auto',

                touchAction: 'manipulation',

                transition:
                    'transform 0.15s ease, box-shadow 0.15s ease'
            }
        );


        // PC 마우스
        button.addEventListener(
            'mouseenter',
            () => {

                if (button.disabled) {
                    return;
                }

                button.style.transform =
                    'scale(1.05)';
            }
        );


        button.addEventListener(
            'mouseleave',
            () => {

                button.style.transform =
                    'scale(1)';
            }
        );


        // 터치
        button.addEventListener(
            'touchstart',
            () => {

                if (button.disabled) {
                    return;
                }

                button.style.transform =
                    'scale(0.92)';
            },
            {
                passive: true
            }
        );


        button.addEventListener(
            'touchend',
            () => {

                button.style.transform =
                    'scale(1)';
            },
            {
                passive: true
            }
        );


        // 클릭
        button.addEventListener(
            'click',
            (event) => {

                event.preventDefault();
                event.stopPropagation();

                this.startDestinationSelection();
            }
        );


        mapContainer.appendChild(button);

        this.destinationButton =
            button;


        log(
            '✅ 목적지 버튼 생성 완료'
        );
    }


    // ========================================
    // 🎯 목적지 선택 시작
    // ========================================
    startDestinationSelection() {

        if (!this.map) {
            return;
        }


        this.isSelectingDestination =
            true;


        this.updateDestinationButtonState();


        log(
            '🎯 목적지 선택 모드 시작'
        );


        // 버튼만 눌렀을 때도 안내
        alert(
            '지도를 눌러 목적지를 선택하세요.'
        );
    }


    // ========================================
    // 🎯 목적지 버튼 상태 변경
    // ========================================
    updateDestinationButtonState() {

        if (!this.destinationButton) {
            return;
        }


        if (
            this.isSelectingDestination
        ) {

            this.destinationButton.innerHTML =
                '✅';

            this.destinationButton.style.background =
                '#e8f5e9';

            this.destinationButton.title =
                '지도에서 목적지를 선택하세요.';

        } else {

            this.destinationButton.innerHTML =
                '🎯';

            this.destinationButton.style.background =
                '#ffffff';

            this.destinationButton.title =
                '목적지 설정';
        }
    }


    // ========================================
    // 🎯 지도 클릭 이벤트
    // ========================================
    setupMapClickForDestination() {

        if (!this.map) {
            return;
        }


        kakao.maps.event.addListener(
            this.map,
            'click',
            (mouseEvent) => {

                if (
                    !this.isSelectingDestination
                ) {
                    return;
                }


                const location =
                    mouseEvent.latLng;


                this.setDestination(
                    location
                );
            }
        );


        log(
            '✅ 목적지 지도 클릭 이벤트 설정 완료'
        );
    }


    // ========================================
    // 🎯 목적지 지정
    // ========================================
    setDestination(location) {

        if (!this.map) {
            return;
        }


        this.destinationLocation =
            location;


        // 기존 목적지 마커 제거
        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );
        }


        // 목적지 마커 생성
        this.destinationMarker =
            new kakao.maps.Marker({

                position:
                    location,

                map:
                    this.map,

                title:
                    '목적지'
            });


        // 선택 모드 종료
        this.isSelectingDestination =
            false;


        this.updateDestinationButtonState();


        log(
            '🎯 목적지 설정 완료',
            {
                latitude:
                    location.getLat(),

                longitude:
                    location.getLng()
            }
        );


        alert(
            '🎯 목적지가 설정되었습니다.'
        );
    }


    // ========================================
    // 🎯 목적지 삭제
    // ========================================
    clearDestination() {

        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );

            this.destinationMarker =
                null;
        }


        this.destinationLocation =
            null;


        this.isSelectingDestination =
            false;


        this.updateDestinationButtonState();


        log(
            '🗑️ 목적지 삭제 완료'
        );
    }


    // ========================================
    // 📍 현재 위치 마커
    // ========================================
    updateCurrentMarker(
        position,
        addToPath = true
    ) {

        if (!this.map) {

            log(
                '⚠️ 지도가 준비되지 않음'
            );

            return;
        }


        const {
            latitude,
            longitude
        } = position;


        const location =
            new kakao.maps.LatLng(
                latitude,
                longitude
            );


        try {

            // 현재 위치 마커 생성/이동
            if (
                !this.currentMarker
            ) {

                this.currentMarker =
                    new kakao.maps.Marker({

                        position:
                            location,

                        map:
                            this.map,

                        title:
                            '현재 위치'
                    });

            } else {

                this.currentMarker.setPosition(
                    location
                );
            }


            // GPS 추적 시 현재 위치를 따라감
            this.map.setCenter(
                location
            );


            this.map.setLevel(2);


            // 실제 주행 경로에만 추가
            if (addToPath) {

                this.pathCoords.push(
                    location
                );
            }


        } catch (error) {

            log(
                '❌ 현재 위치 마커 오류',
                error.message
            );
        }
    }


    // ========================================
    // 📈 이동 경로
    // ========================================
    updatePolyline() {

        if (
            !this.map ||
            this.pathCoords.length < 2
        ) {
            return;
        }


        try {

            if (
                this.polyline
            ) {

                this.polyline.setPath(
                    this.pathCoords
                );

            } else {

                this.polyline =
                    new kakao.maps.Polyline({

                        path:
                            this.pathCoords,

                        strokeWeight:
                            3,

                        strokeColor:
                            '#4CAF50',

                        strokeOpacity:
                            0.8,

                        strokeStyle:
                            'solid',

                        map:
                            this.map
                    });
            }


        } catch (error) {

            log(
                '❌ 폴리라인 오류',
                error.message
            );
        }
    }


    // ========================================
    // 🔄 지도 초기화
    // ========================================
    reset() {

        this.pathCoords = [];


        if (this.polyline) {

            this.polyline.setMap(
                null
            );

            this.polyline =
                null;
        }


        // 목적지는 초기화하지 않음
        // 현재는 사용자가 직접 삭제할 수 있도록 유지


        log(
            '🔄 지도 주행 경로 초기화됨'
        );
    }


    // ========================================
    // 📏 경로 범위에 맞게 줌
    // ========================================
    fitBounds() {

        if (
            !this.map ||
            this.pathCoords.length === 0
        ) {
            return;
        }


        try {

            const bounds =
                new kakao.maps.LatLngBounds();


            this.pathCoords.forEach(
                coord => {

                    bounds.extend(
                        coord
                    );
                }
            );


            this.map.setBounds(
                bounds
            );


            log(
                '✅ 경로에 맞게 줌 조정됨'
            );


        } catch (error) {

            log(
                '❌ 줌 조정 오류',
                error.message
            );
        }
    }
}


// ========================================
// 🌎 전역 객체 생성
// ========================================
const mapManager =
    new MapManager();
