// ============================================================
// 🗺️ Bike GPS App - MapManager
// ============================================================

function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}


class MapManager {

    constructor() {

        // ====================================================
        // 🗺️ 지도
        // ====================================================

        this.map = null;


        // ====================================================
        // 📍 현재 위치
        // ====================================================

        this.currentMarker = null;


        // ====================================================
        // 🎯 목적지
        // ====================================================

        this.destinationMarker = null;
        this.destinationLocation = null;
        this.destinationAddress = '';
        this.isSelectingDestination = false;


        // ====================================================
        // 📈 실제 주행 경로
        // ====================================================

        this.polyline = null;
        this.pathCoords = [];


        // ====================================================
        // 🚴 네비게이션 경로
        // ====================================================

        this.navigationPolyline = null;
        this.navigationPathCoords = [];

        this.navigationDistance = 0;
        this.navigationTime = 0;

        this.selectedRoute = null;
        this.selectedRouteIndex = -1;

        this.routeList = [];


        // ====================================================
        // 상태
        // ====================================================

        this.isLoadingRoute = false;


        // ====================================================
        // UI
        // ====================================================

        this.locationButton = null;
        this.destinationButton = null;

        this.destinationSheet = null;
        this.routeSelector = null;


        log('MapManager 생성됨');
    }


    // ============================================================
    // 🗺️ 지도 초기화
    // ============================================================

    initMap() {

        log('🗺️ 지도 초기화 시작...');

        try {

            const mapContainer = document.getElementById('map');

            if (!mapContainer) {
                throw new Error('지도 컨테이너를 찾을 수 없습니다.');
            }


            if (
                window.getComputedStyle(mapContainer).position === 'static'
            ) {
                mapContainer.style.position = 'relative';
            }


            const mapOption = {

                center: new kakao.maps.LatLng(
                    CONFIG.MAP.centerLat,
                    CONFIG.MAP.centerLng
                ),

                level: CONFIG.MAP.initialZoom
            };


            this.map = new kakao.maps.Map(
                mapContainer,
                mapOption
            );


            log('✅ 지도 초기화 완료');


            // 버튼
            this.createCurrentLocationButton();
            this.createDestinationButton();


            // 카드 UI
            this.createDestinationSheet();
            this.createRouteSelector();


            // 지도 클릭
            this.setupMapClickForDestination();


            // 현재 위치
            this.requestInitialLocation();


        } catch (error) {

            log(
                '❌ 지도 초기화 오류',
                error.message
            );
        }
    }


    // ============================================================
    // 📍 시작 시 현재 위치
    // ============================================================

    requestInitialLocation() {

        if (!navigator.geolocation) {
            return;
        }


        navigator.geolocation.getCurrentPosition(

            (position) => {

                const coords = {

                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,

                    accuracy: position.coords.accuracy,

                    speed: Number.isFinite(position.coords.speed)
                        ? position.coords.speed
                        : null,

                    altitude: Number.isFinite(position.coords.altitude)
                        ? position.coords.altitude
                        : null,

                    heading: Number.isFinite(position.coords.heading)
                        ? position.coords.heading
                        : null,

                    timestamp: position.timestamp
                };


                this.updateCurrentMarker(
                    coords,
                    false
                );


                this.map.setCenter(
                    new kakao.maps.LatLng(
                        coords.latitude,
                        coords.longitude
                    )
                );


                log(
                    '📍 초기 현재 위치 확보',
                    coords
                );
            },


            (error) => {

                log(
                    '⚠️ 초기 위치 확인 실패',
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


    // ============================================================
    // 📍 현재 위치 버튼
    // ============================================================

    createCurrentLocationButton() {

        if (
            !this.map ||
            this.locationButton
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'map-floating-button current-location-button';

        button.innerHTML = '📍';

        button.title = '현재 위치';


        button.addEventListener(
            'click',
            () => this.goToCurrentLocation()
        );


        mapContainer.appendChild(button);

        this.locationButton = button;

        log('✅ 현재 위치 버튼 생성 완료');
    }


    // ============================================================
    // 📍 현재 위치 이동
    // ============================================================

    goToCurrentLocation() {

        if (!navigator.geolocation) {

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


                this.map.setCenter(location);

                this.map.setLevel(2);
            },


            () => {

                alert(
                    '현재 위치를 가져올 수 없습니다.'
                );
            },


            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 2000
            }
        );
    }


    // ============================================================
    // 🎯 목적지 버튼
    // ============================================================

    createDestinationButton() {

        if (
            !this.map ||
            this.destinationButton
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'map-floating-button destination-button';

        button.innerHTML = '🎯';

        button.title = '목적지 설정';


        button.addEventListener(

            'click',

            () => {

                this.startDestinationSelection();

            }
        );


        mapContainer.appendChild(button);

        this.destinationButton = button;

        log('✅ 목적지 버튼 생성 완료');
    }


    // ============================================================
    // 🎯 목적지 선택 시작
    // ============================================================

    startDestinationSelection() {

        if (!this.map) {
            return;
        }


        // 기존 목적지와 경로 제거

        this.clearDestination();

        this.clearRouteCompletely();


        this.isSelectingDestination = true;


        this.destinationButton.innerHTML = '✚';

        this.destinationButton.classList.add(
            'selecting'
        );


        log('🎯 목적지 선택 모드 시작');
    }


    // ============================================================
    // 🗺️ 지도 클릭 → 목적지 선택
    // ============================================================

    setupMapClickForDestination() {

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


        log(
            '✅ 목적지 지도 클릭 이벤트 설정 완료'
        );
    }


    // ============================================================
    // 🎯 목적지 설정
    // ============================================================

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

                position: location,

                map: this.map,

                title: '목적지'
            });


        this.isSelectingDestination =
            false;


        if (
            this.destinationButton
        ) {

            this.destinationButton.innerHTML =
                '🎯';

            this.destinationButton.classList.remove(
                'selecting'
            );
        }


        this.reverseGeocodeDestination(
            location
        );


        log(
            '🎯 목적지 설정 완료'
        );
    }


    // ============================================================
    // 📍 좌표 → 주소
    // ============================================================

    reverseGeocodeDestination(location) {

        if (
            !kakao.maps.services
        ) {

            this.destinationAddress =
                '선택한 목적지';

            this.showDestinationSheet();

            return;
        }


        const geocoder =
            new kakao.maps.services.Geocoder();


        geocoder.coord2Address(

            location.getLng(),

            location.getLat(),

            (result, status) => {

                if (

                    status ===
                    kakao.maps.services.Status.OK

                ) {

                    const address =
                        result?.[0]?.address?.address_name;


                    const roadAddress =
                        result?.[0]?.road_address?.address_name;


                    this.destinationAddress =
                        roadAddress ||
                        address ||
                        '선택한 목적지';

                } else {

                    this.destinationAddress =
                        '선택한 목적지';
                }


                this.showDestinationSheet();

            }
        );
    }


    // ============================================================
    // 📋 목적지 카드 생성
    // ============================================================

    createDestinationSheet() {

        if (
            this.destinationSheet
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        const sheet =
            document.createElement('div');


        sheet.className =
            'destination-sheet';


        sheet.style.display =
            'none';


        mapContainer.appendChild(sheet);


        this.destinationSheet =
            sheet;


        log(
            '✅ 목적지 카드 생성 완료'
        );
    }


    // ============================================================
    // 📋 목적지 카드 표시
    // ============================================================

    showDestinationSheet() {

        if (
            !this.destinationSheet
        ) {
            return;
        }


        this.destinationSheet.innerHTML = `

            <div class="destination-sheet-header">

                <div class="destination-sheet-info">

                    <div class="destination-label">
                        목적지
                    </div>

                    <div class="destination-address">
                        📍 ${this.destinationAddress}
                    </div>

                </div>


                <button
                    class="map-close-button"
                    id="destination-close-button"
                    type="button"
                >
                    ×
                </button>

            </div>


            <div class="destination-actions">

                <button
                    id="destination-start-button"
                    class="destination-action-btn start"
                    type="button"
                >
                    출발
                </button>


                <button
                    id="destination-arrival-button"
                    class="destination-action-btn arrival"
                    type="button"
                >
                    도착
                </button>

            </div>

        `;


        this.destinationSheet.style.display =
            'block';


        // ========================================================
        // X → 목적지 + 경로 전체 제거
        // ========================================================

        document
            .getElementById(
                'destination-close-button'
            )
            .addEventListener(

                'click',

                () => {

                    this.clearDestination();

                    this.clearRouteCompletely();

                    this.destinationSheet.style.display =
                        'none';

                }
            );


        // ========================================================
        // 출발
        // ========================================================

        document
            .getElementById(
                'destination-start-button'
            )
            .addEventListener(

                'click',

                () => {

                    alert(
                        '현재 버전에서는 현재 위치를 출발지로 사용합니다.'
                    );

                }
            );


        // ========================================================
        // 도착 → 즉시 경로 검색
        // ========================================================

        document
            .getElementById(
                'destination-arrival-button'
            )
            .addEventListener(

                'click',

                async () => {

                    this.destinationSheet.style.display =
                        'none';


                    await this.requestBicycleRoute();

                }
            );
    }


    // ============================================================
    // ❌ 목적지 삭제
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


        if (
            this.destinationButton
        ) {

            this.destinationButton.innerHTML =
                '🎯';

            this.destinationButton.classList.remove(
                'selecting'
            );
        }


        if (
            this.destinationSheet
        ) {

            this.destinationSheet.style.display =
                'none';
        }


        log(
            '🗑️ 목적지 삭제'
        );
    }


    // ============================================================
    // 📍 현재 출발 위치
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
            this.currentMarker
        ) {

            const position =
                this.currentMarker.getPosition();


            return {

                latitude:
                    position.getLat(),

                longitude:
                    position.getLng()
            };
        }


        return null;
    }


    // ============================================================
    // 🚴 자전거 경로 요청
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

            alert(
                '목적지를 먼저 선택해주세요.'
            );

            return;
        }


        const origin =
            this.getCurrentOrigin();


        if (
            !origin
        ) {

            alert(
                '현재 위치를 확인할 수 없습니다.'
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

                    `/api/bicycle-route?${params.toString()}`,

                    {

                        method: 'GET',

                        headers: {

                            'Accept':
                                'application/json'
                        }
                    }
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


            // 선택 카드 표시

            this.showRouteSelector(
                routes
            );


        } catch (error) {

            log(
                '❌ 경로 요청 실패',
                error
            );


            alert(

                '자전거 경로를 가져오지 못했습니다.\n\n' +

                error.message

            );

        } finally {

            this.isLoadingRoute =
                false;
        }
    }


    // ============================================================
    // 🛣️ API 응답에서 경로 추출
    // ============================================================

    extractRoutes(data) {

        const result = [];


        // --------------------------------------------------------
        // routes 객체
        // --------------------------------------------------------

        if (

            data?.routes &&
            !Array.isArray(data.routes) &&
            typeof data.routes === 'object'

        ) {

            Object.entries(
                data.routes
            ).forEach(

                ([key, route]) => {

                    if (route) {

                        result.push({

                            ...route,

                            _routeKey:
                                key
                        });
                    }
                }
            );
        }


        // --------------------------------------------------------
        // routes 배열
        // --------------------------------------------------------

        if (

            Array.isArray(
                data?.routes
            )

        ) {

            data.routes.forEach(

                (route, index) => {

                    if (route) {

                        result.push({

                            ...route,

                            _routeKey:
                                `route-${index}`
                        });
                    }
                }
            );
        }


        // --------------------------------------------------------
        // route 단일 구조
        // --------------------------------------------------------

        if (

            result.length === 0 &&
            data?.route

        ) {

            result.push({

                ...data.route,

                _routeKey:
                    'default'
            });
        }


        return result.filter(

            route =>

                route &&

                (

                    Array.isArray(
                        route.legs
                    ) ||

                    Array.isArray(
                        route.sections
                    )

                )
        );
    }


    // ============================================================
    // 🛣️ 경로 선택
    // ============================================================

    selectRoute(
        index,
        updateUI = true
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


        if (updateUI) {

            this.showRouteSelector(
                this.routeList
            );
        }


        log(
            '🛣️ 경로 선택',
            {

                index,

                distance:
                    this.getRouteDistance(
                        route
                    ),

                time:
                    this.getRouteTime(
                        route
                    )
            }
        );
    }


    // ============================================================
    // 📏 거리 가져오기
    // ============================================================

    getRouteDistance(route) {

        return Number(

            route?.properties?.totalDistance ??

            route?.distance ??

            route?.summary?.distance ??

            route?.summary?.totalDistance ??

            0
        );
    }


    // ============================================================
    // ⏱️ 시간 가져오기
    // ============================================================

    getRouteTime(route) {

        return Number(

            route?.properties?.totalTime ??

            route?.duration ??

            route?.summary?.duration ??

            route?.summary?.totalTime ??

            0
        );
    }


    // ============================================================
    // 📏 거리 표시
    // ============================================================

    formatDistance(distance) {

        const value =
            Number(distance) || 0;


        if (value < 1000) {

            return `${Math.round(value)}m`;
        }


        return (
            value / 1000
        ).toFixed(1) + 'km';
    }


    // ============================================================
    // ⏱️ 시간 표시
    // ============================================================

    formatDuration(seconds) {

        const value =
            Number(seconds) || 0;


        if (value <= 0) {
            return '시간 정보 없음';
        }


        if (value < 60) {

            return `${Math.round(value)}초`;
        }


        const minutes =
            Math.round(value / 60);


        if (minutes < 60) {

            return `약 ${minutes}분`;
        }


        const hours =
            Math.floor(minutes / 60);


        const remain =
            minutes % 60;


        return remain > 0

            ? `약 ${hours}시간 ${remain}분`

            : `약 ${hours}시간`;
    }


    // ============================================================
    // 🛣️ 경로 선택 카드 생성
    // ============================================================

    createRouteSelector() {

        if (
            this.routeSelector
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        const selector =
            document.createElement('div');


        selector.className =
            'route-selector';


        selector.style.display =
            'none';


        mapContainer.appendChild(
            selector
        );


        this.routeSelector =
            selector;


        log(
            '✅ 경로 선택 UI 생성 완료'
        );
    }


    // ============================================================
    // 🛣️ 경로 선택 카드 표시
    // ============================================================

    showRouteSelector(routes) {

        if (

            !this.routeSelector ||
            !Array.isArray(routes)

        ) {
            return;
        }


        this.routeSelector.innerHTML =
            '';


        // ========================================================
        // 상단 영역
        // ========================================================

        const header =
            document.createElement('div');


        header.className =
            'route-selector-header';


        const title =
            document.createElement('div');


        title.className =
            'route-selector-title';

        title.textContent =
            '자전거 경로';


        const closeButton =
            document.createElement('button');


        closeButton.type =
            'button';

        closeButton.className =
            'map-close-button';

        closeButton.innerHTML =
            '×';


        closeButton.addEventListener(

            'click',

            () => {

                // 카드 제거
                this.routeSelector.style.display =
                    'none';

                // 지도 경로 제거
                this.clearNavigationRoute();

                // 선택 상태 제거
                this.selectedRoute =
                    null;

                this.selectedRouteIndex =
                    -1;

                log(
                    '❌ 경로 전체 제거'
                );
            }
        );


        header.appendChild(title);

        header.appendChild(
            closeButton
        );


        this.routeSelector.appendChild(
            header
        );


        // ========================================================
        // 각각의 경로를 개별 카드로 표시
        // ========================================================

        routes.forEach(

            (route, index) => {

                const distance =
                    this.getRouteDistance(
                        route
                    );


                const duration =
                    this.getRouteTime(
                        route
                    );


                const card =
                    document.createElement(
                        'button'
                    );


                card.type =
                    'button';


                card.className =
                    'route-option-card';


                if (

                    index ===
                    this.selectedRouteIndex

                ) {

                    card.classList.add(
                        'selected'
                    );
                }


                // ------------------------------------------------
                // API에서 route 이름을 제공하면 사용
                // 없으면 임의의 추천경로 같은 이름을 만들지 않음
                // ------------------------------------------------

                const routeLabel =

                    route?.name ||

                    route?.summary?.name ||

                    route?.summary?.description ||

                    `자전거 경로 ${index + 1}`;


                card.innerHTML = `

                    <div class="route-card-main">

                        <div class="route-card-title">
                            ${routeLabel}
                        </div>

                        <div class="route-card-meta">

                            <span>
                                📏
                                ${this.formatDistance(distance)}
                            </span>

                            <span>
                                ⏱️
                                ${this.formatDuration(duration)}
                            </span>

                        </div>

                    </div>

                    <div class="route-card-arrow">

                        ${
                            index ===
                            this.selectedRouteIndex

                                ? '✓'

                                : '›'
                        }

                    </div>

                `;


                card.addEventListener(

                    'click',

                    () => {

                        this.selectRoute(
                            index
                        );

                    }
                );


                this.routeSelector.appendChild(
                    card
                );
            }
        );


        this.routeSelector.style.display =
            'block';


        // UI가 만들어진 뒤 지도 경로 재조정

        setTimeout(

            () => {

                this.fitNavigationRouteWithCard();

            },

            100
        );
    }


    // ============================================================
    // 🚴 경로 그리기
    // ============================================================

    drawNavigationRoute(route) {

        if (!this.map) {
            return;
        }


        this.clearNavigationRoute();


        const navigationPoints =
            [];


        // ========================================================
        // legs → steps → path.points
        // ========================================================

        if (
            Array.isArray(
                route.legs
            )
        ) {

            route.legs.forEach(

                leg => {

                    leg?.steps?.forEach(

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

                                        Number.isFinite(
                                            lng
                                        ) &&

                                        Number.isFinite(
                                            lat
                                        )

                                    ) {

                                        navigationPoints.push(

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


        // ========================================================
        // sections → roads → vertexes
        // ========================================================

        if (

            navigationPoints.length === 0 &&

            Array.isArray(
                route.sections
            )

        ) {

            route.sections.forEach(

                section => {

                    section?.roads?.forEach(

                        road => {

                            const vertexes =
                                road?.vertexes;


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

                                    Number.isFinite(
                                        lng
                                    ) &&

                                    Number.isFinite(
                                        lat
                                    )

                                ) {

                                    navigationPoints.push(

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
                navigationPoints
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
                    7,

                strokeColor:
                    '#1677ff',

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


        this.fitNavigationRouteWithCard();


        log(
            '✅ 경로 지도 표시 완료'
        );
    }


    // ============================================================
    // 🗺️ 경로 전체가 보이도록 지도 조정
    // ============================================================

    fitNavigationRouteWithCard() {

        if (

            !this.map ||

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


        // 지도 전체 경로 표시

        this.map.setBounds(
            bounds
        );


        // 카드 높이만큼 중심 이동

        setTimeout(

            () => {

                if (
                    !this.routeSelector ||
                    this.routeSelector.style.display ===
                    'none'
                ) {
                    return;
                }


                const cardHeight =
                    this.routeSelector.offsetHeight;


                const mapHeight =
                    document
                        .getElementById('map')
                        .offsetHeight;


                const shift =
                    Math.min(
                        cardHeight * 0.35,
                        mapHeight * 0.18
                    );


                const projection =
                    this.map.getProjection();


                const center =
                    this.map.getCenter();


                const point =
                    projection.pointFromCoords(
                        center
                    );


                const shiftedPoint =
                    new kakao.maps.Point(

                        point.x,

                        point.y + shift

                    );


                const shiftedCenter =
                    projection.coordsFromPoint(
                        shiftedPoint
                    );


                this.map.setCenter(
                    shiftedCenter
                );

            },

            250
        );
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
    // 🗑️ 네비게이션 경로 삭제
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
    // ❌ 경로 전체 삭제
    // ============================================================

    clearRouteCompletely() {

        this.clearNavigationRoute();


        this.routeList =
            [];

        this.selectedRoute =
            null;

        this.selectedRouteIndex =
            -1;


        if (
            this.routeSelector
        ) {

            this.routeSelector.style.display =
                'none';

            this.routeSelector.innerHTML =
                '';
        }
    }


    // ============================================================
    // 📍 현재 위치 마커
    // ============================================================

    updateCurrentMarker(
        position,
        addToPath = true
    ) {

        if (!this.map) {
            return;
        }


        const location =
            new kakao.maps.LatLng(

                position.latitude,

                position.longitude

            );


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
    }


    // ============================================================
    // 📈 실제 이동 경로
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
    // 🔄 초기화
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


        log(
            '🔄 지도 초기화'
        );
    }
}


// ============================================================
// 🌎 전역 객체
// ============================================================

const mapManager =
    new MapManager();
