// ============================================================
// 🗺️ 자전거 GPS 네비게이션 지도 관리자
// ============================================================

function log(message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
}


// ============================================================
// 앱 상태
// ============================================================

const NAVIGATION_STATE = {
    IDLE: 'IDLE',

    SELECTING_DESTINATION: 'SELECTING_DESTINATION',

    DESTINATION_SELECTED: 'DESTINATION_SELECTED',

    ROUTE_SEARCH: 'ROUTE_SEARCH',

    ROUTE_SELECTED: 'ROUTE_SELECTED',

    SPEED_SETTING: 'SPEED_SETTING',

    NAVIGATION: 'NAVIGATION'
};


// ============================================================
// 지도 관리자
// ============================================================

class MapManager {

    constructor() {

        this.map = null;


        // ====================================================
        // 상태
        // ====================================================

        this.state =
            NAVIGATION_STATE.IDLE;


        // ====================================================
        // 현재 위치
        // ====================================================

        this.currentMarker = null;

        this.currentLocation = null;


        // ====================================================
        // 목적지
        // ====================================================

        this.destinationMarker = null;

        this.destinationLocation = null;

        this.destinationName =
            '선택한 목적지';


        // ====================================================
        // 출발지
        // ====================================================

        this.originLocation = null;


        // ====================================================
        // 경로
        // ====================================================

        this.routes = [];

        this.selectedRouteIndex = 0;

        this.routePolylines = [];

        this.navigationPathCoords = [];

        this.navigationDistance = 0;

        this.navigationTime = 0;

        this.isLoadingRoute = false;


        // ====================================================
        // 실제 운동 기록 경로
        // ====================================================

        this.pathCoords = [];

        this.polyline = null;


        // ====================================================
        // 네비게이션 GPS
        // ====================================================

        this.navigationWatchId = null;

        this.isNavigating = false;


        // ====================================================
        // 목표 속도
        // ====================================================

        this.targetSpeed = null;

        this.targetMarker = null;

        this.navigationStartTime = null;

        this.targetStartDistance = 0;

        this.targetStartTimer = null;

        this.targetStarted = false;


        // ====================================================
        // UI
        // ====================================================

        this.locationButton = null;

        this.destinationButton = null;

        this.destinationDecisionCard = null;

        this.routePanel = null;

        this.speedModal = null;

        this.navigationHUD = null;

        this.zoomScale = null;


        // ====================================================
        // 지도 수동 조작 여부
        // ====================================================

        this.userControlledMap = false;


        log('🗺️ 새로운 MapManager 생성');
    }


    // ============================================================
    // 지도 초기화
    // ============================================================

    initMap() {

        const mapContainer =
            document.getElementById('map');


        if (!mapContainer) {

            log('❌ 지도 컨테이너를 찾을 수 없음');

            return;
        }


        mapContainer.style.position =
            'relative';


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


        this.injectNavigationStyle();

        this.createMapControls();

        this.createNavigationUI();

        this.setupMapEvents();

        this.requestInitialLocation();


        log('✅ 지도 초기화 완료');
    }


    // ============================================================
    // CSS 주입
    // ============================================================

    injectNavigationStyle() {

        if (
            document.getElementById(
                'bike-navigation-style'
            )
        ) {
            return;
        }


        const style =
            document.createElement('style');


        style.id =
            'bike-navigation-style';


        style.textContent = `

            #map {
                width: 100%;
                height: 100%;
                overflow: hidden;
            }


            /* 지도 공통 버튼 */

            .bike-map-control {
                position: absolute;

                width: 50px;
                height: 50px;

                border: none;

                border-radius: 50%;

                background: #ffffff;

                box-shadow:
                    0 3px 12px
                    rgba(0,0,0,0.20);

                z-index: 1000;

                cursor: pointer;

                font-size: 22px;

                display: flex;

                align-items: center;

                justify-content: center;
            }


            /* 목적지 */

            .destination-map-control {
                right: 14px;
                bottom: 76px;
            }


            /* 현재 위치 */

            .location-map-control {
                right: 14px;
                bottom: 14px;
            }


            /* 목적지 선택 카드 */

            .destination-decision-card {

                position: absolute;

                left: 50%;
                bottom: 24px;

                transform:
                    translateX(-50%);

                width:
                    min(
                        calc(100% - 32px),
                        380px
                    );

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.92
                    );

                backdrop-filter:
                    blur(16px);

                border-radius: 20px;

                padding: 18px;

                z-index: 1100;

                box-shadow:
                    0 10px 30px
                    rgba(0,0,0,0.18);
            }


            .destination-address {

                font-size: 16px;

                font-weight: 700;

                margin-bottom: 16px;

                white-space: nowrap;

                overflow: hidden;

                text-overflow: ellipsis;
            }


            .destination-action-row {

                display: grid;

                grid-template-columns:
                    1fr 1fr;

                gap: 10px;
            }


            .destination-action-row button {

                height: 48px;

                border: none;

                border-radius: 14px;

                font-size: 15px;

                font-weight: 700;

                cursor: pointer;
            }


            .origin-select-btn {

                background: #f1f3f5;

                color: #222;
            }


            .destination-confirm-btn {

                background: #1677ff;

                color: white;
            }


            /* 상단 출발 도착 */

            .route-address-panel {

                position: absolute;

                top: 14px;
                left: 16px;
                right: 16px;

                z-index: 1100;

                display: flex;

                align-items: stretch;

                background: transparent;
            }


            .route-address-list {

                flex: 1;

                overflow: hidden;
            }


            .route-address-item {

                min-height: 56px;

                display: flex;

                align-items: center;

                gap: 12px;

                padding:
                    0
                    16px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.82
                    );

                backdrop-filter:
                    blur(14px);

                font-size: 15px;

                font-weight: 700;

                overflow: hidden;
            }


            .route-address-item:first-child {

                border-radius:
                    16px
                    16px
                    0
                    0;
            }


            .route-address-item:last-child {

                border-radius:
                    0
                    0
                    16px
                    16px;

                border-top:
                    1px solid
                    rgba(
                        0,
                        0,
                        0,
                        0.07
                    );
            }


            .route-address-item span:last-child {

                overflow: hidden;

                white-space: nowrap;

                text-overflow: ellipsis;
            }


            .route-address-actions {

                width: 50px;

                display: flex;

                flex-direction: column;

                margin-left: 8px;

                gap: 8px;
            }


            .route-address-actions button {

                width: 48px;
                height: 48px;

                border: none;

                border-radius: 50%;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.90
                    );

                box-shadow:
                    0 3px 12px
                    rgba(0,0,0,0.12);

                font-size: 20px;

                cursor: pointer;
            }


            /* 하단 경로 영역 */

            .route-selection-area {

                position: absolute;

                left: 16px;
                right: 16px;
                bottom: 20px;

                z-index: 1100;

                display: flex;

                flex-direction: column;

                align-items: center;

                gap: 12px;

                pointer-events: none;
            }


            .route-card-row {

                width: 100%;

                display: flex;

                justify-content: center;

                gap: 10px;

                overflow-x: auto;

                pointer-events: auto;

                padding: 4px;
            }


            .route-card {

                flex:
                    0
                    0
                    108px;

                min-height: 118px;

                border: none;

                border-radius: 18px;

                padding: 14px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.90
                    );

                backdrop-filter:
                    blur(14px);

                box-shadow:
                    0 4px 18px
                    rgba(0,0,0,0.12);

                text-align: left;

                cursor: pointer;

                transition:
                    transform
                    0.15s ease,
                    box-shadow
                    0.15s ease;
            }


            .route-card.selected {

                background:
                    rgba(
                        232,
                        242,
                        255,
                        0.96
                    );

                outline:
                    2px solid
                    #1677ff;

                transform:
                    translateY(-3px);
            }


            .route-card-distance {

                font-size: 19px;

                font-weight: 800;

                color: #111;
            }


            .route-card-time {

                margin-top: 8px;

                font-size: 14px;

                color: #555;
            }


            .route-card-name {

                margin-top: 10px;

                font-size: 13px;

                color: #1677ff;

                font-weight: 700;
            }


            .navigation-start-button {

                width: 180px;

                height: 50px;

                border: none;

                border-radius: 25px;

                background: #1677ff;

                color: white;

                font-size: 16px;

                font-weight: 800;

                cursor: pointer;

                pointer-events: auto;

                box-shadow:
                    0 6px 18px
                    rgba(
                        22,
                        119,
                        255,
                        0.35
                    );
            }


            /* 목표 속도 */

            .speed-modal-backdrop {

                position: absolute;

                inset: 0;

                z-index: 3000;

                display: flex;

                align-items: center;

                justify-content: center;

                background:
                    rgba(
                        0,
                        0,
                        0,
                        0.18
                    );

                backdrop-filter:
                    blur(3px);
            }


            .speed-modal {

                width:
                    min(
                        320px,
                        calc(100% - 40px)
                    );

                padding: 24px;

                border-radius: 24px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.95
                    );

                box-shadow:
                    0 20px 50px
                    rgba(
                        0,
                        0,
                        0,
                        0.28
                    );

                text-align: center;
            }


            .speed-modal h3 {

                margin:
                    0
                    0
                    8px;

                font-size: 20px;
            }


            .speed-modal p {

                margin:
                    0
                    0
                    20px;

                color: #666;

                font-size: 14px;
            }


            .speed-input-wrap {

                display: flex;

                align-items: center;

                justify-content: center;

                gap: 8px;

                margin-bottom: 20px;
            }


            .speed-input-wrap input {

                width: 120px;

                height: 54px;

                border:
                    2px solid
                    #1677ff;

                border-radius: 16px;

                text-align: center;

                font-size: 22px;

                font-weight: 800;
            }


            .speed-modal-actions {

                display: grid;

                grid-template-columns:
                    1fr 1fr;

                gap: 10px;
            }


            .speed-modal-actions button {

                height: 48px;

                border: none;

                border-radius: 14px;

                font-weight: 700;

                cursor: pointer;
            }


            .skip-speed-btn {

                background: #f1f3f5;
            }


            .confirm-speed-btn {

                background: #1677ff;

                color: white;
            }


            /* 실제 네비게이션 HUD */

            .navigation-hud {

                position: absolute;

                top: 16px;
                left: 16px;
                right: 16px;

                z-index: 2000;

                display: flex;

                flex-direction: column;

                gap: 10px;

                pointer-events: none;
            }


            .navigation-next {

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.94
                    );

                border-radius: 18px;

                padding: 16px;

                box-shadow:
                    0 6px 20px
                    rgba(
                        0,
                        0,
                        0,
                        0.15
                    );

                font-weight: 800;
            }


            .navigation-info {

                display: flex;

                gap: 10px;
            }


            .navigation-info-item {

                flex: 1;

                background:
                    rgba(
                        0,
                        0,
                        0,
                        0.72
                    );

                color: white;

                border-radius: 14px;

                padding: 12px;

                text-align: center;

                font-size: 13px;
            }


            .navigation-info-item strong {

                display: block;

                margin-top: 4px;

                font-size: 18px;
            }


            /* 지도 축척 */

            .map-scale-indicator {

                position: absolute;

                left: 14px;
                bottom: 18px;

                z-index: 1500;

                padding: 7px 10px;

                border-radius: 8px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.88
                    );

                font-size: 12px;

                font-weight: 700;

                opacity: 0;

                pointer-events: none;

                transition:
                    opacity
                    0.25s ease;
            }


            .map-scale-indicator.visible {

                opacity: 1;
            }


            @media (max-width: 430px) {

                .route-card {

                    flex-basis: 98px;

                    min-height: 110px;
                }

                .route-card-row {

                    justify-content: flex-start;
                }
            }
        `;


        document.head.appendChild(
            style
        );
    }


    // ============================================================
    // 지도 기본 버튼
    // ============================================================

    createMapControls() {

        const mapContainer =
            document.getElementById('map');


        // --------------------------------------------------------
        // 현재 위치
        // --------------------------------------------------------

        const locationButton =
            document.createElement('button');


        locationButton.className =
            'bike-map-control location-map-control';


        locationButton.innerHTML =
            '📍';


        locationButton.addEventListener(
            'click',
            () => {

                this.goToCurrentLocation(
                    true
                );
            }
        );


        mapContainer.appendChild(
            locationButton
        );


        this.locationButton =
            locationButton;


        // --------------------------------------------------------
        // 목적지
        // --------------------------------------------------------

        const destinationButton =
            document.createElement('button');


        destinationButton.className =
            'bike-map-control destination-map-control';


        destinationButton.innerHTML =
            '🎯';


        destinationButton.addEventListener(
            'click',
            () => {

                this.startDestinationSelection();
            }
        );


        mapContainer.appendChild(
            destinationButton
        );


        this.destinationButton =
            destinationButton;


        // --------------------------------------------------------
        // 축척
        // --------------------------------------------------------

        const scale =
            document.createElement('div');


        scale.className =
            'map-scale-indicator';


        scale.textContent =
            '지도 확대';


        mapContainer.appendChild(
            scale
        );


        this.zoomScale =
            scale;
    }


    // ============================================================
    // UI 생성
    // ============================================================

    createNavigationUI() {

        const mapContainer =
            document.getElementById('map');


        // --------------------------------------------------------
        // 목적지 결정 카드
        // --------------------------------------------------------

        const destinationCard =
            document.createElement('div');


        destinationCard.className =
            'destination-decision-card';


        destinationCard.style.display =
            'none';


        mapContainer.appendChild(
            destinationCard
        );


        this.destinationDecisionCard =
            destinationCard;


        // --------------------------------------------------------
        // 경로 선택 영역
        // --------------------------------------------------------

        const routePanel =
            document.createElement('div');


        routePanel.className =
            'route-selection-area';


        routePanel.style.display =
            'none';


        mapContainer.appendChild(
            routePanel
        );


        this.routePanel =
            routePanel;


        // --------------------------------------------------------
        // 목표속도 모달
        // --------------------------------------------------------

        const speedModal =
            document.createElement('div');


        speedModal.className =
            'speed-modal-backdrop';


        speedModal.style.display =
            'none';


        mapContainer.appendChild(
            speedModal
        );


        this.speedModal =
            speedModal;


        // --------------------------------------------------------
        // 실제 길안내 HUD
        // --------------------------------------------------------

        const navigationHUD =
            document.createElement('div');


        navigationHUD.className =
            'navigation-hud';


        navigationHUD.style.display =
            'none';


        mapContainer.appendChild(
            navigationHUD
        );


        this.navigationHUD =
            navigationHUD;
    }


    // ============================================================
    // 지도 이벤트
    // ============================================================

    setupMapEvents() {

        kakao.maps.event.addListener(
            this.map,
            'click',
            (mouseEvent) => {

                if (
                    this.state !==
                    NAVIGATION_STATE.SELECTING_DESTINATION
                ) {
                    return;
                }


                this.setDestination(
                    mouseEvent.latLng
                );
            }
        );


        kakao.maps.event.addListener(
            this.map,
            'zoom_changed',
            () => {

                this.showMapScale();
            }
        );


        // 사용자가 직접 지도 조작하면
        // 자동으로 강제로 줌을 되돌리지 않음

        kakao.maps.event.addListener(
            this.map,
            'dragstart',
            () => {

                this.userControlledMap =
                    true;
            }
        );


        kakao.maps.event.addListener(
            this.map,
            'zoom_start',
            () => {

                this.userControlledMap =
                    true;
            }
        );
    }


    // ============================================================
    // 지도 축척 표시
    // ============================================================

    showMapScale() {

        if (!this.zoomScale) {
            return;
        }


        const level =
            this.map.getLevel();


        this.zoomScale.textContent =
            `카카오 지도 레벨 ${level}`;


        this.zoomScale.classList.add(
            'visible'
        );


        clearTimeout(
            this.scaleTimer
        );


        this.scaleTimer =
            setTimeout(
                () => {

                    this.zoomScale.classList.remove(
                        'visible'
                    );

                },
                1800
            );
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

                const coords = {

                    latitude:
                        position.coords.latitude,

                    longitude:
                        position.coords.longitude,

                    accuracy:
                        position.coords.accuracy,

                    speed:
                        position.coords.speed,

                    heading:
                        position.coords.heading,

                    timestamp:
                        position.timestamp
                };


                this.updateCurrentMarker(
                    coords,
                    false
                );


                this.map.setCenter(
                    this.currentLocation
                );


                this.map.setLevel(2);
            },

            () => {

                log(
                    '⚠️ 초기 GPS 위치 확인 실패'
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
    // 목적지 선택 시작
    // ============================================================

    startDestinationSelection() {

        if (this.isNavigating) {
            return;
        }


        this.hideAllSelectionUI();

        this.clearRouteDisplay();


        this.state =
            NAVIGATION_STATE.SELECTING_DESTINATION;


        this.destinationButton.innerHTML =
            '✓';


        this.destinationButton.style.background =
            '#e8f5e9';


        log(
            '🎯 목적지 선택 모드'
        );
    }


    // ============================================================
    // 목적지 설정
    // ============================================================

    setDestination(location) {

        this.destinationLocation =
            location;


        // 기존 마커 제거

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


        this.destinationButton.innerHTML =
            '🎯';


        this.destinationButton.style.background =
            '#ffffff';


        this.state =
            NAVIGATION_STATE.DESTINATION_SELECTED;


        this.destinationName =
            `목적지 (${location.getLat().toFixed(5)}, ${location.getLng().toFixed(5)})`;


        // 목적지를 클릭했다고
        // 바로 출발/도착 카드가 뜨지 않음

        this.showDestinationDecisionCard();


        log(
            '🎯 목적지 설정 완료'
        );
    }


    // ============================================================
    // 목적지 선택 후 카드
    // ============================================================

    showDestinationDecisionCard() {

        this.destinationDecisionCard.innerHTML =
            `
            <div class="destination-address">
                🎯 ${this.destinationName}
            </div>

            <div class="destination-action-row">

                <button
                    type="button"
                    class="origin-select-btn"
                    id="select-origin-btn"
                >
                    출발
                </button>

                <button
                    type="button"
                    class="destination-confirm-btn"
                    id="confirm-destination-btn"
                >
                    도착
                </button>

            </div>
            `;


        this.destinationDecisionCard.style.display =
            'block';


        document
            .getElementById(
                'select-origin-btn'
            )
            .addEventListener(
                'click',
                () => {

                    alert(
                        '출발 위치 직접 선택 기능은 다음 단계에서 연결합니다.\n현재는 현재 위치를 출발지로 사용합니다.'
                    );
                }
            );


        document
            .getElementById(
                'confirm-destination-btn'
            )
            .addEventListener(
                'click',
                () => {

                    this.confirmDestination();
                }
            );
    }


    // ============================================================
    // 도착 확정
    // ============================================================

    async confirmDestination() {

        this.destinationDecisionCard.style.display =
            'none';


        this.state =
            NAVIGATION_STATE.ROUTE_SEARCH;


        this.originLocation =
            this.getCurrentOrigin();


        if (
            !this.originLocation
        ) {

            alert(
                '현재 위치를 먼저 확인해주세요.'
            );

            return;
        }


        await this.requestBicycleRoute();
    }


    // ============================================================
    // 현재 출발지
    // ============================================================

    getCurrentOrigin() {

        if (
            this.currentLocation
        ) {

            return {

                latitude:
                    this.currentLocation.getLat(),

                longitude:
                    this.currentLocation.getLng()
            };
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
    // 경로 요청
    // ============================================================

    async requestBicycleRoute() {

        if (
            this.isLoadingRoute
        ) {
            return;
        }


        if (
            !this.destinationLocation ||
            !this.originLocation
        ) {
            return;
        }


        this.isLoadingRoute =
            true;


        try {

            const params =
                new URLSearchParams({

                    start_x:
                        String(
                            this.originLocation.longitude
                        ),

                    start_y:
                        String(
                            this.originLocation.latitude
                        ),

                    end_x:
                        String(
                            this.destinationLocation.getLng()
                        ),

                    end_y:
                        String(
                            this.destinationLocation.getLat()
                        )
                });


            const controller =
                new AbortController();


            const timeoutId =
                setTimeout(
                    () => controller.abort(),
                    15000
                );


            let response;


            try {

                response =
                    await fetch(
                        `/api/bicycle-route?${params.toString()}`,
                        {

                            method:
                                'GET',

                            headers: {
                                'Accept':
                                    'application/json'
                            },

                            signal:
                                controller.signal
                        }
                    );

            } finally {

                clearTimeout(
                    timeoutId
                );
            }


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    '경로 요청에 실패했습니다.'
                );
            }


            // ----------------------------------------------------
            // 여러 경로 지원
            //
            // 현재 서버가 route 하나만 보내면
            // route 하나만 사용
            //
            // 나중에 routes 배열을 보내면
            // 자동으로 경로 1,2,3 생성
            // ----------------------------------------------------

            let routes = [];


            if (
                Array.isArray(
                    data.routes
                )
            ) {

                routes =
                    data.routes;

            } else if (
                data.route
            ) {

                routes =
                    [data.route];

            }


            if (
                routes.length === 0
            ) {

                throw new Error(
                    '경로를 찾지 못했습니다.'
                );
            }


            this.routes =
                routes;


            this.selectedRouteIndex =
                0;


            this.drawAllRoutes();

            this.showRouteSelectionUI();


            this.state =
                NAVIGATION_STATE.ROUTE_SELECTED;


            this.fitSelectedRouteToVisibleArea();

        } catch (error) {

            log(
                '❌ 경로 요청 실패',
                error
            );


            alert(
                `경로를 가져오지 못했습니다.\n\n${error.message}`
            );

        } finally {

            this.isLoadingRoute =
                false;
        }
    }


    // ============================================================
    // 모든 경로 표시
    // ============================================================

    drawAllRoutes() {

        this.clearRouteDisplay();


        this.routes.forEach(
            (route, index) => {

                const points =
                    this.extractRoutePoints(
                        route
                    );


                if (
                    points.length < 2
                ) {
                    return;
                }


                const polyline =
                    new kakao.maps.Polyline({

                        path:
                            points,

                        strokeWeight:
                            index ===
                            this.selectedRouteIndex
                                ? 7
                                : 4,

                        strokeColor:
                            index ===
                            this.selectedRouteIndex
                                ? '#1677ff'
                                : '#9aa4b2',

                        strokeOpacity:
                            index ===
                            this.selectedRouteIndex
                                ? 0.92
                                : 0.55,

                        strokeStyle:
                            'solid',

                        map:
                            this.map
                    });


                this.routePolylines.push({

                    polyline,

                    points,

                    route
                });
            }
        );


        this.updateSelectedRouteData();
    }


    // ============================================================
    // 경로 좌표 추출
    // ============================================================

    extractRoutePoints(route) {

        const points = [];


        route?.legs?.forEach(
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


        return this.removeDuplicateCoords(
            points
        );
    }


    // ============================================================
    // 경로 선택 UI
    // ============================================================

    showRouteSelectionUI() {

        const cards =
            this.routes
                .map(
                    (route, index) => {

                        const distance =
                            Number(
                                route.properties?.totalDistance
                            ) || 0;


                        const time =
                            Number(
                                route.properties?.totalTime
                            ) || 0;


                        const distanceText =
                            distance > 0
                                ? `${(distance / 1000).toFixed(1)}km`
                                : '-';


                        const timeText =
                            time > 0
                                ? this.formatMinutes(time)
                                : '-';


                        return `
                            <button
                                class="
                                    route-card
                                    ${
                                        index ===
                                        this.selectedRouteIndex
                                            ? 'selected'
                                            : ''
                                    }
                                "
                                data-route-index="${index}"
                            >

                                <div
                                    class="route-card-distance"
                                >
                                    ${distanceText}
                                </div>

                                <div
                                    class="route-card-time"
                                >
                                    ${timeText}
                                </div>

                                <div
                                    class="route-card-name"
                                >
                                    ${
                                        index === 0
                                            ? '추천'
                                            : `경로 ${index + 1}`
                                    }
                                </div>

                            </button>
                        `;
                    }
                )
                .join('');


        this.routePanel.innerHTML =
            `

            <div class="route-address-panel">

                <div class="route-address-list">

                    <div class="route-address-item">

                        <span>🟢</span>

                        <span>
                            현재 위치
                        </span>

                    </div>


                    <div class="route-address-item">

                        <span>🔴</span>

                        <span>
                            ${this.destinationName}
                        </span>

                    </div>

                </div>


                <div
                    class="route-address-actions"
                >

                    <button
                        type="button"
                        id="route-close-btn"
                    >
                        ×
                    </button>


                    <button
                        type="button"
                        id="route-add-btn"
                    >
                        +
                    </button>

                </div>

            </div>


            <div class="route-card-row">

                ${cards}

            </div>


            <button
                type="button"
                class="navigation-start-button"
                id="navigation-start-btn"
            >
                안내 시작
            </button>

            `;


        this.routePanel.style.display =
            'flex';


        this.routePanel
            .querySelectorAll(
                '.route-card'
            )
            .forEach(
                card => {

                    card.addEventListener(
                        'click',
                        () => {

                            const index =
                                Number(
                                    card.dataset.routeIndex
                                );


                            this.selectRoute(
                                index
                            );
                        }
                    );
                }
            );


        document
            .getElementById(
                'navigation-start-btn'
            )
            .addEventListener(
                'click',
                () => {

                    this.openSpeedSetting();
                }
            );


        document
            .getElementById(
                'route-close-btn'
            )
            .addEventListener(
                'click',
                () => {

                    this.closeRouteMode();
                }
            );


        document
            .getElementById(
                'route-add-btn'
            )
            .addEventListener(
                'click',
                () => {

                    alert(
                        '경유지 추가 기능은 다음 단계에서 연결합니다.'
                    );
                }
            );
    }


    // ============================================================
    // 경로 선택
    // ============================================================

    selectRoute(index) {

        if (
            !this.routes[index]
        ) {
            return;
        }


        this.selectedRouteIndex =
            index;


        this.routePolylines.forEach(
            (item, itemIndex) => {

                item.polyline.setOptions({

                    strokeWeight:
                        itemIndex === index
                            ? 7
                            : 4,

                    strokeColor:
                        itemIndex === index
                            ? '#1677ff'
                            : '#9aa4b2',

                    strokeOpacity:
                        itemIndex === index
                            ? 0.92
                            : 0.45
                });
            }
        );


        this.updateSelectedRouteData();

        this.showRouteSelectionUI();

        this.fitSelectedRouteToVisibleArea();
    }


    // ============================================================
    // 선택 경로 데이터
    // ============================================================

    updateSelectedRouteData() {

        const selected =
            this.routePolylines[
                this.selectedRouteIndex
            ];


        if (!selected) {
            return;
        }


        this.navigationPathCoords =
            selected.points;


        this.navigationDistance =
            Number(
                selected.route.properties?.totalDistance
            ) || 0;


        this.navigationTime =
            Number(
                selected.route.properties?.totalTime
            ) || 0;
    }


    // ============================================================
    // 실제 보이는 지도 영역에 경로 맞춤
    // ============================================================

    fitSelectedRouteToVisibleArea() {

        const selected =
            this.routePolylines[
                this.selectedRouteIndex
            ];


        if (
            !selected ||
            selected.points.length < 2
        ) {
            return;
        }


        const bounds =
            new kakao.maps.LatLngBounds();


        selected.points.forEach(
            point => {

                bounds.extend(
                    point
                );
            }
        );


        this.map.setBounds(
            bounds
        );


        // 상단 출발/도착 카드와
        // 하단 경로 카드에 가리지 않도록
        // 지도 중심을 약간 위로 이동

        setTimeout(
            () => {

                this.map.panBy(
                    0,
                    -60
                );

            },
            250
        );
    }


    // ============================================================
    // 목표속도 설정 열기
    // ============================================================

    openSpeedSetting() {

        if (
            this.navigationPathCoords.length < 2
        ) {
            return;
        }


        this.state =
            NAVIGATION_STATE.SPEED_SETTING;


        this.speedModal.innerHTML =
            `

            <div class="speed-modal">

                <h3>
                    목표 속도 설정
                </h3>

                <p>
                    목표 속도를 설정하면
                    실제 위치와 비교할 수 있습니다.
                </p>


                <div class="speed-input-wrap">

                    <input
                        id="navigation-target-speed"
                        type="number"
                        min="1"
                        max="80"
                        step="0.1"
                        value="25"
                    >

                    <span>
                        km/h
                    </span>

                </div>


                <div
                    class="speed-modal-actions"
                >

                    <button
                        type="button"
                        class="skip-speed-btn"
                        id="skip-target-speed"
                    >
                        건너뛰기
                    </button>


                    <button
                        type="button"
                        class="confirm-speed-btn"
                        id="confirm-target-speed"
                    >
                        선택
                    </button>

                </div>

            </div>
            `;


        this.speedModal.style.display =
            'flex';


        document
            .getElementById(
                'skip-target-speed'
            )
            .addEventListener(
                'click',
                () => {

                    this.targetSpeed =
                        null;


                    this.startNavigation();
                }
            );


        document
            .getElementById(
                'confirm-target-speed'
            )
            .addEventListener(
                'click',
                () => {

                    const input =
                        document.getElementById(
                            'navigation-target-speed'
                        );


                    const speed =
                        Number(
                            input.value
                        );


                    if (
                        !Number.isFinite(speed) ||
                        speed <= 0
                    ) {

                        alert(
                            '목표 속도를 입력해주세요.'
                        );

                        return;
                    }


                    this.targetSpeed =
                        speed;


                    this.startNavigation();
                }
            );
    }


    // ============================================================
    // 실제 길안내 시작
    // ============================================================

    startNavigation() {

        this.speedModal.style.display =
            'none';


        this.routePanel.style.display =
            'none';


        this.destinationButton.style.display =
            'none';


        this.locationButton.style.display =
            'block';


        this.state =
            NAVIGATION_STATE.NAVIGATION;


        this.isNavigating =
            true;


        this.userControlledMap =
            false;


        this.showNavigationHUD();


        this.startNavigationGPS();


        // --------------------------------------------------------
        // 목표속도가 있는 경우
        //
        // 바로 목표점이 움직이지 않는다.
        // GPS 시작 후 3초 뒤 현재 위치를 기준으로 출발.
        // --------------------------------------------------------

        if (
            this.targetSpeed
        ) {

            this.targetStarted =
                false;


            clearTimeout(
                this.targetStartTimer
            );


            this.targetStartTimer =
                setTimeout(
                    () => {

                        this.startTargetSpeed();

                    },
                    3000
                );
        }


        log(
            '🚴 실제 길안내 시작',
            {
                targetSpeed:
                    this.targetSpeed
            }
        );
    }


    // ============================================================
    // 네비게이션 GPS
    // ============================================================

    startNavigationGPS() {

        if (
            !navigator.geolocation
        ) {

            alert(
                '이 브라우저는 GPS를 지원하지 않습니다.'
            );

            return;
        }


        if (
            this.navigationWatchId !== null
        ) {

            navigator.geolocation.clearWatch(
                this.navigationWatchId
            );
        }


        this.navigationWatchId =
            navigator.geolocation.watchPosition(

                position => {

                    const coords = {

                        latitude:
                            position.coords.latitude,

                        longitude:
                            position.coords.longitude,

                        accuracy:
                            position.coords.accuracy,

                        speed:
                            position.coords.speed,

                        heading:
                            position.coords.heading,

                        timestamp:
                            position.timestamp
                    };


                    this.updateCurrentMarker(
                        coords,
                        false
                    );


                    this.updateNavigationView();

                    this.updateTargetPosition();

                },

                error => {

                    log(
                        '⚠️ 네비게이션 GPS 오류',
                        error
                    );
                },

                {

                    enableHighAccuracy:
                        true,

                    maximumAge:
                        1000,

                    timeout:
                        10000
                }
            );
    }


    // ============================================================
    // 목표속도 시작
    // ============================================================

    startTargetSpeed() {

        if (
            !this.currentLocation ||
            !this.targetSpeed
        ) {
            return;
        }


        this.navigationStartTime =
            Date.now();


        this.targetStartDistance =
            this.findDistanceAlongRoute(
                this.currentLocation
            );


        this.targetStarted =
            true;


        this.createTargetMarker(
            this.currentLocation
        );


        log(
            '🔵 목표 속도 점 시작',
            {
                speed:
                    this.targetSpeed,

                startDistance:
                    this.targetStartDistance
            }
        );
    }


    // ============================================================
    // 목표속도 위치 계산
    // ============================================================

    updateTargetPosition() {

        if (
            !this.targetStarted ||
            !this.targetSpeed ||
            !this.navigationStartTime
        ) {
            return;
        }


        const elapsedSeconds =
            (
                Date.now() -
                this.navigationStartTime
            ) / 1000;


        const targetMeters =
            this.targetStartDistance +
            (
                this.targetSpeed *
                1000 /
                3600 *
                elapsedSeconds
            );


        const targetLocation =
            this.getPointAlongRoute(
                targetMeters
            );


        if (!targetLocation) {
            return;
        }


        if (
            !this.targetMarker
        ) {

            this.createTargetMarker(
                targetLocation
            );

        } else {

            this.targetMarker.setPosition(
                targetLocation
            );
        }


        this.checkTargetGap(
            targetLocation
        );
    }


    // ============================================================
    // 목표점 마커
    // ============================================================

    createTargetMarker(location) {

        if (
            this.targetMarker
        ) {

            this.targetMarker.setMap(
                null
            );
        }


        this.targetMarker =
            new kakao.maps.Marker({

                position:
                    location,

                map:
                    this.map,

                title:
                    '목표 속도 위치',

                image:
                    this.createTargetMarkerImage()
            });
    }


    createTargetMarkerImage() {

        const svg =
            `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="42"
                height="42"
            >
                <circle
                    cx="21"
                    cy="21"
                    r="15"
                    fill="#1677ff"
                    stroke="white"
                    stroke-width="5"
                />

                <circle
                    cx="21"
                    cy="21"
                    r="5"
                    fill="white"
                />
            </svg>
            `;


        const imageUrl =
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;


        return new kakao.maps.MarkerImage(

            imageUrl,

            new kakao.maps.Size(
                42,
                42
            ),

            {
                offset:
                    new kakao.maps.Point(
                        21,
                        21
                    )
            }
        );
    }


    // ============================================================
    // 목표 위치와 실제 위치 거리 확인
    // ============================================================

    checkTargetGap(targetLocation) {

        if (
            !this.currentLocation
        ) {
            return;
        }


        const gap =
            this.calculateMeterDistance(
                this.currentLocation,
                targetLocation
            );


        // 50m 단위가 넘어갈 때
        // 나중에 음성 안내 연결 예정

        const gapLevel =
            Math.floor(
                gap / 50
            );


        if (
            gapLevel >
            (this.lastGapLevel || 0)
        ) {

            this.lastGapLevel =
                gapLevel;


            // ------------------------------------------------
            // 5초 동안
            // 실제 위치 + 목표 위치를 동시에 보여줌
            // ------------------------------------------------

            this.showBothPositionsForMoment();
        }
    }


    // ============================================================
    // 두 위치 잠깐 같이 보기
    // ============================================================

    showBothPositionsForMoment() {

        if (
            !this.currentLocation ||
            !this.targetMarker
        ) {
            return;
        }


        const target =
            this.targetMarker.getPosition();


        const bounds =
            new kakao.maps.LatLngBounds();


        bounds.extend(
            this.currentLocation
        );


        bounds.extend(
            target
        );


        this.map.setBounds(
            bounds
        );


        setTimeout(
            () => {

                if (
                    this.isNavigating &&
                    this.currentLocation
                ) {

                    this.userControlledMap =
                        false;


                    this.map.setCenter(
                        this.currentLocation
                    );


                    this.map.setLevel(1);
                }

            },
            5000
        );
    }


    // ============================================================
    // 길안내 지도 업데이트
    // ============================================================

    updateNavigationView() {

        if (
            !this.isNavigating ||
            !this.currentLocation
        ) {
            return;
        }


        // 사용자가 직접 지도를 움직였으면
        // 그대로 유지

        if (
            this.userControlledMap
        ) {
            return;
        }


        this.map.setCenter(
            this.currentLocation
        );


        // 카카오 지도 기준
        // 숫자가 작을수록 가까운 화면

        const speed =
            this.getCurrentSpeedKmh();


        if (
            speed > 15
        ) {

            this.map.setLevel(
                2
            );

        } else {

            this.map.setLevel(
                1
            );
        }
    }


    // ============================================================
    // 현재 위치 버튼
    // ============================================================

    goToCurrentLocation(forceAuto = false) {

        if (
            forceAuto
        ) {

            this.userControlledMap =
                false;
        }


        if (
            this.currentLocation
        ) {

            this.map.setCenter(
                this.currentLocation
            );


            if (
                this.isNavigating
            ) {

                const speed =
                    this.getCurrentSpeedKmh();


                this.map.setLevel(
                    speed > 15
                        ? 2
                        : 1
                );

            } else {

                this.map.setLevel(
                    2
                );
            }


            return;
        }


        this.requestInitialLocation();
    }


    // ============================================================
    // 현재 GPS 속도
    // ============================================================

    getCurrentSpeedKmh() {

        if (
            typeof window.app !==
            'undefined' &&
            Number.isFinite(
                window.app.currentSpeed
            )
        ) {

            return window.app.currentSpeed;
        }


        return 0;
    }


    // ============================================================
    // 실제 길안내 HUD
    // ============================================================

    showNavigationHUD() {

        this.navigationHUD.innerHTML =
            `

            <div class="navigation-next">

                🚴 길안내 중

            </div>


            <div class="navigation-info">

                <div
                    class="navigation-info-item"
                >

                    남은 거리

                    <strong
                        id="nav-remaining-distance"
                    >
                        -
                    </strong>

                </div>


                <div
                    class="navigation-info-item"
                >

                    목표 속도

                    <strong
                        id="nav-target-speed"
                    >
                        ${
                            this.targetSpeed
                                ? `${this.targetSpeed} km/h`
                                : '설정 안 함'
                        }
                    </strong>

                </div>

            </div>
            `;


        this.navigationHUD.style.display =
            'flex';
    }


    // ============================================================
    // 길안내 종료
    // ============================================================

    stopNavigation() {

        this.isNavigating =
            false;


        this.state =
            NAVIGATION_STATE.ROUTE_SELECTED;


        clearTimeout(
            this.targetStartTimer
        );


        if (
            this.navigationWatchId !==
            null
        ) {

            navigator.geolocation.clearWatch(
                this.navigationWatchId
            );


            this.navigationWatchId =
                null;
        }


        if (
            this.targetMarker
        ) {

            this.targetMarker.setMap(
                null
            );


            this.targetMarker =
                null;
        }


        this.targetStarted =
            false;


        this.navigationHUD.style.display =
            'none';


        this.destinationButton.style.display =
            'flex';


        this.showRouteSelectionUI();

        this.routePanel.style.display =
            'flex';
    }


    // ============================================================
    // 현재 위치 마커
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


        this.currentLocation =
            location;


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
    // 운동 기록 경로
    // 기존 app.js 호환용
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
                    3,

                strokeColor:
                    '#4CAF50',

                strokeOpacity:
                    0.8,

                map:
                    this.map
            });
    }


    // ============================================================
    // 운동 기록 초기화
    //
    // 중요:
    // 네비게이션 경로는 삭제하지 않음
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
    }


    // ============================================================
    // 경로 표시 제거
    // ============================================================

    clearRouteDisplay() {

        this.routePolylines.forEach(
            item => {

                item.polyline.setMap(
                    null
                );
            }
        );


        this.routePolylines =
            [];


        this.routes =
            [];


        this.navigationPathCoords =
            [];
    }


    // ============================================================
    // 모든 선택 UI 숨김
    // ============================================================

    hideAllSelectionUI() {

        if (
            this.destinationDecisionCard
        ) {

            this.destinationDecisionCard.style.display =
                'none';
        }


        if (
            this.routePanel
        ) {

            this.routePanel.style.display =
                'none';
        }


        if (
            this.speedModal
        ) {

            this.speedModal.style.display =
                'none';
        }
    }


    // ============================================================
    // 경로 모드 종료
    // ============================================================

    closeRouteMode() {

        this.hideAllSelectionUI();

        this.clearRouteDisplay();


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


        this.state =
            NAVIGATION_STATE.IDLE;
    }


    // ============================================================
    // 선택 경로까지의 거리
    // ============================================================

    findDistanceAlongRoute(location) {

        if (
            this.navigationPathCoords.length < 2
        ) {
            return 0;
        }


        let totalDistance =
            0;

        let nearestDistance =
            Infinity;

        let nearestProgress =
            0;


        for (
            let i = 1;
            i < this.navigationPathCoords.length;
            i++
        ) {

            const previous =
                this.navigationPathCoords[
                    i - 1
                ];


            const current =
                this.navigationPathCoords[
                    i
                ];


            const segmentDistance =
                this.calculateMeterDistance(
                    previous,
                    current
                );


            const distanceToPoint =
                this.calculateMeterDistance(
                    location,
                    current
                );


            if (
                distanceToPoint <
                nearestDistance
            ) {

                nearestDistance =
                    distanceToPoint;

                nearestProgress =
                    totalDistance;
            }


            totalDistance +=
                segmentDistance;
        }


        return nearestProgress;
    }


    // ============================================================
    // 경로의 특정 거리 위치
    // ============================================================

    getPointAlongRoute(
        targetDistance
    ) {

        let accumulated =
            0;


        for (
            let i = 1;
            i < this.navigationPathCoords.length;
            i++
        ) {

            const start =
                this.navigationPathCoords[
                    i - 1
                ];


            const end =
                this.navigationPathCoords[
                    i
                ];


            const segmentDistance =
                this.calculateMeterDistance(
                    start,
                    end
                );


            if (
                accumulated +
                segmentDistance >=
                targetDistance
            ) {

                const remain =
                    targetDistance -
                    accumulated;


                const ratio =
                    segmentDistance > 0
                        ? remain /
                          segmentDistance
                        : 0;


                return new kakao.maps.LatLng(

                    start.getLat() +
                    (
                        end.getLat() -
                        start.getLat()
                    ) * ratio,

                    start.getLng() +
                    (
                        end.getLng() -
                        start.getLng()
                    ) * ratio
                );
            }


            accumulated +=
                segmentDistance;
        }


        return this.navigationPathCoords[
            this.navigationPathCoords.length - 1
        ];
    }


    // ============================================================
    // 두 좌표 거리
    // ============================================================

    calculateMeterDistance(
        a,
        b
    ) {

        const R =
            6371000;


        const lat1 =
            a.getLat() *
            Math.PI /
            180;


        const lat2 =
            b.getLat() *
            Math.PI /
            180;


        const dLat =
            (
                b.getLat() -
                a.getLat()
            ) *
            Math.PI /
            180;


        const dLng =
            (
                b.getLng() -
                a.getLng()
            ) *
            Math.PI /
            180;


        const value =
            Math.sin(
                dLat / 2
            ) ** 2 +

            Math.cos(lat1) *
            Math.cos(lat2) *

            Math.sin(
                dLng / 2
            ) ** 2;


        return (
            R *
            2 *
            Math.atan2(
                Math.sqrt(value),
                Math.sqrt(1 - value)
            )
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


                if (
                    !last ||

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
    // 시간 표시
    // ============================================================

    formatMinutes(seconds) {

        const minutes =
            Math.round(
                seconds / 60
            );


        if (
            minutes < 60
        ) {

            return
                `${minutes}분`;
        }


        const hour =
            Math.floor(
                minutes / 60
            );


        const remain =
            minutes % 60;


        return
            `${hour}시간 ${remain}분`;
    }
}


// ============================================================
// 전역 지도 관리자
// ============================================================

const mapManager =
    new MapManager();
