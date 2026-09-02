// ============================================================
// 🗺️ Bike GPS App - MapManager
// ============================================================

function log(message, data = '') {

    const timestamp =
        new Date().toLocaleTimeString();

    console.log(
        `[${timestamp}] ${message}`,
        data
    );
}


// ============================================================
// MapManager
// ============================================================

class MapManager {


    constructor() {


        // ====================================================
        // 지도
        // ====================================================

        this.map = null;


        // ====================================================
        // 현재 위치
        // ====================================================

        this.currentMarker = null;

        this.currentPosition = null;


        // ====================================================
        // 목적지
        // ====================================================

        this.destinationMarker = null;

        this.destinationLocation = null;

        this.destinationAddress = '';

        this.isSelectingDestination = false;


        // ====================================================
        // 실제 주행 경로
        // ====================================================

        this.polyline = null;

        this.pathCoords = [];


        // ====================================================
        // 네비게이션 경로
        // ====================================================

        this.navigationPolyline = null;

        this.navigationPathCoords = [];

        this.navigationDistance = 0;

        this.navigationTime = 0;


        // ====================================================
        // 경로 목록
        // ====================================================

        this.routeList = [];

        this.selectedRoute = null;

        this.selectedRouteIndex = -1;


        // ====================================================
        // 목표 속도
        // ====================================================

        this.targetSpeed = null;


        // ====================================================
        // 길안내 상태
        // ====================================================

        this.isNavigating = false;

        this.isLoadingRoute = false;


        // ====================================================
        // 사용자 줌 조작
        // ====================================================

        this.userZoomInteracted = false;


        // ====================================================
        // DOM
        // ====================================================

        this.mapContainer = null;

        this.locationPanel = null;

        this.destinationButton = null;

        this.currentLocationButton = null;

        this.routeSelector = null;

        this.routeCardList = null;

        this.targetSpeedModal = null;

        this.navigationStartButton = null;


        log(
            '🗺️ MapManager 생성 완료'
        );

    }


    // ============================================================
    // 지도 초기화
    // ============================================================

    initMap() {

        log(
            '🗺️ 지도 초기화 시작'
        );


        try {

            this.mapContainer =
                document.getElementById('map');


            if (!this.mapContainer) {

                throw new Error(
                    '지도 컨테이너를 찾을 수 없습니다.'
                );

            }


            this.map =
                new kakao.maps.Map(

                    this.mapContainer,

                    {

                        center:

                            new kakao.maps.LatLng(

                                CONFIG.MAP.centerLat,

                                CONFIG.MAP.centerLng

                            ),

                        level:

                            CONFIG.MAP.initialZoom

                    }

                );


            // UI 연결

            this.initializeUI();


            // 지도 이벤트

            this.setupMapEvents();


            // 현재 위치 요청

            this.requestInitialLocation();


            log(
                '✅ 지도 초기화 완료'
            );


        } catch (error) {

            console.error(
                '❌ 지도 초기화 오류',
                error
            );

        }

    }


    // ============================================================
    // UI 초기화
    // ============================================================

    initializeUI() {


        this.locationPanel =
            document.getElementById(
                'location-panel'
            );


        this.destinationButton =
            document.getElementById(
                'destination-button'
            );


        this.currentLocationButton =
            document.getElementById(
                'current-location-button'
            );


        this.routeSelector =
            document.getElementById(
                'route-selector'
            );


        this.routeCardList =
            document.getElementById(
                'route-card-list'
            );


        this.targetSpeedModal =
            document.getElementById(
                'target-speed-modal'
            );


        this.navigationStartButton =
            document.getElementById(
                'navigation-start-button'
            );


        // 목적지 버튼

        this.destinationButton.addEventListener(

            'click',

            () => {

                this.startDestinationSelection();

            }

        );


        // 현재 위치

        this.currentLocationButton.addEventListener(

            'click',

            () => {

                this.goToCurrentLocation();

            }

        );


        // 목적지 취소

        document
            .getElementById(
                'location-panel-close'
            )
            .addEventListener(

                'click',

                () => {

                    this.clearDestination();

                    this.clearRouteCompletely();

                }

            );


        // 경로 닫기

        document
            .getElementById(
                'route-selector-close'
            )
            .addEventListener(

                'click',

                () => {

                    this.clearRouteCompletely();

                }

            );


        // 목표 속도 건너뛰기

        document
            .getElementById(
                'skip-target-speed'
            )
            .addEventListener(

                'click',

                () => {

                    this.setTargetSpeed(
                        null
                    );

                }

            );


        // 목표 속도 선택

        document
            .getElementById(
                'confirm-target-speed'
            )
            .addEventListener(

                'click',

                () => {

                    const input =
                        document.getElementById(
                            'route-target-speed'
                        );


                    const value =
                        Number(input.value);


                    if (

                        !Number.isFinite(value) ||

                        value <= 0

                    ) {

                        alert(
                            '목표 속도를 입력해주세요.'
                        );

                        return;

                    }


                    this.setTargetSpeed(
                        value
                    );

                }

            );


        // 길안내 시작

        this.navigationStartButton.addEventListener(

            'click',

            () => {

                this.startNavigation();

            }

        );


        // 경유지

        document
            .getElementById(
                'add-waypoint-button'
            )
            .addEventListener(

                'click',

                () => {

                    alert(
                        '경유지 기능은 다음 단계에서 실제 경로 API와 연결합니다.'
                    );

                }

            );


        log(
            '✅ 지도 UI 연결 완료'
        );

    }


    // ============================================================
    // 지도 이벤트
    // ============================================================

    setupMapEvents() {


        // 목적지 선택

        kakao.maps.event.addListener(

            this.map,

            'click',

            (mouseEvent) => {

                if (
                    !this.isSelectingDestination
                ) {
                    return;
                }


                this.setDestination(
                    mouseEvent.latLng
                );

            }

        );


        // 사용자가 직접 지도 조작

        kakao.maps.event.addListener(

            this.map,

            'zoom_changed',

            () => {

                this.updateMapScale();

            }

        );


        this.updateMapScale();

    }


    // ============================================================
    // 초기 현재 위치
    // ============================================================

    requestInitialLocation() {


        if (!navigator.geolocation) {

            return;

        }


        navigator.geolocation.getCurrentPosition(

            (position) => {

                this.updateCurrentMarker(

                    {

                        latitude:
                            position.coords.latitude,

                        longitude:
                            position.coords.longitude,

                        accuracy:
                            position.coords.accuracy,

                        speed:
                            position.coords.speed,

                        timestamp:
                            position.timestamp

                    },

                    false

                );

            },


            (error) => {

                log(
                    '⚠️ 현재 위치 확인 실패',
                    error
                );

            },


            {

                enableHighAccuracy:
                    true,

                timeout:
                    10000,

                maximumAge:
                    3000

            }

        );

    }


    // ============================================================
    // 목적지 선택 시작
    // ============================================================

    startDestinationSelection() {


        this.clearDestination();

        this.clearRouteCompletely();


        this.isSelectingDestination =
            true;


        this.destinationButton.classList.add(
            'active'
        );


        // 출발 / 도착 UI 표시

        this.locationPanel.classList.add(
            'active'
        );


        const destinationText =
            document.getElementById(
                'destination-address'
            );


        destinationText.textContent =
            '지도를 눌러 목적지를 선택하세요';


        log(
            '🎯 목적지 선택 모드 시작'
        );

    }


    // ============================================================
    // 목적지 설정
    // ============================================================

    setDestination(location) {


        if (!this.map) {

            return;

        }


        this.destinationLocation =
            location;


        // 기존 목적지 제거

        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );

        }


        // 새 마커

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


        this.destinationButton.classList.remove(
            'active'
        );


        // 주소 변환

        this.reverseGeocodeDestination(
            location
        );


        log(
            '🎯 목적지 설정 완료'
        );

    }


    // ============================================================
    // 좌표 → 주소
    // ============================================================

    reverseGeocodeDestination(location) {


        const geocoder =
            new kakao.maps.services.Geocoder();


        geocoder.coord2Address(

            location.getLng(),

            location.getLat(),

            (result, status) => {


                let address =
                    '선택한 목적지';


                if (

                    status ===
                    kakao.maps.services.Status.OK

                ) {

                    address =

                        result?.[0]?.road_address?.address_name ||

                        result?.[0]?.address?.address_name ||

                        '선택한 목적지';

                }


                this.destinationAddress =
                    address;


                document.getElementById(
                    'destination-address'
                ).textContent =
                    address;


                // 목적지 선택 후 자동 경로 검색

                this.requestBicycleRoute();

            }

        );

    }


    // ============================================================
    // 현재 위치 이동
    // ============================================================

    goToCurrentLocation() {


        if (
            !navigator.geolocation
        ) {

            alert(
                '현재 위치 기능을 지원하지 않습니다.'
            );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            (position) => {


                const location =
                    new kakao.maps.LatLng(

                        position.coords.latitude,

                        position.coords.longitude

                    );


                this.updateCurrentMarker(

                    {

                        latitude:
                            position.coords.latitude,

                        longitude:
                            position.coords.longitude,

                        accuracy:
                            position.coords.accuracy,

                        timestamp:
                            position.timestamp

                    },

                    false

                );


                // 가까운 줌

                this.map.setLevel(
                    1
                );


                this.map.panTo(
                    location
                );


            },


            () => {

                alert(
                    '현재 위치를 가져올 수 없습니다.'
                );

            },


            {

                enableHighAccuracy:
                    true,

                timeout:
                    10000,

                maximumAge:
                    3000

            }

        );

    }


    // ============================================================
    // 현재 출발 위치
    // ============================================================

    getCurrentOrigin() {


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


        if (
            this.currentPosition
        ) {

            return this.currentPosition;

        }


        return null;

    }


    // ============================================================
    // 경로 요청
    // ============================================================

    async requestBicycleRoute() {


        if (
            this.isLoadingRoute
        ) {

            return;

        }


        if (
            !this.destinationLocation
        ) {

            return;

        }


        const origin =
            this.getCurrentOrigin();


        if (
            !origin
        ) {

            alert(
                '현재 위치를 확인하는 중입니다. 잠시 후 다시 시도해주세요.'
            );

            return;

        }


        this.isLoadingRoute =
            true;


        try {


            const params =
                new URLSearchParams({

                    start_x:
                        origin.longitude,

                    start_y:
                        origin.latitude,

                    end_x:
                        this.destinationLocation.getLng(),

                    end_y:
                        this.destinationLocation.getLat()

                });


            const response =
                await fetch(

                    `/api/bicycle-route?${params.toString()}`

                );


            const data =
                await response.json();


            if (
                !response.ok
            ) {

                throw new Error(

                    data?.error ||

                    '경로 요청에 실패했습니다.'

                );

            }


            const routes =
                this.extractRoutes(
                    data
                );


            if (
                routes.length === 0
            ) {

                throw new Error(
                    '사용 가능한 경로가 없습니다.'
                );

            }


            this.routeList =
                routes;


            // 첫 번째 경로 표시

            this.selectRoute(
                0,
                false
            );


            // 경로 선택 UI 표시

            this.showRouteSelector();


            log(
                '✅ 경로 검색 완료',
                routes
            );


        } catch (error) {

            console.error(
                '❌ 경로 요청 실패',
                error
            );


            alert(
                `경로를 가져오지 못했습니다.\n${error.message}`
            );

        } finally {

            this.isLoadingRoute =
                false;

        }

    }


    // ============================================================
    // API 경로 추출
    // ============================================================

    extractRoutes(data) {


        const result = [];


        if (
            Array.isArray(data?.routes)
        ) {

            data.routes.forEach(

                route => {

                    result.push(
                        route
                    );

                }

            );

        }


        if (

            result.length === 0 &&

            data?.routes &&

            typeof data.routes === 'object'

        ) {

            Object.values(
                data.routes
            ).forEach(

                route => {

                    if (route) {

                        result.push(
                            route
                        );

                    }

                }

            );

        }


        if (

            result.length === 0 &&

            data?.route

        ) {

            result.push(
                data.route
            );

        }


        return result.filter(

            route =>

                route &&

                (

                    Array.isArray(route.legs) ||

                    Array.isArray(route.sections)

                )

        );

    }


    // ============================================================
    // 경로 선택
    // ============================================================

    selectRoute(
        index,
        askTargetSpeed = true
    ) {


        const route =
            this.routeList[index];


        if (!route) {

            return;

        }


        this.selectedRouteIndex =
            index;


        this.selectedRoute =
            route;


        this.drawNavigationRoute(
            route
        );


        this.showRouteSelector();


        if (
            askTargetSpeed
        ) {

            this.showTargetSpeedModal();

        }

    }


    // ============================================================
    // 경로 카드 표시
    // ============================================================

    showRouteSelector() {


        this.routeCardList.innerHTML =
            '';


        this.routeList.forEach(

            (route, index) => {


                const card =
                    document.createElement(
                        'button'
                    );


                card.type =
                    'button';


                card.className =
                    'route-card';


                if (

                    index ===
                    this.selectedRouteIndex

                ) {

                    card.classList.add(
                        'selected'
                    );

                }


                const distance =
                    this.getRouteDistance(
                        route
                    );


                const duration =
                    this.getRouteTime(
                        route
                    );


                card.innerHTML =
                    `

                    <div
                        class="route-card-name"
                    >
                        경로 ${index + 1}
                    </div>

                    <div
                        class="route-card-distance"
                    >
                        ${this.formatDistance(distance)}
                    </div>

                    <div
                        class="route-card-time"
                    >
                        ${this.formatDuration(duration)}
                    </div>

                    `;


                card.addEventListener(

                    'click',

                    () => {

                        this.selectRoute(
                            index,
                            true
                        );

                    }

                );


                this.routeCardList.appendChild(
                    card
                );

            }

        );


        this.routeSelector.classList.add(
            'active'
        );

    }


    // ============================================================
    // 거리
    // ============================================================

    getRouteDistance(route) {

        return Number(

            route?.properties?.totalDistance ??

            route?.distance ??

            route?.summary?.distance ??

            0

        );

    }


    // ============================================================
    // 시간
    // ============================================================

    getRouteTime(route) {

        return Number(

            route?.properties?.totalTime ??

            route?.duration ??

            route?.summary?.duration ??

            0

        );

    }


    // ============================================================
    // 거리 포맷
    // ============================================================

    formatDistance(distance) {


        const value =
            Number(distance) || 0;


        if (
            value < 1000
        ) {

            return `${Math.round(value)}m`;

        }


        return (
            value / 1000
        ).toFixed(1) + 'km';

    }


    // ============================================================
    // 시간 포맷
    // ============================================================

    formatDuration(seconds) {


        const value =
            Number(seconds) || 0;


        if (
            value <= 0
        ) {

            return '시간 정보 없음';

        }


        const minutes =
            Math.round(
                value / 60
            );


        if (
            minutes < 60
        ) {

            return `약 ${minutes}분`;

        }


        const hours =
            Math.floor(
                minutes / 60
            );


        const remain =
            minutes % 60;


        return remain > 0

            ? `약 ${hours}시간 ${remain}분`

            : `약 ${hours}시간`;

    }


    // ============================================================
    // 경로 그리기
    // ============================================================

    drawNavigationRoute(route) {


        this.clearNavigationRoute();


        const points = [];


        // legs 구조

        if (
            Array.isArray(
                route.legs
            )
        ) {

            route.legs.forEach(

                leg => {

                    leg?.steps?.forEach(

                        step => {

                            const pathPoints =
                                step?.path?.points;


                            if (

                                !Array.isArray(
                                    pathPoints
                                )

                            ) {

                                return;

                            }


                            pathPoints.forEach(

                                point => {


                                    if (

                                        !Array.isArray(
                                            point
                                        )

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

                                        Number.isFinite(lat) &&

                                        Number.isFinite(lng)

                                    ) {

                                        points.push(

                                            new kakao.maps.LatLng(

                                                lat,

                                                lng

                                            )

                                        );

                                    }

                                }

                            );

                        }

                    );

                }

            );

        }


        // sections 구조

        if (

            points.length === 0 &&

            Array.isArray(
                route.sections
            )

        ) {

            route.sections.forEach(

                section => {

                    section?.roads?.forEach(

                        road => {

                            const vertexes =
                                road.vertexes;


                            if (

                                !Array.isArray(
                                    vertexes
                                )

                            ) {

                                return;

                            }


                            for (

                                let i = 0;

                                i < vertexes.length;

                                i += 2

                            ) {

                                const lng =
                                    Number(
                                        vertexes[i]
                                    );


                                const lat =
                                    Number(
                                        vertexes[i + 1]
                                    );


                                if (

                                    Number.isFinite(lat) &&

                                    Number.isFinite(lng)

                                ) {

                                    points.push(

                                        new kakao.maps.LatLng(

                                            lat,

                                            lng

                                        )

                                    );

                                }

                            }

                        }

                    );

                }

            );

        }


        this.navigationPathCoords =
            this.removeDuplicateCoords(
                points
            );


        if (
            this.navigationPathCoords.length < 2
        ) {

            throw new Error(
                '경로 좌표를 표시할 수 없습니다.'
            );

        }


        this.navigationPolyline =
            new kakao.maps.Polyline({

                path:
                    this.navigationPathCoords,

                strokeWeight:
                    6,

                strokeColor:
                    '#1677FF',

                strokeOpacity:
                    0.9,

                strokeStyle:
                    'solid',

                map:
                    this.map

            });


        this.navigationDistance =
            this.getRouteDistance(
                route
            );


        this.navigationTime =
            this.getRouteTime(
                route
            );


        // 처음 경로 확인 시 전체 경로 표시

        this.fitRoute();

    }


    // ============================================================
    // 전체 경로 보기
    // ============================================================

    fitRoute() {


        if (
            this.navigationPathCoords.length === 0
        ) {

            return;

        }


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

    }


    // ============================================================
    // 목표 속도 카드
    // ============================================================

    showTargetSpeedModal() {


        this.targetSpeedModal.classList.add(
            'active'
        );


        document
            .getElementById(
                'route-target-speed'
            )
            .focus();

    }


    // ============================================================
    // 목표 속도 설정
    // ============================================================

    setTargetSpeed(speed) {


        this.targetSpeed =
            speed;


        this.targetSpeedModal.classList.remove(
            'active'
        );


        this.routeSelector.classList.remove(
            'active'
        );


        // 길안내 시작 버튼 표시

        this.navigationStartButton.classList.add(
            'active'
        );


        log(
            '🎯 목표 속도 설정',
            speed
        );

    }


    // ============================================================
    // 길안내 시작
    // ============================================================

    startNavigation() {


        if (
            !this.selectedRoute
        ) {

            alert(
                '경로를 먼저 선택해주세요.'
            );

            return;

        }


        this.isNavigating =
            true;


        this.navigationStartButton.classList.remove(
            'active'
        );


        // 현재 위치 중심으로 이동

        this.goToCurrentLocation();


        log(
            '🧭 길안내 시작',
            {

                targetSpeed:
                    this.targetSpeed,

                routeDistance:
                    this.navigationDistance

            }
        );


        alert(

            '길안내 준비가 완료되었습니다.\n\n' +

            '실제 GPS 기반 자동 줌과 목표 위치 비교 기능은 ' +

            '다음 단계에서 gps.js와 연결합니다.'

        );

    }


    // ============================================================
    // 경로 삭제
    // ============================================================

    clearNavigationRoute() {


        if (
            this.navigationPolyline
        ) {

            this.navigationPolyline.setMap(
                null
            );

            this.navigationPolyline =
                null;

        }


        this.navigationPathCoords =
            [];

        this.navigationDistance =
            0;

        this.navigationTime =
            0;

    }


    // ============================================================
    // 경로 전체 삭제
    // ============================================================

    clearRouteCompletely() {


        this.clearNavigationRoute();


        this.routeList =
            [];

        this.selectedRoute =
            null;

        this.selectedRouteIndex =
            -1;


        this.routeSelector.classList.remove(
            'active'
        );


        this.targetSpeedModal.classList.remove(
            'active'
        );


        this.navigationStartButton.classList.remove(
            'active'
        );

    }


    // ============================================================
    // 목적지 삭제
    // ============================================================

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

        this.destinationAddress =
            '';

        this.isSelectingDestination =
            false;


        this.destinationButton.classList.remove(
            'active'
        );


        this.locationPanel.classList.remove(
            'active'
        );


        document.getElementById(
            'destination-address'
        ).textContent =
            '목적지를 설정하세요';


        log(
            '🗑️ 목적지 삭제'
        );

    }


    // ============================================================
    // 현재 위치 업데이트
    // ============================================================

    updateCurrentMarker(
        position,
        addToPath = true
    ) {


        if (
            !this.map
        ) {

            return;

        }


        const location =
            new kakao.maps.LatLng(

                position.latitude,

                position.longitude

            );


        this.currentPosition = {

            latitude:
                position.latitude,

            longitude:
                position.longitude

        };


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


        if (
            addToPath
        ) {

            this.pathCoords.push(
                location
            );

        }


        // 출발지 텍스트

        document.getElementById(
            'origin-address'
        ).textContent =
            '현재 위치';

    }


    // ============================================================
    // 실제 주행 경로
    // ============================================================

    updatePolyline() {


        if (
            this.pathCoords.length < 2
        ) {

            return;

        }


        if (
            this.polyline
        ) {

            this.polyline.setPath(
                this.pathCoords
            );

            return;

        }


        this.polyline =
            new kakao.maps.Polyline({

                path:
                    this.pathCoords,

                strokeWeight:
                    4,

                strokeColor:
                    '#4CAF50',

                strokeOpacity:
                    0.85,

                map:
                    this.map

            });

    }


    // ============================================================
    // 중복 좌표 제거
    // ============================================================

    removeDuplicateCoords(points) {


        const result = [];


        points.forEach(

            point => {


                const last =
                    result[
                        result.length - 1
                    ];


                if (!last) {

                    result.push(
                        point
                    );

                    return;

                }


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


    // ============================================================
    // 지도 축척
    // ============================================================

    updateMapScale() {


        if (!this.map) {

            return;

        }


        const level =
            this.map.getLevel();


        let distance;


        if (level <= 1) {

            distance =
                50;

        } else if (level === 2) {

            distance =
                100;

        } else if (level === 3) {

            distance =
                200;

        } else if (level === 4) {

            distance =
                500;

        } else if (level === 5) {

            distance =
                1000;

        } else {

            distance =
                2000;

        }


        const scaleText =
            document.getElementById(
                'map-scale-text'
            );


        if (scaleText) {

            scaleText.textContent =

                distance >= 1000

                    ? `${distance / 1000}km`

                    : `${distance}m`;

        }

    }


    // ============================================================
    // 초기화
    // ============================================================

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


        this.clearRouteCompletely();

        this.clearDestination();

    }


}


// ============================================================
// 전역 객체
// ============================================================

const mapManager =
    new MapManager();
