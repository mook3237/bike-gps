// ========================================
// 🗺️ 지도 관리자
// ========================================

function log(message, data = '') {

    const timestamp =
        new Date().toLocaleTimeString();

    console.log(
        `[${timestamp}] ${message}`,
        data
    );
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


        // ========================================
        // 상태
        // ========================================
        this.isLoadingRoute = false;
        this.isNavigating = false;


        // ========================================
        // 🛣️ 경로 선택 UI
        // ========================================
        this.routeSelector = null;
        this.routeList = [];
        this.selectedRouteIndex = 0;


        // ========================================
        // 버튼
        // ========================================
        this.locationButton = null;
        this.destinationButton = null;
        this.routeButton = null;


        log(
            'MapManager 생성됨'
        );
    }


    // ========================================
    // 🗺️ 지도 초기화
    // ========================================
    initMap() {

        log(
            '🗺️ 지도 초기화 시작...'
        );


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


            log(
                '✅ 지도 초기화 완료!'
            );


            // ========================================
            // 📍 현재 위치 버튼
            // ========================================
            this.createCurrentLocationButton();


            // ========================================
            // 🎯 목적지 버튼
            // ========================================
            this.createDestinationButton();


            // ========================================
            // 🚴 자전거 경로 버튼
            // ========================================
            this.createRouteButton();


            // ========================================
            // 🛣️ 경로 선택창
            // ========================================
            this.createRouteSelector();


            // ========================================
            // 🎯 지도 클릭 이벤트
            // ========================================
            this.setupMapClickForDestination();


            // ========================================
            // 📍 시작 시 현재 위치
            // ========================================
            this.requestInitialLocation();


            log(
                '✅ 지도 기능 초기화 완료'
            );


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

        if (!navigator.geolocation) {

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


                this.map.setLevel(
                    2
                );


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


        button.type =
            'button';


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


        button.innerHTML =
            '📍';


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
        // GPS 최신 위치 사용
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


                this.map.setLevel(
                    2
                );


                log(
                    '⚡ 최신 GPS 위치로 즉시 이동',
                    coords
                );


                return;
            }
        }


        if (!navigator.geolocation) {

            alert(
                '이 브라우저는 위치 정보를 지원하지 않습니다.'
            );

            return;
        }


        if (this.locationButton) {

            this.locationButton.innerHTML =
                '⏳';

            this.locationButton.disabled =
                true;
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
                        position.coords.speed,

                    altitude:
                        position.coords.altitude,

                    heading:
                        position.coords.heading,

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


                this.map.setLevel(
                    2
                );


                this.restoreLocationButton();


                log(
                    '✅ 현재 위치 확인 완료',
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
            '📍';


        this.locationButton.disabled =
            false;
    }


    // ========================================
    // 🎯 목적지 버튼 생성
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


        button.type =
            'button';


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

                touchAction: 'manipulation',

                transition:
                    'transform 0.15s ease'
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
    // 🎯 목적지 선택 모드 시작
    // ========================================
    startDestinationSelection() {

        if (!this.map) {

            return;
        }


        this.isSelectingDestination =
            !this.isSelectingDestination;


        this.updateDestinationButtonState();


        if (this.isSelectingDestination) {

            log(
                '🎯 목적지 선택 모드 시작'
            );

        } else {

            log(
                '🎯 목적지 선택 모드 취소'
            );
        }
    }


    // ========================================
    // 🎯 목적지 버튼 상태 변경
    // ========================================
    updateDestinationButtonState() {

        if (!this.destinationButton) {

            return;
        }


        if (this.isSelectingDestination) {

            this.destinationButton.innerHTML =
                '✓';


            this.destinationButton.style.background =
                '#e8f5e9';


            this.destinationButton.style.transform =
                'scale(1.08)';

        } else {

            this.destinationButton.innerHTML =
                '🎯';


            this.destinationButton.style.background =
                '#ffffff';


            this.destinationButton.style.transform =
                'scale(1)';
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


                // ========================================
                // 목적지 선택 완료
                // ========================================
                this.isSelectingDestination =
                    false;


                this.updateDestinationButtonState();
            }
        );


        log(
            '✅ 목적지 지도 클릭 이벤트 설정 완료'
        );
    }


    // ========================================
    // 🎯 목적지 설정
    // ========================================
    setDestination(location) {

        if (!this.map) {

            return;
        }


        this.destinationLocation =
            location;


        // 기존 목적지 핀 제거
        if (this.destinationMarker) {

            this.destinationMarker.setMap(
                null
            );
        }


        // 새 목적지 핀
        this.destinationMarker =

            new kakao.maps.Marker({

                position:
                    location,

                map:
                    this.map,

                title:
                    '목적지'
            });


        // 기존 경로 삭제
        this.clearNavigationRoute();


        // 경로 선택창 숨김
        this.hideRouteSelector();


        // 경로 버튼 활성화
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
    }


    // ========================================
    // 🛣️ 경로 선택창 생성
    // ========================================
    createRouteSelector() {

        if (this.routeSelector) {

            return;
        }


        const mapContainer =
            document.getElementById('map');


        if (!mapContainer) {

            return;
        }


        const selector =
            document.createElement('div');


        selector.className =
            'route-selector';


        Object.assign(

            selector.style,

            {

                position: 'absolute',

                left: '12px',

                right: '12px',

                bottom: '14px',

                zIndex: '1100',

                display: 'none',

                background: '#ffffff',

                borderRadius: '16px',

                boxShadow:
                    '0 4px 16px rgba(0,0,0,0.25)',

                overflow: 'hidden',

                padding: '10px'
            }
        );


        mapContainer.appendChild(
            selector
        );


        this.routeSelector =
            selector;


        log(
            '✅ 경로 선택창 생성 완료'
        );
    }


    // ========================================
    // 🛣️ 경로 선택창 숨기기
    // ========================================
    hideRouteSelector() {

        if (!this.routeSelector) {

            return;
        }


        this.routeSelector.style.display =
            'none';
    }


    // ========================================
    // 🛣️ 경로 선택창 표시
    // ========================================
    showRouteSelector(routes) {

        if (

            !this.routeSelector ||
            !Array.isArray(routes) ||
            routes.length === 0

        ) {

            return;
        }


        this.routeList =
            routes;


        this.selectedRouteIndex =
            0;


        this.routeSelector.innerHTML =
            '';


        const title =
            document.createElement('div');


        title.textContent =
            '🚴 추천 경로';


        Object.assign(

            title.style,

            {

                fontWeight: '700',

                fontSize: '16px',

                padding:
                    '8px 10px 10px'
            }
        );


        this.routeSelector.appendChild(
            title
        );


        routes.forEach(

            (route, index) => {

                const properties =
                    route.properties || {};


                const distance =
                    Number(
                        properties.totalDistance
                    ) || 0;


                const time =
                    Number(
                        properties.totalTime
                    ) || 0;


                const km =
                    (distance / 1000).toFixed(1);


                const minutes =
                    Math.round(time / 60);


                const item =
                    document.createElement('button');


                item.type =
                    'button';


                Object.assign(

                    item.style,

                    {

                        width: '100%',

                        border:

                            index ===
                            this.selectedRouteIndex

                                ? '2px solid #1677ff'
                                : '1px solid #dddddd',

                        background: '#ffffff',

                        borderRadius: '12px',

                        padding: '14px',

                        marginBottom:

                            index === routes.length - 1

                                ? '0'
                                : '8px',

                        textAlign: 'left',

                        cursor: 'pointer'
                    }
                );


                const routeName =

                    index === 0

                        ? '⭐ 추천 경로'

                        : `🚴 경로 ${index + 1}`;


                item.innerHTML =
                    `
                    <div style="
                        font-weight:700;
                        font-size:15px;
                        margin-bottom:6px;
                    ">
                        ${routeName}
                    </div>

                    <div style="
                        color:#666666;
                        font-size:14px;
                    ">
                        ${km} km · 약 ${minutes}분
                    </div>
                    `;


                item.addEventListener(

                    'click',

                    () => {

                        this.selectedRouteIndex =
                            index;


                        this.drawNavigationRoute(
                            route,
                            false
                        );


                        this.showRouteSelector(
                            routes
                        );


                        log(
                            '🛣️ 경로 선택',
                            {

                                index,

                                distance,

                                time
                            }
                        );
                    }
                );


                this.routeSelector.appendChild(
                    item
                );
            }
        );


        this.routeSelector.style.display =
            'block';


        log(
            '🛣️ 경로 선택창 표시'
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

                touchAction: 'manipulation'
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
    // 🚴 경로 버튼 상태
    // ========================================
    updateRouteButtonState() {

        if (!this.routeButton) {

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
    // 🚴 출발지 가져오기
    // ========================================
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


        if (this.currentMarker) {

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
    // 🚴 자전거 경로 요청
    // ========================================
    async requestBicycleRoute() {

        if (this.isLoadingRoute) {

            return;
        }


        if (!this.destinationLocation) {

            return;
        }


        const origin =
            this.getCurrentOrigin();


        if (!origin) {

            alert(
                '현재 위치를 확인할 수 없습니다.'
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


        if (this.routeButton) {

            this.routeButton.innerHTML =
                '⏳';
        }


        try {

            const params =
                new URLSearchParams({

                    start_x:
                        String(origin.longitude),

                    start_y:
                        String(origin.latitude),

                    end_x:
                        String(destination.longitude),

                    end_y:
                        String(destination.latitude)
                });


            log(

                '🚴 자전거 경로 요청',

                {

                    start: origin,

                    end: destination
                }
            );


            const response =

                await fetch(

                    `/api/bicycle-route?${params.toString()}`,

                    {

                        method: 'GET',

                        headers: {

                            Accept:
                                'application/json'
                        }
                    }
                );


            let data;


            try {

                data =
                    await response.json();

            } catch (error) {

                throw new Error(
                    '서버 응답을 읽을 수 없습니다.'
                );
            }


            if (!response.ok) {

                throw new Error(

                    data?.error ||
                    '자전거 경로 API 요청에 실패했습니다.'
                );
            }


            if (

                !data ||
                data.status !== 'OK' ||
                !data.routes

            ) {

                throw new Error(
                    '자전거 경로를 찾지 못했습니다.'
                );
            }


            const availableRoutes =

                Object.values(
                    data.routes
                ).filter(

                    route =>

                        route &&

                        Array.isArray(
                            route.legs
                        )
                );


            if (

                availableRoutes.length === 0

            ) {

                throw new Error(
                    '사용 가능한 자전거 경로가 없습니다.'
                );
            }


            const selectedRoute =

                data.routes.shortest ||

                data.routes.accessible ||

                data.routes.bikeOnly ||

                availableRoutes[0];


            this.selectedRouteIndex =
                Math.max(

                    0,

                    availableRoutes.indexOf(
                        selectedRoute
                    )
                );


            // ========================================
            // 경로 그리기
            // ========================================
            this.drawNavigationRoute(
                selectedRoute,
                true
            );


            // ========================================
            // 경로 목록 표시
            // ========================================
            this.showRouteSelector(
                availableRoutes
            );


            log(
                '✅ 자전거 경로 수신 완료'
            );


        } catch (routeError) {

            log(
                '❌ 자전거 경로 요청 실패',
                routeError
            );


            alert(

                '자전거 경로를 가져오지 못했습니다.\n\n' +

                (

                    routeError.message ||
                    '알 수 없는 오류가 발생했습니다.'
                )
            );


        } finally {

            this.isLoadingRoute =
                false;


            if (this.routeButton) {

                this.routeButton.innerHTML =
                    '🚴';
            }


            this.updateRouteButtonState();
        }
    }


    // ========================================
    // 🚴 경로 그리기
    // ========================================
    drawNavigationRoute(

        route,

        fitMap = true

    ) {

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
                                        Number(point[0]);


                                    const lat =
                                        Number(point[1]);


                                    if (

                                        !Number.isFinite(lng) ||
                                        !Number.isFinite(lat)

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
                '경로 좌표가 부족합니다.'
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


        if (fitMap) {

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


        log(

            '✅ 네비게이션 경로 표시 완료',

            {

                distance:
                    this.navigationDistance,

                time:
                    this.navigationTime,

                points:
                    this.navigationPathCoords.length
            }
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


        if (this.navigationPolyline) {

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

            if (!this.currentMarker) {

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

            if (this.polyline) {

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
    // 🚴 네비게이션 시작
    // ========================================
    startNavigation() {

        if (

            !this.navigationPathCoords ||
            this.navigationPathCoords.length < 2

        ) {

            alert(
                '먼저 자전거 경로를 찾아주세요.'
            );

            return;
        }


        if (this.isNavigating) {

            return;
        }


        this.isNavigating =
            true;


        document.dispatchEvent(

            new CustomEvent(
                'bike-navigation-start'
            )
        );


        log(
            '🚴 네비게이션 시작'
        );
    }


    // ========================================
    // ⏹️ 네비게이션 중지
    // ========================================
    stopNavigation() {

        if (!this.isNavigating) {

            return;
        }


        this.isNavigating =
            false;


        document.dispatchEvent(

            new CustomEvent(
                'bike-navigation-stop'
            )
        );


        log(
            '⏹️ 네비게이션 중지'
        );
    }


    // ========================================
    // 🔄 지도 초기화
    // ========================================
    reset() {

        this.pathCoords =
            [];


        if (this.polyline) {

            this.polyline.setMap(
                null
            );


            this.polyline =
                null;
        }


        this.clearNavigationRoute();


        this.hideRouteSelector();


        log(
            '🔄 지도 주행 경로 초기화'
        );
    }


    // ========================================
    // 📏 실제 주행 경로 범위
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


        } catch (error) {

            log(

                '❌ 줌 조정 오류',

                error.message
            );
        }
    }
}


// ========================================
// 🌎 전역 MapManager
// ========================================
const mapManager =
    new MapManager();
