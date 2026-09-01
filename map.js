// 🗺️ 지도 관리자 클래스

function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}


class MapManager {

    constructor() {

        this.map = null;


        // ========================================
        // 📍 현재 위치
        // ========================================
        this.currentMarker = null;


        // ========================================
        // 🎯 목적지
        // ========================================
        this.destinationMarker = null;
        this.destinationLocation = null;
        this.isSelectingDestination = false;


        // ========================================
        // 📈 실제 주행 경로
        // ========================================
        this.polyline = null;
        this.pathCoords = [];


        // ========================================
        // 🚴 네비게이션 경로
        // ========================================
        this.navigationPolyline = null;
        this.navigationPathCoords = [];
        this.navigationDistance = 0;
        this.navigationTime = 0;

        this.isLoadingRoute = false;
        this.isNavigating = false;


        // ========================================
        // 버튼
        // ========================================
        this.locationButton = null;
        this.destinationButton = null;
        this.routeButton = null;


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

                log(
                    '❌ 지도 컨테이너를 찾을 수 없음'
                );

                return;
            }


            if (
                window.getComputedStyle(
                    mapContainer
                ).position === 'static'
            ) {

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


            // 버튼 생성
            this.createCurrentLocationButton();

            this.createDestinationButton();

            this.createRouteButton();


            // 목적지 선택 이벤트
            this.setupMapClickForDestination();


            // ========================================
            // 📍 지도 시작 시 현재 위치 자동 요청
            // ========================================
            this.requestInitialLocation();


        } catch (error) {

            log(
                '❌ 지도 초기화 오류',
                error.message
            );
        }
    }


    // ========================================
    // 📍 앱 시작 시 현재 위치 자동 요청
    // ========================================
    requestInitialLocation() {

        if (
            !navigator.geolocation
        ) {
            return;
        }


        navigator.geolocation.getCurrentPosition(

            (position) => {

                const coords = {

                    latitude:
                        position.coords.latitude,

                    longitude:
                        position.coords.longitude,

                    accuracy:
                        position.coords.accuracy,

                    speed:
                        Number.isFinite(
                            position.coords.speed
                        )
                            ? position.coords.speed
                            : null,

                    altitude:
                        Number.isFinite(
                            position.coords.altitude
                        )
                            ? position.coords.altitude
                            : null,

                    heading:
                        Number.isFinite(
                            position.coords.heading
                        )
                            ? position.coords.heading
                            : null,

                    timestamp:
                        position.timestamp
                };


                this.updateCurrentMarker(
                    coords,
                    false
                );


                const location =
                    new kakao.maps.LatLng(
                        coords.latitude,
                        coords.longitude
                    );


                this.map.setCenter(
                    location
                );


                this.map.setLevel(2);


                log(
                    '📍 초기 현재 위치 자동 확보',
                    coords
                );
            },


            (error) => {

                log(
                    '⚠️ 초기 현재 위치 확인 실패',
                    error
                );
            },


            {
                enableHighAccuracy: true,

                timeout: 5000,

                maximumAge: 2000
            }
        );
    }


    // ========================================
    // 📍 현재 위치 버튼
    // ========================================
    createCurrentLocationButton() {

        if (
            !this.map ||
            this.locationButton
        ) {
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


        button.innerHTML = '📍';


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

                touchAction: 'manipulation'
            }
        );


        button.addEventListener(

            'click',

            (event) => {

                event.preventDefault();

                event.stopPropagation();


                if (button.disabled) {
                    return;
                }


                this.goToCurrentLocation();
            }
        );


        mapContainer.appendChild(
            button
        );


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

        log(
            '📍 현재 위치 버튼 클릭'
        );


        if (!this.map) {
            return;
        }


        // ========================================
        // 이미 GPS 위치가 있는 경우
        // ========================================
        if (

            typeof gpsTracker !==
                'undefined' &&

            Array.isArray(
                gpsTracker.positions
            ) &&

            gpsTracker.positions.length > 0
        ) {

            const latestPosition =
                gpsTracker.positions[
                    gpsTracker.positions.length - 1
                ];


            if (

                Number.isFinite(
                    latestPosition.latitude
                ) &&

                Number.isFinite(
                    latestPosition.longitude
                )
            ) {

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


                this.updateCurrentMarker(
                    coords,
                    false
                );


                const location =
                    new kakao.maps.LatLng(
                        coords.latitude,
                        coords.longitude
                    );


                this.map.setCenter(
                    location
                );


                this.map.setLevel(2);


                log(
                    '⚡ 최신 GPS 위치로 즉시 이동',
                    coords
                );


                return;
            }
        }


        // ========================================
        // GPS 지원 여부
        // ========================================
        if (
            !navigator.geolocation
        ) {

            alert(
                '이 브라우저는 위치 정보를 지원하지 않습니다.'
            );

            return;
        }


        // ========================================
        // 버튼 로딩 상태
        // ========================================
        if (
            this.locationButton
        ) {

            this.locationButton.innerHTML =
                '⏳';

            this.locationButton.disabled =
                true;
        }


        // ========================================
        // 현재 위치 1회 요청
        // ========================================
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


                this.restoreLocationButton();


                log(
                    '✅ 1회 GPS 위치 확보',
                    coords
                );
            },


            (error) => {

                log(
                    '❌ 현재 위치 확인 실패',
                    error
                );


                this.restoreLocationButton();


                alert(
                    '현재 위치를 확인할 수 없습니다.'
                );
            },


            {

                enableHighAccuracy:
                    true,

                timeout:
                    5000,

                maximumAge:
                    2000
            }
        );
    }


    // ========================================
    // 📍 현재 위치 버튼 복구
    // ========================================
    restoreLocationButton() {

        if (
            !this.locationButton
        ) {
            return;
        }


        this.locationButton.innerHTML =
            '📍';


        this.locationButton.disabled =
            false;
    }


    // ========================================
    // 🎯 목적지 버튼
    // ========================================
    createDestinationButton() {

        if (
            !this.map ||
            this.destinationButton
        ) {
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


        button.innerHTML =
            '🎯';


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

                touchAction: 'manipulation'
            }
        );


        button.addEventListener(

            'click',

            (event) => {

                event.preventDefault();

                event.stopPropagation();


                this.startDestinationSelection();
            }
        );


        mapContainer.appendChild(
            button
        );


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


        alert(
            '지도를 눌러 목적지를 선택하세요.'
        );
    }


    // ========================================
    // 🎯 목적지 버튼 상태
    // ========================================
    updateDestinationButtonState() {

        if (
            !this.destinationButton
        ) {
            return;
        }


        if (
            this.isSelectingDestination
        ) {

            this.destinationButton.innerHTML =
                '✅';

            this.destinationButton.style.background =
                '#e8f5e9';

        } else {

            this.destinationButton.innerHTML =
                '🎯';

            this.destinationButton.style.background =
                '#ffffff';
        }
    }


    // ========================================
    // 🎯 지도 클릭
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


        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );
        }


        this.destinationMarker =
            new kakao.maps.Marker({

                position:
                    location,

                map:
                    this.map,

                title:
                    '목적지'
            });


        this.isSelectingDestination =
            false;


        this.updateDestinationButtonState();


        this.clearNavigationRoute();


        this.updateRouteButtonState();


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
            '🎯 목적지가 설정되었습니다.\n\n' +
            '🚴 버튼을 누르면 자전거 경로를 찾습니다.'
        );
    }


    // ========================================
    // 🚴 자전거 경로 버튼
    // ========================================
    createRouteButton() {

        if (
            !this.map ||
            this.routeButton
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        if (!mapContainer) {
            return;
        }


        const button =
            document.createElement('button');


        button.type =
            'button';


        button.className =
            'route-button';


        button.setAttribute(
            'aria-label',
            '자전거 경로 찾기'
        );


        button.setAttribute(
            'title',
            '자전거 경로 찾기'
        );


        button.innerHTML =
            '🚴';


        Object.assign(
            button.style,
            {

                position: 'absolute',

                right: '14px',

                bottom: '130px',

                width: '48px',

                height: '48px',

                border: 'none',

                borderRadius: '50%',

                background: '#eeeeee',

                color: '#999999',

                boxShadow:
                    '0 2px 8px rgba(0,0,0,0.20)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                fontSize: '22px',

                cursor: 'not-allowed',

                zIndex: '1000',

                padding: '0',

                margin: '0',

                pointerEvents: 'auto',

                touchAction: 'manipulation',

                transition:
                    'transform 0.15s ease'
            }
        );


        button.disabled =
            true;


        button.addEventListener(

            'click',

            (event) => {

                event.preventDefault();

                event.stopPropagation();


                if (button.disabled) {
                    return;
                }


                this.requestBicycleRoute();
            }
        );


        mapContainer.appendChild(
            button
        );


        this.routeButton =
            button;


        log(
            '✅ 자전거 경로 버튼 생성 완료'
        );
    }


    // ========================================
    // 🚴 자전거 경로 버튼 상태
    // ========================================
    updateRouteButtonState() {

        if (
            !this.routeButton
        ) {
            return;
        }


        if (

            this.destinationLocation &&

            !this.isLoadingRoute
        ) {

            this.routeButton.disabled =
                false;

            this.routeButton.style.background =
                '#ffffff';

            this.routeButton.style.color =
                '#111111';

            this.routeButton.style.cursor =
                'pointer';

        } else {

            this.routeButton.disabled =
                true;

            this.routeButton.style.background =
                '#eeeeee';

            this.routeButton.style.color =
                '#999999';

            this.routeButton.style.cursor =
                'not-allowed';
        }
    }


    // ========================================
    // 🚴 출발지 좌표 가져오기
    // ========================================
    getCurrentOrigin() {

        // ========================================
        // 1. gpsTracker 최신 위치
        // ========================================
        if (

            typeof gpsTracker !==
                'undefined' &&

            Array.isArray(
                gpsTracker.positions
            ) &&

            gpsTracker.positions.length > 0
        ) {

            const latest =
                gpsTracker.positions[
                    gpsTracker.positions.length - 1
                ];


            if (

                Number.isFinite(
                    latest.latitude
                ) &&

                Number.isFinite(
                    latest.longitude
                )
            ) {

                return {

                    latitude:
                        latest.latitude,

                    longitude:
                        latest.longitude
                };
            }
        }


        // ========================================
        // 2. 현재 위치 마커
        // ========================================
        if (
            this.currentMarker
        ) {

            const position =
                this.currentMarker.getPosition();


            if (position) {

                return {

                    latitude:
                        position.getLat(),

                    longitude:
                        position.getLng()
                };
            }
        }


        return null;
    }


    // ========================================
    // 🚴 네비게이션 안내 시작
    // ========================================
    startNavigation() {

        log(
            '🚴 네비게이션 안내 시작'
        );


        if (

            !this.navigationPathCoords ||

            this.navigationPathCoords.length < 2
        ) {

            alert(
                '먼저 자전거 경로를 찾아주세요.'
            );

            return;
        }


        if (
            this.isNavigating
        ) {

            log(
                '⚠️ 이미 네비게이션 안내 중입니다.'
            );

            return;
        }


        this.isNavigating =
            true;


        if (
            this.routeButton
        ) {

            this.routeButton.innerHTML =
                '⏹️';

            this.routeButton.title =
                '안내 중지';
        }


        log(
            '✅ 네비게이션 모드 활성화'
        );


        document.dispatchEvent(

            new CustomEvent(
                'bike-navigation-start'
            )
        );
    }


    // ========================================
    // ⏹️ 네비게이션 안내 중지
    // ========================================
    stopNavigation() {

        if (
            !this.isNavigating
        ) {
            return;
        }


        log(
            '⏹️ 네비게이션 안내 중지'
        );


        this.isNavigating =
            false;


        if (
            this.routeButton
        ) {

            this.routeButton.innerHTML =
                '🚴';

            this.routeButton.title =
                '안내 시작';
        }


        document.dispatchEvent(

            new CustomEvent(
                'bike-navigation-stop'
            )
        );
    }


    // ========================================
    // 🚴 자전거 경로 요청
    // ========================================
    async requestBicycleRoute() {

        if (
            this.isLoadingRoute
        ) {
            return;
        }


        if (
            !this.destinationLocation
        ) {

            alert(
                '먼저 목적지를 설정해주세요.'
            );

            return;
        }


        const origin =
            this.getCurrentOrigin();


        if (!origin) {

            alert(
                '출발 위치를 확인할 수 없습니다.\n\n' +
                '📍 현재 위치를 먼저 확인해주세요.'
            );

            return;
        }


        const destination = {

            latitude:
                this.destinationLocation.getLat(),

            longitude:
                this.destinationLocation.getLng()
        };


        this.isLoadingRoute =
            true;


        this.updateRouteButtonState();


        if (
            this.routeButton
        ) {

            this.routeButton.innerHTML =
                '⏳';
        }


        log(
            '🚴 자전거 경로 요청',
            {

                start:
                    origin,

                end:
                    destination
            }
        );


        try {

            // ========================================
            // 요청 파라미터
            // ========================================
            const params =
                new URLSearchParams({

                    start_x:
                        String(
                            origin.longitude
                        ),

                    start_y:
                        String(
                            origin.latitude
                        ),

                    end_x:
                        String(
                            destination.longitude
                        ),

                    end_y:
                        String(
                            destination.latitude
                        )
                });


            // ========================================
            // ⏱️ 최대 15초 제한
            // ========================================
            const response =
    await fetch(
        `/api/bicycle-route?${params.toString()}`,
        {
            method: 'GET',

            headers: {
                'Accept':
                    'application/json'
            }
        }
    );


            // ========================================
            // JSON 읽기
            // ========================================
            let data =
                null;


            try {

                data =
                    await response.json();

            } catch (jsonError) {

                throw new Error(
                    '서버 응답을 JSON으로 읽을 수 없습니다.'
                );
            }


            // ========================================
            // 서버 오류
            // ========================================
            if (
                !response.ok
            ) {

                const serverMessage =
                    data?.error ||
                    '자전거 경로 API 요청에 실패했습니다.';


                throw new Error(
                    serverMessage
                );
            }


            // ========================================
            // 경로 데이터 확인
            // ========================================
            if (
    !data ||
    data.status !== 'OK' ||
    !data.routes
) {

    const status =
        data?.status ||
        'UNKNOWN';

    throw new Error(
        `자전거 경로를 찾지 못했습니다. (${status})`
    );
}


// ========================================
// 🚴 사용할 경로 선택
// 우선 최단 경로를 기본으로 사용
// ========================================

const selectedRoute =
    data.routes.shortest ||
    data.routes.accessible ||
    data.routes.bikeOnly;


// 사용할 수 있는 경로가 없는 경우
if (!selectedRoute) {

    throw new Error(
        '사용 가능한 자전거 경로가 없습니다.'
    );
}


// ========================================
// 실제 경로 그리기
// ========================================

this.drawNavigationRoute(
    selectedRoute
);


// ========================================
// 경로 정보 확인
// ========================================

log(
    '✅ 자전거 경로 수신 완료',
    {

        distance:
            selectedRoute.properties
                ?.totalDistance,

        time:
            selectedRoute.properties
                ?.totalTime
    }
);


            // ========================================
            // 시간 초과
            // ========================================
            if (
                error.name ===
                'AbortError'
            ) {

                alert(
                    '자전거 경로 요청 시간이 초과되었습니다.\n\n' +
                    '15초 안에 경로를 찾지 못했습니다.'
                );

            } else {

                alert(
                    '자전거 경로를 가져오지 못했습니다.\n\n' +
                    error.message
                );
            }


        } finally {

            this.isLoadingRoute =
                false;


            if (
                this.routeButton
            ) {

                this.routeButton.innerHTML =
                    '🚴';
            }


            this.updateRouteButtonState();
        }
    }


    // ========================================
    // 🚴 실제 자전거 경로 그리기
    // ========================================
    drawNavigationRoute(route) {

        if (!this.map) {
            return;
        }


        this.clearNavigationRoute();


        const navigationPoints =
            [];


        if (
            Array.isArray(
                route.legs
            )
        ) {

            route.legs.forEach(

                leg => {

                    if (

                        !Array.isArray(
                            leg.steps
                        )
                    ) {
                        return;
                    }


                    leg.steps.forEach(

                        step => {

                            const points =
                                step?.path?.points;


                            if (
                                !Array.isArray(
                                    points
                                )
                            ) {
                                return;
                            }


                            points.forEach(

                                point => {

                                    if (

                                        !Array.isArray(
                                            point
                                        ) ||

                                        point.length < 2
                                    ) {
                                        return;
                                    }


                                    const lng =
                                        Number(
                                            point[0]
                                        );


                                    const lat =
                                        Number(
                                            point[1]
                                        );


                                    if (

                                        !Number.isFinite(
                                            lng
                                        ) ||

                                        !Number.isFinite(
                                            lat
                                        )
                                    ) {
                                        return;
                                    }


                                    navigationPoints.push(

                                        new kakao.maps.LatLng(
                                            lat,
                                            lng
                                        )
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }


        if (
            navigationPoints.length < 2
        ) {

            throw new Error(
                '카카오에서 받은 경로 좌표가 부족합니다.'
            );
        }


        this.navigationPathCoords =
            this.removeDuplicateCoords(
                navigationPoints
            );


        this.navigationPolyline =
            new kakao.maps.Polyline({

                path:
                    this.navigationPathCoords,

                strokeWeight:
                    6,

                strokeColor:
                    '#1677ff',

                strokeOpacity:
                    0.85,

                strokeStyle:
                    'solid',

                map:
                    this.map
            });


        this.navigationDistance =
            Number(
                route.properties?.totalDistance
            ) || 0;


        this.navigationTime =
            Number(
                route.properties?.totalTime
            ) || 0;


        const bounds =
            new kakao.maps.LatLngBounds();


        this.navigationPathCoords.forEach(

            point => {

                bounds.extend(
                    point
                );
            }
        );


        this.map.setBounds(
            bounds
        );


        const km =
            (
                this.navigationDistance /
                1000
            ).toFixed(1);


        const minutes =
            Math.round(
                this.navigationTime /
                60
            );


        log(
            '✅ 네비게이션 경로 표시 완료',
            {

                distanceKm:
                    km,

                timeMinutes:
                    minutes,

                points:
                    this.navigationPathCoords.length
            }
        );


        alert(
            `🚴 자전거 경로가 설정되었습니다.\n\n` +
            `거리: ${km} km\n` +
            `예상시간: ${minutes}분`
        );
    }


    // ========================================
    // 중복 좌표 제거
    // ========================================
    removeDuplicateCoords(points) {

        const result =
            [];


        points.forEach(

            point => {

                if (
                    result.length === 0
                ) {

                    result.push(
                        point
                    );

                    return;
                }


                const last =
                    result[
                        result.length - 1
                    ];


                if (

                    last.getLat() !==
                        point.getLat() ||

                    last.getLng() !==
                        point.getLng()
                ) {

                    result.push(
                        point
                    );
                }
            }
        );


        return result;
    }


    // ========================================
    // 🚴 네비게이션 경로 삭제
    // ========================================
    clearNavigationRoute() {

        this.navigationPathCoords =
            [];


        this.navigationDistance =
            0;


        this.navigationTime =
            0;


        if (
            this.navigationPolyline
        ) {

            this.navigationPolyline.setMap(
                null
            );


            this.navigationPolyline =
                null;
        }


        log(
            '🗑️ 네비게이션 경로 초기화'
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


            this.map.setCenter(
                location
            );


            this.map.setLevel(2);


            if (
                addToPath
            ) {

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
    // 📈 실제 주행 경로
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
                '❌ 실제 주행 경로 오류',
                error.message
            );
        }
    }


    // ========================================
    // 🔄 지도 초기화
    // ========================================
    reset() {

        this.pathCoords =
            [];


        if (
            this.polyline
        ) {

            this.polyline.setMap(
                null
            );


            this.polyline =
                null;
        }


        this.clearNavigationRoute();


        log(
            '🔄 지도 주행 경로 초기화'
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
                '✅ 실제 경로에 맞게 줌 조정됨'
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
