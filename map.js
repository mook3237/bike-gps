// ============================================================
// 🗺️ Bike GPS App - MapManager
// 전체 지도 / 목적지 / 경로 / 목표속도 / 네비게이션 관리
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
        this.mapContainer = null;

        this.programmaticMapMove =
            false;

        this.userZoomInteracted =
            false;


        // ====================================================
        // 현재 위치
        // ====================================================

        this.currentMarker = null;

        this.currentPosition = null;

        this.currentAccuracy = null;


        // ====================================================
        // 실제 운동 기록 경로
        // ====================================================

        this.polyline = null;

        this.pathCoords = [];


        // ====================================================
        // 목적지 / 출발지
        // ====================================================

        this.destinationMarker = null;

        this.destinationLocation = null;

        this.destinationAddress = '';

        this.customOrigin = null;

        this.originAddress =
            '현재 위치';

        this.isSelectingDestination =
            false;

        this.selectionMode =
            null;

        this.pendingLocation =
            null;

        this.pendingAddress =
            '';


        // ====================================================
        // 네비게이션 경로
        // ====================================================

        this.navigationPolyline = null;

        this.navigationPathCoords = [];

        this.navigationDistance =
            0;

        this.navigationTime =
            0;

        this.routeList = [];

        this.selectedRoute = null;

        this.selectedRouteIndex =
            -1;

        this.routeCumulativeDistances =
            [];


        // ====================================================
        // 목표 속도
        // ====================================================

        this.targetSpeed =
            null;

        this.targetMarker =
            null;

        this.targetProgressMeters =
            0;

        this.userProgressMeters =
            0;

        this.targetStarted =
            false;

        this.targetStartTimer =
            null;

        this.targetAnimationFrame =
            null;

        this.targetLastUpdateTime =
            null;


        // ====================================================
        // 길안내
        // ====================================================

        this.isNavigating =
            false;

        this.isLoadingRoute =
            false;

        this.navigationWatchId =
            null;

        this.navigationStartedAt =
            null;


        // ====================================================
        // GPS 이동 상태
        // ====================================================

        this.lastNavigationPosition =
            null;

        this.lastNavigationTimestamp =
            null;

        this.isUserMoving =
            false;


        // ====================================================
        // 위치 차이 자동 보기
        // ====================================================

        this.lastDifferenceBucket =
            0;

        this.differenceViewTimer =
            null;

        this.differenceViewActive =
            false;


        // ====================================================
        // 지도 축척 표시
        // ====================================================

        this.mapScaleTimer =
            null;


        // ====================================================
        // DOM
        // ====================================================

        this.locationPanel =
            null;

        this.destinationButton =
            null;

        this.currentLocationButton =
            null;

        this.routeSelector =
            null;

        this.routeCardList =
            null;

        this.targetSpeedModal =
            null;

        this.navigationStartButton =
            null;

        this.destinationChoiceCard =
            null;

        this.mapScaleElement =
            null;


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
                document.getElementById(
                    'map'
                );


            if (!this.mapContainer) {

                throw new Error(
                    '지도 컨테이너를 찾을 수 없습니다.'
                );
            }


            // 지도 컨테이너 전체 사용

            Object.assign(
                this.mapContainer.style,
                {
                    position:
                        'relative',

                    width:
                        '100%',

                    height:
                        '100%',

                    minHeight:
                        '100vh',

                    overflow:
                        'hidden'
                }
            );


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


            this.initializeUI();

            this.createDynamicUI();

            this.setupMapEvents();

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


        // --------------------------------------------------------
        // 기본적으로 경로 / 출발도착 패널 숨김
        // --------------------------------------------------------

        if (this.locationPanel) {

            this.locationPanel.classList.remove(
                'active'
            );
        }


        if (this.routeSelector) {

            this.routeSelector.classList.remove(
                'active'
            );
        }


        if (this.targetSpeedModal) {

            this.targetSpeedModal.classList.remove(
                'active'
            );
        }


        if (this.navigationStartButton) {

            this.navigationStartButton.classList.remove(
                'active'
            );
        }


        // --------------------------------------------------------
        // 목적지 버튼
        // --------------------------------------------------------

        if (this.destinationButton) {

            this.destinationButton.addEventListener(
                'click',
                () => {

                    this.startDestinationSelection();
                }
            );
        }


        // --------------------------------------------------------
        // 현재 위치 버튼
        // --------------------------------------------------------

        if (this.currentLocationButton) {

            this.currentLocationButton.addEventListener(
                'click',
                () => {

                    this.userZoomInteracted =
                        false;

                    this.goToCurrentLocation();
                }
            );
        }


        // --------------------------------------------------------
        // 출발 / 도착 패널 닫기
        // --------------------------------------------------------

        const locationClose =
            document.getElementById(
                'location-panel-close'
            );


        if (locationClose) {

            locationClose.addEventListener(
                'click',
                () => {

                    this.clearRouteCompletely();

                    this.clearDestination();
                }
            );
        }


        // --------------------------------------------------------
        // 경로 선택 닫기
        // --------------------------------------------------------

        const routeClose =
            document.getElementById(
                'route-selector-close'
            );


        if (routeClose) {

            routeClose.addEventListener(
                'click',
                () => {

                    this.clearRouteCompletely();
                }
            );
        }


        // --------------------------------------------------------
        // 목표속도 건너뛰기
        // --------------------------------------------------------

        const skipTarget =
            document.getElementById(
                'skip-target-speed'
            );


        if (skipTarget) {

            skipTarget.addEventListener(
                'click',
                () => {

                    this.setTargetSpeed(
                        null
                    );

                    this.startNavigation();
                }
            );
        }


        // --------------------------------------------------------
        // 목표속도 선택
        // --------------------------------------------------------

        const confirmTarget =
            document.getElementById(
                'confirm-target-speed'
            );


        if (confirmTarget) {

            confirmTarget.addEventListener(
                'click',
                () => {

                    const input =
                        document.getElementById(
                            'route-target-speed'
                        );


                    const value =
                        Number(
                            input?.value
                        );


                    if (
                        !Number.isFinite(
                            value
                        ) ||
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

                    this.startNavigation();
                }
            );
        }


        // --------------------------------------------------------
        // 안내 시작
        // 경로 선택 -> 안내 시작 -> 목표 속도
        // --------------------------------------------------------

        if (this.navigationStartButton) {

            this.navigationStartButton.addEventListener(
                'click',
                () => {

                    if (!this.selectedRoute) {

                        alert(
                            '경로를 먼저 선택해주세요.'
                        );

                        return;
                    }


                    this.showTargetSpeedModal();
                }
            );
        }


        // --------------------------------------------------------
        // 경유지
        // --------------------------------------------------------

        const waypointButton =
            document.getElementById(
                'add-waypoint-button'
            );


        if (waypointButton) {

            waypointButton.addEventListener(
                'click',
                () => {

                    alert(
                        '경유지 기능은 다음 단계에서 연결합니다.'
                    );
                }
            );
        }


        log(
            '✅ 지도 UI 연결 완료'
        );
    }


    // ============================================================
    // 동적으로 필요한 UI 생성
    // ============================================================

    createDynamicUI() {


        if (!this.mapContainer) {

            return;
        }


        // --------------------------------------------------------
        // 선택한 위치 출발 / 도착 카드
        // --------------------------------------------------------

        this.destinationChoiceCard =
            document.createElement(
                'div'
            );


        this.destinationChoiceCard.id =
            'destination-choice-card';


        Object.assign(
            this.destinationChoiceCard.style,
            {
                position:
                    'absolute',

                left:
                    '50%',

                bottom:
                    '28px',

                transform:
                    'translateX(-50%)',

                width:
                    'min(92%, 420px)',

                display:
                    'none',

                zIndex:
                    '900',

                pointerEvents:
                    'auto',

                padding:
                    '16px',

                borderRadius:
                    '18px',

                background:
                    'rgba(255,255,255,0.94)',

                backdropFilter:
                    'blur(12px)',

                boxShadow:
                    '0 10px 30px rgba(0,0,0,0.18)'
            }
        );


        this.destinationChoiceCard.innerHTML =
            `
            <div
                id="pending-location-address"
                style="
                    font-size:15px;
                    font-weight:700;
                    margin-bottom:14px;
                    word-break:keep-all;
                "
            >
                위치를 선택했습니다
            </div>

            <div
                style="
                    display:flex;
                    gap:10px;
                "
            >
                <button
                    type="button"
                    id="select-as-origin"
                    style="
                        flex:1;
                        border:none;
                        border-radius:12px;
                        padding:14px 10px;
                        font-weight:700;
                        cursor:pointer;
                    "
                >
                    📍 출발
                </button>

                <button
                    type="button"
                    id="select-as-destination"
                    style="
                        flex:1;
                        border:none;
                        border-radius:12px;
                        padding:14px 10px;
                        font-weight:700;
                        cursor:pointer;
                    "
                >
                    🎯 도착
                </button>
            </div>
            `;


        this.mapContainer.appendChild(
            this.destinationChoiceCard
        );


        document
            .getElementById(
                'select-as-origin'
            )
            .addEventListener(
                'click',
                () => {

                    this.confirmPendingAsOrigin();
                }
            );


        document
            .getElementById(
                'select-as-destination'
            )
            .addEventListener(
                'click',
                () => {

                    this.confirmPendingAsDestination();
                }
            );


        // --------------------------------------------------------
        // 지도 반경 표시
        // 평소에는 숨김
        // --------------------------------------------------------

        this.mapScaleElement =
            document.createElement(
                'div'
            );


        this.mapScaleElement.id =
            'map-scale-floating';


        Object.assign(
            this.mapScaleElement.style,
            {
                position:
                    'absolute',

                left:
                    '16px',

                bottom:
                    '20px',

                zIndex:
                    '800',

                display:
                    'none',

                padding:
                    '7px 11px',

                borderRadius:
                    '8px',

                background:
                    'rgba(255,255,255,0.88)',

                color:
                    '#333',

                fontSize:
                    '12px',

                fontWeight:
                    '700',

                boxShadow:
                    '0 2px 8px rgba(0,0,0,0.12)',

                pointerEvents:
                    'none'
            }
        );


        this.mapContainer.appendChild(
            this.mapScaleElement
        );
    }


    // ============================================================
    // 지도 이벤트
    // ============================================================

    setupMapEvents() {


        // --------------------------------------------------------
        // 지도 클릭
        // --------------------------------------------------------

        kakao.maps.event.addListener(
            this.map,
            'click',
            (mouseEvent) => {

                if (
                    !this.isSelectingDestination
                ) {

                    return;
                }


                this.setPendingLocation(
                    mouseEvent.latLng
                );
            }
        );


        // --------------------------------------------------------
        // 줌 변경
        // --------------------------------------------------------

        kakao.maps.event.addListener(
            this.map,
            'zoom_changed',
            () => {

                if (
                    !this.programmaticMapMove
                ) {

                    this.userZoomInteracted =
                        true;
                }


                this.showMapScaleTemporary();
            }
        );


        // --------------------------------------------------------
        // 지도 이동
        // --------------------------------------------------------

        kakao.maps.event.addListener(
            this.map,
            'dragend',
            () => {

                if (
                    !this.programmaticMapMove
                ) {

                    this.userZoomInteracted =
                        true;
                }
            }
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
    //
    // 목적지 버튼을 누른 순간에는
    // 출발 / 도착 UI를 띄우지 않는다.
    // ============================================================

    startDestinationSelection() {


        this.hideDestinationChoiceCard();


        this.clearRouteCompletely();


        this.clearDestinationMarkerOnly();


        this.isSelectingDestination =
            true;


        this.selectionMode =
            'first';


        this.pendingLocation =
            null;


        this.pendingAddress =
            '';


        if (this.destinationButton) {

            this.destinationButton.classList.add(
                'active'
            );
        }


        log(
            '🎯 목적지 선택 모드 시작'
        );
    }


    // ============================================================
    // 지도에서 위치 선택
    // ============================================================

    setPendingLocation(location) {


        if (!location) {

            return;
        }


        this.pendingLocation =
            location;


        this.isSelectingDestination =
            false;


        if (this.destinationButton) {

            this.destinationButton.classList.remove(
                'active'
            );
        }


        // 선택 마커 표시

        this.showDestinationMarker(
            location
        );


        this.reverseGeocodePendingLocation(
            location
        );


        log(
            '📍 위치 선택 완료'
        );
    }


    // ============================================================
    // 선택 위치 주소 변환
    // ============================================================

    reverseGeocodePendingLocation(location) {


        if (
            !kakao.maps.services
        ) {

            this.pendingAddress =
                '선택한 위치';

            this.showDestinationChoiceCard();

            return;
        }


        const geocoder =
            new kakao.maps.services.Geocoder();


        geocoder.coord2Address(

            location.getLng(),

            location.getLat(),

            (result, status) => {


                let address =
                    '선택한 위치';


                if (
                    status ===
                    kakao.maps.services.Status.OK
                ) {

                    address =
                        result?.[0]?.road_address?.address_name ||
                        result?.[0]?.address?.address_name ||
                        '선택한 위치';
                }


                this.pendingAddress =
                    address;


                this.showDestinationChoiceCard();
            }
        );
    }


    // ============================================================
    // 출발 / 도착 선택 카드 표시
    // ============================================================

    showDestinationChoiceCard() {


        if (
            !this.destinationChoiceCard
        ) {

            return;
        }


        const addressElement =
            document.getElementById(
                'pending-location-address'
            );


        if (addressElement) {

            addressElement.textContent =
                this.pendingAddress ||
                '선택한 위치';
        }


        this.destinationChoiceCard.style.display =
            'block';
    }


    // ============================================================
    // 선택 카드 숨김
    // ============================================================

    hideDestinationChoiceCard() {


        if (
            this.destinationChoiceCard
        ) {

            this.destinationChoiceCard.style.display =
                'none';
        }
    }


    // ============================================================
    // 선택 위치를 출발지로 설정
    //
    // 출발 선택
    // -> 다시 지도에서 도착지를 선택
    // ============================================================

    confirmPendingAsOrigin() {


        if (
            !this.pendingLocation
        ) {

            return;
        }


        this.customOrigin =
            {
                latitude:
                    this.pendingLocation.getLat(),

                longitude:
                    this.pendingLocation.getLng()
            };


        this.originAddress =
            this.pendingAddress ||
            '선택한 출발지';


        this.hideDestinationChoiceCard();


        this.clearDestinationMarkerOnly();


        this.pendingLocation =
            null;


        this.pendingAddress =
            '';


        // 이제 도착지 선택

        this.isSelectingDestination =
            true;


        this.selectionMode =
            'destination-after-origin';


        if (this.destinationButton) {

            this.destinationButton.classList.add(
                'active'
            );
        }


        log(
            '📍 출발지 설정 완료 → 도착지 선택 대기'
        );
    }


    // ============================================================
    // 선택 위치를 도착지로 설정
    //
    // 출발지는 현재 위치
    // ============================================================

    confirmPendingAsDestination() {


        if (
            !this.pendingLocation
        ) {

            return;
        }


        this.destinationLocation =
            this.pendingLocation;


        this.destinationAddress =
            this.pendingAddress ||
            '선택한 목적지';


        this.customOrigin =
            null;


        this.originAddress =
            '현재 위치';


        this.hideDestinationChoiceCard();


        this.pendingLocation =
            null;


        this.pendingAddress =
            '';


        this.updateLocationPanelText();


        this.requestBicycleRoute();
    }


    // ============================================================
    // 출발지를 선택한 뒤
    // 두 번째 지도 클릭
    // ============================================================

    confirmSecondPointAsDestination(
        location
    ) {


        this.destinationLocation =
            location;


        this.isSelectingDestination =
            false;


        this.showDestinationMarker(
            location
        );


        if (
            this.destinationButton
        ) {

            this.destinationButton.classList.remove(
                'active'
            );
        }


        this.reverseGeocodeFinalDestination(
            location
        );
    }


    // ============================================================
    // 최종 도착지 주소 변환
    // ============================================================

    reverseGeocodeFinalDestination(
        location
    ) {


        if (
            !kakao.maps.services
        ) {

            this.destinationAddress =
                '선택한 목적지';

            this.updateLocationPanelText();

            this.requestBicycleRoute();

            return;
        }


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


                this.updateLocationPanelText();


                this.requestBicycleRoute();
            }
        );
    }


    // ============================================================
    // 목적지 마커
    // ============================================================

    showDestinationMarker(location) {


        this.clearDestinationMarkerOnly();


        this.destinationMarker =
            new kakao.maps.Marker(
                {
                    position:
                        location,

                    map:
                        this.map,

                    title:
                        '선택 위치'
                }
            );
    }


    // ============================================================
    // 출발 / 도착 패널 텍스트
    // ============================================================

    updateLocationPanelText() {


        const originElement =
            document.getElementById(
                'origin-address'
            );


        const destinationElement =
            document.getElementById(
                'destination-address'
            );


        if (originElement) {

            originElement.textContent =
                this.originAddress ||
                '현재 위치';
        }


        if (destinationElement) {

            destinationElement.textContent =
                this.destinationAddress ||
                '목적지를 설정하세요';
        }
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

                        speed:
                            position.coords.speed,

                        timestamp:
                            position.timestamp
                    },

                    false
                );


                this.programmaticMapMove =
                    true;


                this.map.setLevel(
                    1
                );


                this.map.panTo(
                    location
                );


                setTimeout(
                    () => {

                        this.programmaticMapMove =
                            false;
                    },
                    500
                );


                this.showMapScaleTemporary();
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
            this.customOrigin
        ) {

            return this.customOrigin;
        }


        if (
            this.currentPosition
        ) {

            return this.currentPosition;
        }


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


        if (!origin) {

            alert(
                '현재 위치를 확인하는 중입니다.'
            );

            return;
        }


        this.isLoadingRoute =
            true;


        try {


            const params =
                new URLSearchParams(
                    {
                        start_x:
                            origin.longitude,

                        start_y:
                            origin.latitude,

                        end_x:
                            this.destinationLocation.getLng(),

                        end_y:
                            this.destinationLocation.getLat()
                    }
                );


            const response =
                await fetch(
                    `/api/bicycle-route?${params.toString()}`
                );


            const data =
                await response.json();


            if (!response.ok) {

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


            // 첫 번째 경로 기본 선택

            this.selectRoute(
                0
            );


            // 출발 / 도착 + 경로 카드 동시에 표시

            this.showRouteUI();


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
            Array.isArray(
                data?.routes
            )
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

            typeof data.routes ===
            'object'

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
    // 경로 선택
    //
    // 여기서는 목표속도 카드가 뜨지 않는다.
    // ============================================================

    selectRoute(index) {


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


        this.renderRouteCards();


        // 선택하면 안내 시작 버튼만 표시

        if (
            this.navigationStartButton
        ) {

            this.navigationStartButton.classList.add(
                'active'
            );
        }
    }


    // ============================================================
    // 경로 UI 표시
    // ============================================================

    showRouteUI() {


        this.updateLocationPanelText();


        if (
            this.locationPanel
        ) {

            this.locationPanel.classList.add(
                'active'
            );
        }


        if (
            this.routeSelector
        ) {

            this.routeSelector.classList.add(
                'active'
            );
        }


        this.renderRouteCards();


        // 카드가 경로를 가리지 않도록
        // 전체 경로를 한 번 더 맞춤

        setTimeout(
            () => {

                this.fitRouteWithUI();
            },

            100
        );
    }


    // ============================================================
    // 경로 카드 표시
    // ============================================================

    renderRouteCards() {


        if (
            !this.routeCardList
        ) {

            return;
        }


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


                // 큰 외곽 박스 제거

                Object.assign(
                    card.style,
                    {
                        background:
                            'transparent',

                        border:
                            'none',

                        boxShadow:
                            'none'
                    }
                );


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
                    <div class="route-card-distance">
                        ${this.formatDistance(distance)}
                    </div>

                    <div class="route-card-time">
                        ${this.formatDuration(duration)}
                    </div>

                    <div class="route-card-name">
                        ${
                            index === 0
                                ? '추천'
                                : `경로 ${index + 1}`
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


                this.routeCardList.appendChild(
                    card
                );
            }
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


        // --------------------------------------------------------
        // legs 구조
        // --------------------------------------------------------

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

                                        Number.isFinite(
                                            lat
                                        ) &&

                                        Number.isFinite(
                                            lng
                                        )

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


        // --------------------------------------------------------
        // sections 구조
        // --------------------------------------------------------

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

                                    Number.isFinite(
                                        lat
                                    ) &&

                                    Number.isFinite(
                                        lng
                                    )

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
            new kakao.maps.Polyline(
                {
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
                }
            );


        this.navigationDistance =
            this.getRouteDistance(
                route
            );


        this.navigationTime =
            this.getRouteTime(
                route
            );


        this.buildRouteDistanceTable();


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


        this.programmaticMapMove =
            true;


        this.map.setBounds(
            bounds
        );


        setTimeout(
            () => {

                this.programmaticMapMove =
                    false;
            },

            500
        );
    }


    // ============================================================
    // UI가 있을 때 전체 경로 보기
    // ============================================================

    fitRouteWithUI() {


        if (
            this.navigationPathCoords.length === 0
        ) {

            return;
        }


        this.fitRoute();


        // UI 카드 때문에 경로 하단이 가려지는 것을
        // 조금 완화하기 위한 중심 이동

        setTimeout(
            () => {

                if (
                    !this.map
                ) {

                    return;
                }


                const center =
                    this.map.getCenter();


                const projection =
                    this.map.getProjection();


                if (!projection) {

                    return;
                }


                // 카카오 지도 내부 투영이 준비되지 않은 경우
                // 별도의 강제 이동 없이 종료

            },

            250
        );
    }


    // ============================================================
    // 목표 속도 카드
    // ============================================================

    showTargetSpeedModal() {


        if (
            !this.targetSpeedModal
        ) {

            // 모달이 없는 경우 바로 시작

            this.setTargetSpeed(
                null
            );

            this.startNavigation();

            return;
        }


        this.targetSpeedModal.classList.add(
            'active'
        );


        const input =
            document.getElementById(
                'route-target-speed'
            );


        if (input) {

            input.focus();
        }
    }


    // ============================================================
    // 목표 속도 설정
    // ============================================================

    setTargetSpeed(speed) {


        this.targetSpeed =
            speed;


        if (
            this.targetSpeedModal
        ) {

            this.targetSpeedModal.classList.remove(
                'active'
            );
        }


        log(
            '🎯 목표 속도 설정',
            speed
        );
    }


    // ============================================================
    // 길안내 시작
    //
    // GPS 추적과 운동 기록은 별도
    // 여기서는 네비게이션 전용 GPS watch 사용
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


        if (
            this.isNavigating
        ) {

            return;
        }


        this.isNavigating =
            true;


        this.navigationStartedAt =
            Date.now();


        this.userProgressMeters =
            0;


        this.targetProgressMeters =
            0;


        this.lastDifferenceBucket =
            0;


        this.targetStarted =
            false;


        // --------------------------------------------------------
        // 길안내 화면에서는
        // 출발도착 카드 / 경로 카드 제거
        // --------------------------------------------------------

        if (
            this.locationPanel
        ) {

            this.locationPanel.classList.remove(
                'active'
            );
        }


        if (
            this.routeSelector
        ) {

            this.routeSelector.classList.remove(
                'active'
            );
        }


        if (
            this.navigationStartButton
        ) {

            this.navigationStartButton.classList.remove(
                'active'
            );
        }


        // --------------------------------------------------------
        // 현재 위치 버튼은 길안내 중에도 유지
        // --------------------------------------------------------

        this.startNavigationGPS();


        // --------------------------------------------------------
        // 목표 점은 길안내 시작 후 3초 뒤
        // 그 순간의 실제 GPS 위치를 기준으로 시작
        // --------------------------------------------------------

        if (
            this.targetSpeed &&
            this.targetSpeed > 0
        ) {

            this.targetStartTimer =
                setTimeout(

                    () => {

                        this.startTargetFromCurrentGPS();
                    },

                    3000
                );
        }


        log(
            '🧭 길안내 시작'
        );
    }


    // ============================================================
    // 네비게이션 GPS 시작
    // ============================================================

    startNavigationGPS() {


        if (
            !navigator.geolocation
        ) {

            alert(
                'GPS를 지원하지 않는 기기입니다.'
            );

            return;
        }


        if (
            this.navigationWatchId !==
            null
        ) {

            navigator.geolocation.clearWatch(
                this.navigationWatchId
            );
        }


        this.navigationWatchId =
            navigator.geolocation.watchPosition(

                (position) => {


                    const gps =
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
                        };


                    this.handleNavigationGPS(
                        gps
                    );
                },


                (error) => {

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
    // 네비게이션 GPS 처리
    // ============================================================

    handleNavigationGPS(gps) {


        this.updateCurrentMarker(
            gps,
            false
        );


        const currentLocation =
            new kakao.maps.LatLng(
                gps.latitude,
                gps.longitude
            );


        // --------------------------------------------------------
        // 이동 여부 판단
        // --------------------------------------------------------

        this.updateUserMovingState(
            gps
        );


        // --------------------------------------------------------
        // 현재 위치의 경로 진행도 계산
        // --------------------------------------------------------

        this.userProgressMeters =
            this.getNearestRouteProgress(
                currentLocation
            );


        // --------------------------------------------------------
        // 사용자가 직접 줌을 조작하지 않았다면
        // 현재 위치 중심 유지
        // --------------------------------------------------------

        if (
            !this.userZoomInteracted &&
            !this.differenceViewActive
        ) {

            this.programmaticMapMove =
                true;


            this.map.panTo(
                currentLocation
            );


            const desiredLevel =
                this.getNavigationZoomLevel(
                    gps.speed
                );


            if (
                this.map.getLevel() !==
                desiredLevel
            ) {

                this.map.setLevel(
                    desiredLevel
                );
            }


            setTimeout(
                () => {

                    this.programmaticMapMove =
                        false;
                },

                250
            );
        }


        // --------------------------------------------------------
        // 목표 위치 갱신
        // --------------------------------------------------------

        if (
            this.targetStarted
        ) {

            this.updateTargetPosition();
        }
    }


    // ============================================================
    // 사용자 이동 여부
    // ============================================================

    updateUserMovingState(gps) {


        let moving =
            false;


        const currentSpeed =
            Number(
                gps.speed
            );


        if (
            Number.isFinite(
                currentSpeed
            ) &&
            currentSpeed > 0.8
        ) {

            moving =
                true;
        }


        if (
            this.lastNavigationPosition
        ) {

            const distance =
                this.calculateDistanceMeters(

                    this.lastNavigationPosition.latitude,

                    this.lastNavigationPosition.longitude,

                    gps.latitude,

                    gps.longitude
                );


            const timeDiff =
                Math.max(

                    1,

                    (
                        gps.timestamp -
                        this.lastNavigationTimestamp
                    ) / 1000
                );


            const calculatedSpeed =
                distance / timeDiff;


            if (
                calculatedSpeed > 0.8
            ) {

                moving =
                    true;
            }
        }


        this.isUserMoving =
            moving;


        this.lastNavigationPosition =
            {
                latitude:
                    gps.latitude,

                longitude:
                    gps.longitude
            };


        this.lastNavigationTimestamp =
            gps.timestamp;
    }


    // ============================================================
    // 속도에 따른 네비게이션 줌
    //
    // 카카오 지도 level:
    // 숫자가 작을수록 가까운 지도
    // ============================================================

    getNavigationZoomLevel(speed) {


        const value =
            Number(speed);


        if (
            !Number.isFinite(
                value
            )
        ) {

            return 1;
        }


        // 약 5km/h 이하

        if (
            value < 1.4
        ) {

            return 1;
        }


        // 속도가 붙으면 조금 넓게

        return 2;
    }


    // ============================================================
    // 목표 점 시작
    //
    // 3초 후의 실제 GPS 위치를 기준으로 시작
    // ============================================================

    startTargetFromCurrentGPS() {


        if (
            !this.isNavigating ||
            !this.currentPosition
        ) {

            return;
        }


        const currentLocation =
            new kakao.maps.LatLng(
                this.currentPosition.latitude,
                this.currentPosition.longitude
            );


        const progress =
            this.getNearestRouteProgress(
                currentLocation
            );


        this.targetProgressMeters =
            progress;


        this.targetStarted =
            true;


        this.targetLastUpdateTime =
            Date.now();


        this.updateTargetMarker();


        this.startTargetAnimation();


        log(
            '🎯 목표 위치 시작',
            {
                progress:
                    this.targetProgressMeters
            }
        );
    }


    // ============================================================
    // 목표 위치 애니메이션
    //
    // 사용자가 멈추면 목표도 멈춘다.
    // ============================================================

    startTargetAnimation() {


        if (
            this.targetAnimationFrame
        ) {

            cancelAnimationFrame(
                this.targetAnimationFrame
            );
        }


        const animate =
            () => {


                if (
                    !this.isNavigating ||
                    !this.targetStarted
                ) {

                    return;
                }


                const now =
                    Date.now();


                const elapsedSeconds =
                    Math.max(
                        0,
                        (
                            now -
                            this.targetLastUpdateTime
                        ) / 1000
                    );


                this.targetLastUpdateTime =
                    now;


                // ------------------------------------------------
                // 자전거가 실제로 움직일 때만
                // 목표 점도 진행
                // ------------------------------------------------

                if (
                    this.isUserMoving &&
                    this.targetSpeed > 0
                ) {

                    const metersPerSecond =
                        this.targetSpeed /
                        3.6;


                    this.targetProgressMeters +=

                        metersPerSecond *
                        elapsedSeconds;


                    this.targetProgressMeters =
                        Math.min(

                            this.targetProgressMeters,

                            this.getTotalRouteDistance()
                        );
                }


                this.updateTargetPosition();


                this.targetAnimationFrame =
                    requestAnimationFrame(
                        animate
                    );
            };


        this.targetAnimationFrame =
            requestAnimationFrame(
                animate
            );
    }


    // ============================================================
    // 목표 위치 업데이트
    // ============================================================

    updateTargetPosition() {


        const targetLocation =
            this.getRoutePositionAtDistance(
                this.targetProgressMeters
            );


        if (!targetLocation) {

            return;
        }


        if (
            !this.targetMarker
        ) {

            this.targetMarker =
                new kakao.maps.Marker(
                    {
                        position:
                            targetLocation,

                        map:
                            this.map,

                        title:
                            '목표 위치'
                    }
                );

        } else {

            this.targetMarker.setPosition(
                targetLocation
            );
        }


        this.checkDifferenceView(
            targetLocation
        );
    }


    // ============================================================
    // 목표 마커 생성
    // ============================================================

    updateTargetMarker() {


        const targetLocation =
            this.getRoutePositionAtDistance(
                this.targetProgressMeters
            );


        if (!targetLocation) {

            return;
        }


        if (
            !this.targetMarker
        ) {

            this.targetMarker =
                new kakao.maps.Marker(
                    {
                        position:
                            targetLocation,

                        map:
                            this.map,

                        title:
                            '목표 속도 위치'
                    }
                );

        } else {

            this.targetMarker.setPosition(
                targetLocation
            );
        }
    }


    // ============================================================
    // 실제 위치와 목표 위치 차이
    //
    // 50m 단위로 차이가 더 커질 때
    // 5초 동안 두 위치 표시
    // ============================================================

    checkDifferenceView(
        targetLocation
    ) {


        if (
            !this.currentPosition ||
            !this.targetStarted
        ) {

            return;
        }


        const currentLocation =
            new kakao.maps.LatLng(
                this.currentPosition.latitude,
                this.currentPosition.longitude
            );


        const difference =
            Math.abs(

                this.targetProgressMeters -
                this.userProgressMeters
            );


        const bucket =
            Math.floor(
                difference / 50
            );


        // 50m 미만이면 일반 네비

        if (
            bucket <= 0
        ) {

            return;
        }


        // 이전보다 차이가 더 벌어졌을 때만

        if (
            bucket <=
            this.lastDifferenceBucket
        ) {

            return;
        }


        this.lastDifferenceBucket =
            bucket;


        this.showBothPositionsTemporary(

            currentLocation,

            targetLocation
        );
    }


    // ============================================================
    // 현재 위치 + 목표 위치 5초 보기
    // ============================================================

    showBothPositionsTemporary(
        currentLocation,
        targetLocation
    ) {


        if (
            this.differenceViewTimer
        ) {

            clearTimeout(
                this.differenceViewTimer
            );
        }


        this.differenceViewActive =
            true;


        const bounds =
            new kakao.maps.LatLngBounds();


        bounds.extend(
            currentLocation
        );


        bounds.extend(
            targetLocation
        );


        this.programmaticMapMove =
            true;


        this.map.setBounds(
            bounds
        );


        this.showMapScaleTemporary();


        setTimeout(
            () => {

                this.programmaticMapMove =
                    false;
            },

            400
        );


        this.differenceViewTimer =
            setTimeout(

                () => {


                    this.differenceViewActive =
                        false;


                    // 사용자가 직접 지도 조작했다면
                    // 강제로 줌을 되돌리지 않음

                    if (
                        this.userZoomInteracted
                    ) {

                        return;
                    }


                    if (
                        !this.currentPosition
                    ) {

                        return;
                    }


                    const current =
                        new kakao.maps.LatLng(
                            this.currentPosition.latitude,
                            this.currentPosition.longitude
                        );


                    this.programmaticMapMove =
                        true;


                    this.map.setLevel(
                        1
                    );


                    this.map.panTo(
                        current
                    );


                    setTimeout(
                        () => {

                            this.programmaticMapMove =
                                false;
                        },

                        400
                    );


                    this.showMapScaleTemporary();

                },

                5000
            );
    }


    // ============================================================
    // 경로 누적 거리 계산
    // ============================================================

    buildRouteDistanceTable() {


        this.routeCumulativeDistances =
            [];


        let total =
            0;


        this.routeCumulativeDistances.push(
            0
        );


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


            total +=
                this.calculateDistanceMeters(

                    previous.getLat(),

                    previous.getLng(),

                    current.getLat(),

                    current.getLng()
                );


            this.routeCumulativeDistances.push(
                total
            );
        }
    }


    // ============================================================
    // 전체 경로 거리
    // ============================================================

    getTotalRouteDistance() {


        if (
            this.routeCumulativeDistances.length === 0
        ) {

            return 0;
        }


        return this.routeCumulativeDistances[
            this.routeCumulativeDistances.length - 1
        ];
    }


    // ============================================================
    // 특정 거리의 경로 좌표
    // ============================================================

    getRoutePositionAtDistance(
        distance
    ) {


        if (
            this.navigationPathCoords.length < 2
        ) {

            return null;
        }


        const total =
            this.getTotalRouteDistance();


        const target =
            Math.max(
                0,
                Math.min(
                    distance,
                    total
                )
            );


        for (

            let i = 1;

            i <
            this.routeCumulativeDistances.length;

            i++

        ) {


            const previousDistance =
                this.routeCumulativeDistances[
                    i - 1
                ];


            const currentDistance =
                this.routeCumulativeDistances[
                    i
                ];


            if (
                target <= currentDistance
            ) {

                const segmentDistance =
                    currentDistance -
                    previousDistance;


                const ratio =
                    segmentDistance > 0

                        ? (
                            target -
                            previousDistance
                        ) / segmentDistance

                        : 0;


                const previous =
                    this.navigationPathCoords[
                        i - 1
                    ];


                const current =
                    this.navigationPathCoords[
                        i
                    ];


                const lat =
                    previous.getLat() +

                    (
                        current.getLat() -
                        previous.getLat()
                    ) * ratio;


                const lng =
                    previous.getLng() +

                    (
                        current.getLng() -
                        previous.getLng()
                    ) * ratio;


                return new kakao.maps.LatLng(
                    lat,
                    lng
                );
            }
        }


        return this.navigationPathCoords[
            this.navigationPathCoords.length - 1
        ];
    }


    // ============================================================
    // 현재 GPS가 경로상 어디까지 왔는지 계산
    // ============================================================

    getNearestRouteProgress(
        location
    ) {


        if (
            this.navigationPathCoords.length === 0
        ) {

            return 0;
        }


        let nearestIndex =
            0;


        let nearestDistance =
            Infinity;


        this.navigationPathCoords.forEach(

            (point, index) => {


                const distance =
                    this.calculateDistanceMeters(

                        location.getLat(),

                        location.getLng(),

                        point.getLat(),

                        point.getLng()
                    );


                if (
                    distance < nearestDistance
                ) {

                    nearestDistance =
                        distance;


                    nearestIndex =
                        index;
                }
            }
        );


        return (
            this.routeCumulativeDistances[
                nearestIndex
            ] || 0
        );
    }


    // ============================================================
    // 두 좌표 거리
    // ============================================================

    calculateDistanceMeters(
        lat1,
        lng1,
        lat2,
        lng2
    ) {


        const earthRadius =
            6371000;


        const toRadians =
            degree =>
                degree *
                Math.PI /
                180;


        const dLat =
            toRadians(
                lat2 - lat1
            );


        const dLng =
            toRadians(
                lng2 - lng1
            );


        const a =

            Math.sin(
                dLat / 2
            ) ** 2 +

            Math.cos(
                toRadians(
                    lat1
                )
            ) *

            Math.cos(
                toRadians(
                    lat2
                )
            ) *

            Math.sin(
                dLng / 2
            ) ** 2;


        const c =
            2 *
            Math.atan2(

                Math.sqrt(a),

                Math.sqrt(
                    1 - a
                )
            );


        return earthRadius * c;
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


        this.currentPosition =
            {
                latitude:
                    position.latitude,

                longitude:
                    position.longitude
            };


        this.currentAccuracy =
            position.accuracy;


        if (
            !this.currentMarker
        ) {

            this.currentMarker =
                new kakao.maps.Marker(
                    {
                        position:
                            location,

                        map:
                            this.map,

                        title:
                            '현재 위치'
                    }
                );

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


        const originElement =
            document.getElementById(
                'origin-address'
            );


        if (
            originElement &&
            !this.customOrigin
        ) {

            originElement.textContent =
                '현재 위치';
        }
    }


    // ============================================================
    // 실제 운동 기록 경로
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
            new kakao.maps.Polyline(
                {
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
                }
            );
    }


    // ============================================================
    // 중복 좌표 제거
    // ============================================================

    removeDuplicateCoords(
        points
    ) {


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
    // 지도 축척 표시
    //
    // 줌 변경시에만 잠깐 표시
    // ============================================================

    showMapScaleTemporary() {


        if (
            !this.mapScaleElement ||
            !this.map
        ) {

            return;
        }


        const level =
            this.map.getLevel();


        let distance;


        if (level <= 1) {

            distance = 50;

        } else if (level === 2) {

            distance = 100;

        } else if (level === 3) {

            distance = 200;

        } else if (level === 4) {

            distance = 500;

        } else if (level === 5) {

            distance = 1000;

        } else {

            distance = 2000;
        }


        this.mapScaleElement.textContent =

            distance >= 1000

                ? `${distance / 1000}km`

                : `${distance}m`;


        this.mapScaleElement.style.display =
            'block';


        if (
            this.mapScaleTimer
        ) {

            clearTimeout(
                this.mapScaleTimer
            );
        }


        this.mapScaleTimer =
            setTimeout(

                () => {

                    if (
                        this.mapScaleElement
                    ) {

                        this.mapScaleElement.style.display =
                            'none';
                    }

                },

                2500
            );
    }


    // ============================================================
    // 네비게이션 경로 삭제
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


        this.routeCumulativeDistances =
            [];


        this.navigationDistance =
            0;


        this.navigationTime =
            0;


        this.selectedRoute =
            null;


        this.selectedRouteIndex =
            -1;
    }


    // ============================================================
    // 경로 전체 삭제
    // ============================================================

    clearRouteCompletely() {


        this.clearNavigationRoute();


        this.routeList =
            [];


        if (
            this.routeSelector
        ) {

            this.routeSelector.classList.remove(
                'active'
            );
        }


        if (
            this.targetSpeedModal
        ) {

            this.targetSpeedModal.classList.remove(
                'active'
            );
        }


        if (
            this.navigationStartButton
        ) {

            this.navigationStartButton.classList.remove(
                'active'
            );
        }


        this.stopNavigation();
    }


    // ============================================================
    // 네비게이션 종료
    // ============================================================

    stopNavigation() {


        this.isNavigating =
            false;


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
            this.targetStartTimer
        ) {

            clearTimeout(
                this.targetStartTimer
            );


            this.targetStartTimer =
                null;
        }


        if (
            this.targetAnimationFrame
        ) {

            cancelAnimationFrame(
                this.targetAnimationFrame
            );


            this.targetAnimationFrame =
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


        this.targetProgressMeters =
            0;
    }


    // ============================================================
    // 목적지 마커만 제거
    // ============================================================

    clearDestinationMarkerOnly() {


        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );


            this.destinationMarker =
                null;
        }
    }


    // ============================================================
    // 목적지 삭제
    // ============================================================

    clearDestination() {


        this.clearDestinationMarkerOnly();


        this.destinationLocation =
            null;


        this.destinationAddress =
            '';


        this.customOrigin =
            null;


        this.originAddress =
            '현재 위치';


        this.pendingLocation =
            null;


        this.pendingAddress =
            '';


        this.isSelectingDestination =
            false;


        this.selectionMode =
            null;


        if (
            this.destinationButton
        ) {

            this.destinationButton.classList.remove(
                'active'
            );
        }


        if (
            this.locationPanel
        ) {

            this.locationPanel.classList.remove(
                'active'
            );
        }


        this.hideDestinationChoiceCard();


        this.updateLocationPanelText();


        log(
            '🗑️ 목적지 삭제'
        );
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
// 출발지 선택 후 두 번째 클릭 처리 보완
// ============================================================

const originalSetPendingLocation =
    MapManager.prototype.setPendingLocation;


MapManager.prototype.setPendingLocation =
    function (location) {


        if (
            this.selectionMode ===
            'destination-after-origin'
        ) {

            this.confirmSecondPointAsDestination(
                location
            );

            return;
        }


        originalSetPendingLocation.call(
            this,
            location
        );
    };


// ============================================================
// 전역 객체
// ============================================================

const mapManager =
    new MapManager();
