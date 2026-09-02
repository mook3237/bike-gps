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


        // ====================================================
        // 상태
        // ====================================================

        this.isLoadingRoute = false;

        this.isNavigating = false;


        // ====================================================
        // 🛣️ 경로
        // ====================================================

        this.routeList = [];

        this.selectedRouteIndex = -1;


        // ====================================================
        // UI
        // ====================================================

        this.locationButton = null;

        this.destinationButton = null;

        this.routeButton = null;

        this.destinationSheet = null;

        this.routeSelector = null;


        log(
            'MapManager 생성됨'
        );
    }


    // ============================================================
    // 🗺️ 지도 초기화
    // ============================================================

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


            // ====================================================
            // 버튼 생성
            // ====================================================

            this.createCurrentLocationButton();

            this.createDestinationButton();

            this.createRouteButton();


            // ====================================================
            // 카드 UI 생성
            // ====================================================

            this.createDestinationSheet();

            this.createRouteSelector();


            // ====================================================
            // 지도 클릭 이벤트
            // ====================================================

            this.setupMapClickForDestination();


            // ====================================================
            // 현재 위치 자동 요청
            // ====================================================

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
            'current-location-button';

        button.innerHTML =
            '📍';


        Object.assign(

            button.style,

            {

                position: 'absolute',

                right: '14px',

                bottom: '14px',

                width: '50px',

                height: '50px',

                border: 'none',

                borderRadius: '50%',

                background: '#ffffff',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.25)',

                zIndex: '2000',

                fontSize: '23px',

                cursor: 'pointer'
            }
        );


        button.addEventListener(

            'click',

            () => {

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


                this.map.setCenter(
                    location
                );


                this.map.setLevel(
                    2
                );


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


        button.type =
            'button';


        button.innerHTML =
            '🎯';


        Object.assign(

            button.style,

            {

                position: 'absolute',

                right: '14px',

                bottom: '72px',

                width: '50px',

                height: '50px',

                border: 'none',

                borderRadius: '50%',

                background: '#ffffff',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.25)',

                zIndex: '2000',

                fontSize: '22px',

                cursor: 'pointer'
            }
        );


        button.addEventListener(

            'click',

            () => {

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


    // ============================================================
    // 🎯 목적지 선택 시작
    // ============================================================

    startDestinationSelection() {

        if (!this.map) {

            return;
        }


        // 기존 목적지가 있으면 제거

        this.clearDestination();


        // 경로도 제거

        this.clearRouteCompletely();


        this.isSelectingDestination =
            true;


        this.destinationButton.innerHTML =
            '✚';


        this.destinationButton.style.background =
            '#e8f3ff';


        log(
            '🎯 목적지 선택 모드 시작'
        );
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


    // ============================================================
    // 🎯 목적지 설정
    // ============================================================

    setDestination(location) {

        if (!this.map) {

            return;
        }


        this.destinationLocation =
            location;


        // 기존 핀 삭제

        if (
            this.destinationMarker
        ) {

            this.destinationMarker.setMap(
                null
            );
        }


        // 새 목적지 핀

        this.destinationMarker =
            new kakao.maps.Marker({

                position: location,

                map: this.map,

                title: '목적지'

            });


        this.isSelectingDestination =
            false;


        // 버튼 원상복구

        if (
            this.destinationButton
        ) {

            this.destinationButton.innerHTML =
                '🎯';

            this.destinationButton.style.background =
                '#ffffff';
        }


        // 주소 가져오기

        this.reverseGeocodeDestination(
            location
        );


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


        sheet.style.position =
            'absolute';

        sheet.style.left =
            '12px';

        sheet.style.right =
            '12px';

        sheet.style.bottom =
            '12px';

        sheet.style.zIndex =
            '3000';

        sheet.style.display =
            'none';

        sheet.style.background =
            '#ffffff';

        sheet.style.borderRadius =
            '20px';

        sheet.style.boxShadow =
            '0 6px 20px rgba(0,0,0,0.25)';

        sheet.style.padding =
            '16px';


        mapContainer.appendChild(
            sheet
        );


        this.destinationSheet =
            sheet;


        log(
            '✅ 목적지 선택창 생성 완료'
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


        this.destinationSheet.innerHTML =
            `

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:flex-start;
                    gap:12px;
                    margin-bottom:16px;
                "
            >

                <div>

                    <div
                        style="
                            font-size:12px;
                            color:#888;
                            margin-bottom:5px;
                        "
                    >
                        선택한 목적지
                    </div>

                    <div
                        style="
                            font-size:16px;
                            font-weight:700;
                            line-height:1.4;
                        "
                    >
                        📍 ${this.destinationAddress}
                    </div>

                </div>


                <button
                    id="destination-close-button"
                    type="button"
                    style="
                        border:none;
                        background:transparent;
                        font-size:24px;
                        cursor:pointer;
                        padding:0;
                    "
                >
                    ×
                </button>

            </div>


            <div
                style="
                    display:flex;
                    gap:10px;
                "
            >

                <button
                    id="destination-start-button"
                    type="button"
                    style="
                        flex:1;
                        border:none;
                        border-radius:14px;
                        padding:14px;
                        background:#f0f0f0;
                        font-size:15px;
                        font-weight:700;
                        cursor:pointer;
                    "
                >
                    출발
                </button>


                <button
                    id="destination-arrival-button"
                    type="button"
                    style="
                        flex:1;
                        border:none;
                        border-radius:14px;
                        padding:14px;
                        background:#1677ff;
                        color:#ffffff;
                        font-size:15px;
                        font-weight:700;
                        cursor:pointer;
                    "
                >
                    도착
                </button>

            </div>

            `;


        this.destinationSheet.style.display =
            'block';


        // ========================================================
        // X → 목적지 선택 취소
        // ========================================================

        document
            .getElementById(
                'destination-close-button'
            )
            .addEventListener(

                'click',

                () => {

                    this.clearDestination();

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
                        '출발 위치 선택 기능은 다음 단계에서 연결할 예정입니다.'
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

                () => {

                    this.destinationSheet.style.display =
                        'none';


                    this.requestBicycleRoute();

                }
            );
    }


    // ============================================================
    // ❌ 목적지 완전 삭제
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

            this.destinationButton.style.background =
                '#ffffff';
        }


        log(
            '🗑️ 목적지 삭제'
        );
    }


    // ============================================================
    // 🚴 경로 버튼
    // ============================================================

    createRouteButton() {

        if (
            this.routeButton
        ) {
            return;
        }


        const mapContainer =
            document.getElementById('map');


        const button =
            document.createElement('button');


        button.type =
            'button';


        button.innerHTML =
            '🚴';


        Object.assign(

            button.style,

            {

                position: 'absolute',

                right: '14px',

                bottom: '130px',

                width: '50px',

                height: '50px',

                border: 'none',

                borderRadius: '50%',

                background: '#ffffff',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.25)',

                zIndex: '2000',

                fontSize: '22px',

                cursor: 'pointer'
            }
        );


        button.addEventListener(

            'click',

            () => {

                if (
                    !this.destinationLocation
                ) {

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


        if (
            this.routeButton
        ) {

            this.routeButton.innerHTML =
                '⏳';
        }


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


            // ====================================================
            // API 응답 구조 처리
            // ====================================================

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


            // ====================================================
            // 첫 번째 경로를 기본 표시
            // ====================================================

            this.selectRoute(
                0
            );


            // ====================================================
            // 경로 선택 카드
            // ====================================================

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


            if (
                this.routeButton
            ) {

                this.routeButton.innerHTML =
                    '🚴';
            }
        }
    }


    // ============================================================
    // 🛣️ API 응답에서 경로 추출
    // ============================================================

    extractRoutes(data) {

        const result = [];


        // 기존 네 서버 구조

        if (
            data?.routes &&
            typeof data.routes === 'object'
        ) {

            Object.entries(
                data.routes
            ).forEach(

                ([key, route]) => {

                    if (
                        route
                    ) {

                        result.push({

                            ...route,

                            _routeKey: key
                        });
                    }
                }
            );
        }


        // 카카오 기본 route 구조

        if (
            result.length === 0 &&
            data?.route
        ) {

            result.push({

                ...data.route,

                _routeKey: 'default'
            });
        }


        // routes 배열 구조

        if (
            result.length === 0 &&
            Array.isArray(
                data?.routes
            )
        ) {

            data.routes.forEach(

                (route, index) => {

                    result.push({

                        ...route,

                        _routeKey:
                            `route-${index}`
                    });
                }
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
    // 🛣️ 경로 선택
    // ============================================================

    selectRoute(index) {

        if (
            !this.routeList[index]
        ) {
            return;
        }


        this.selectedRouteIndex =
            index;


        const route =
            this.routeList[index];


        this.selectedRoute =
            route;


        this.drawNavigationRoute(
            route
        );


        this.showRouteSelector(
            this.routeList
        );


        log(
            '🛣️ 경로 선택',
            {

                index,

                distance:
                    this.getRouteDistance(route),

                time:
                    this.getRouteTime(route)
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

            0

        );
    }


    // ============================================================
    // 📏 거리 표시
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
    // ⏱️ 시간 표시
    // ============================================================

    formatDuration(seconds) {

        const value =
            Number(seconds) || 0;


        if (
            value < 60
        ) {

            return `${Math.round(value)}초`;
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
    // 🛣️ 경로 카드 생성
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


        Object.assign(

            selector.style,

            {

                position: 'absolute',

                left: '12px',

                right: '12px',

                bottom: '12px',

                zIndex: '3500',

                display: 'none',

                background: '#ffffff',

                borderRadius: '20px',

                boxShadow:
                    '0 6px 20px rgba(0,0,0,0.28)',

                padding: '14px',

                maxHeight: '42%',

                overflowY: 'auto'
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


    // ============================================================
    // 🛣️ 경로 카드 표시
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
        // 제목
        // ========================================================

        const header =
            document.createElement('div');


        Object.assign(

            header.style,

            {

                display: 'flex',

                justifyContent:
                    'space-between',

                alignItems:
                    'center',

                marginBottom:
                    '12px'
            }
        );


        const title =
            document.createElement('div');


        title.innerHTML =
            '🚴 자전거 경로';


        title.style.fontWeight =
            '800';

        title.style.fontSize =
            '17px';


        const closeButton =
            document.createElement('button');


        closeButton.type =
            'button';

        closeButton.innerHTML =
            '×';


        Object.assign(

            closeButton.style,

            {

                border: 'none',

                background:
                    'transparent',

                fontSize:
                    '26px',

                cursor:
                    'pointer',

                lineHeight:
                    '1'
            }
        );


        closeButton.addEventListener(

            'click',

            () => {

                // 카드 제거

                this.routeSelector.style.display =
                    'none';


                // 선택된 경로 제거

                this.clearNavigationRoute();


                this.selectedRoute =
                    null;

                this.selectedRouteIndex =
                    -1;


                log(
                    '❌ 경로 선택 취소'
                );
            }
        );


        header.appendChild(
            title
        );

        header.appendChild(
            closeButton
        );


        this.routeSelector.appendChild(
            header
        );


        // ========================================================
        // 경로 목록
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


                const item =
                    document.createElement(
                        'button'
                    );


                item.type =
                    'button';


                const isSelected =
                    index ===
                    this.selectedRouteIndex;


                Object.assign(

                    item.style,

                    {

                        width: '100%',

                        border:

                            isSelected

                                ? '2px solid #1677ff'

                                : '1px solid #e0e0e0',

                        background:

                            isSelected

                                ? '#f0f7ff'

                                : '#ffffff',

                        borderRadius:
                            '15px',

                        padding:
                            '14px',

                        marginBottom:
                            index === routes.length - 1

                                ? '0'

                                : '9px',

                        textAlign:
                            'left',

                        cursor:
                            'pointer'
                    }
                );


                // 경로 이름

                const routeName =
                    index === 0

                        ? '추천 경로'

                        : `경로 ${index + 1}`;


                item.innerHTML =
                    `

                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            gap:10px;
                        "
                    >

                        <div>

                            <div
                                style="
                                    font-size:16px;
                                    font-weight:800;
                                    margin-bottom:6px;
                                "
                            >
                                ${routeName}
                            </div>


                            <div
                                style="
                                    font-size:14px;
                                    color:#666;
                                "
                            >

                                📏 ${this.formatDistance(distance)}

                                &nbsp; · &nbsp;

                                ⏱️ ${this.formatDuration(duration)}

                            </div>

                        </div>


                        <div
                            style="
                                font-size:20px;
                            "
                        >

                            ${isSelected ? '✓' : '›'}

                        </div>

                    </div>

                    `;


                item.addEventListener(

                    'click',

                    () => {

                        this.selectRoute(
                            index
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
    }


    // ============================================================
    // 🚴 경로 그리기
    // ============================================================

    drawNavigationRoute(route) {

        if (
            !this.map
        ) {
            return;
        }


        this.clearNavigationRoute();


        const navigationPoints =
            [];


        // ========================================================
        // 기존 legs → steps 구조
        // ========================================================

        if (
            Array.isArray(route.legs)
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
                                        !Array.isArray(point)
                                    ) {
                                        return;
                                    }


                                    const lng =
                                        Number(point[0]);

                                    const lat =
                                        Number(point[1]);


                                    if (
                                        Number.isFinite(lng) &&
                                        Number.isFinite(lat)
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
        // sections → roads → vertexes 구조
        // ========================================================

        if (
            navigationPoints.length === 0 &&
            Array.isArray(route.sections)
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
                                    Number.isFinite(lng) &&
                                    Number.isFinite(lat)
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


        // ========================================================
        // 지도 전체 경로가 카드에 가리지 않도록 조정
        // ========================================================

        this.fitNavigationRouteWithCard();


        log(

            '✅ 경로 지도 표시 완료',

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


    // ============================================================
    // 🗺️ 경로를 카드 위쪽까지 보이도록 지도 조정
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


        // 먼저 전체 경로를 지도에 맞춤

        this.map.setBounds(
            bounds
        );


        // ========================================================
        // 카드가 아래쪽을 가리기 때문에
        // 중심을 살짝 위로 이동
        // ========================================================

        setTimeout(

            () => {

                const center =
                    this.map.getCenter();


                const projection =
                    this.map.getProjection();


                if (
                    !projection
                ) {
                    return;
                }


                const point =
                    projection.pointFromCoords(
                        center
                    );


                // 화면 중심을 위쪽으로 이동

                const shiftedPoint =
                    new kakao.maps.Point(

                        point.x,

                        point.y + 120

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

        const result =
            [];


        points.forEach(

            point => {

                const last =
                    result[
                        result.length - 1
                    ];


                if (
                    !last
                ) {

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
    // ❌ 경로 완전 삭제
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
        }
    }


    // ============================================================
    // 📍 현재 위치 마커
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


        if (
            !this.currentMarker
        ) {

            this.currentMarker =
                new kakao.maps.Marker({

                    position: location,

                    map: this.map,

                    title: '현재 위치'
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
