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


// ========================================
// 🗺️ MapManager
// ========================================

class MapManager {

    constructor() {

        // ========================================
        // 🗺️ 지도
        // ========================================

        this.map = null;


        // ========================================
        // 📍 현재 위치
        // ========================================

        this.currentMarker = null;


        // ========================================
        // 🚩 직접 설정한 출발지
        // ========================================

        this.startMarker = null;
        this.startLocation = null;


        // ========================================
        // 🎯 목적지
        // ========================================

        this.destinationMarker = null;
        this.destinationLocation = null;


        // ========================================
        // 📌 임시 선택 위치
        // ========================================

        this.pendingLocation = null;
        this.pendingAddress = '';

        this.pendingMarker = null;


        // ========================================
        // 🎯 목적지 선택 모드
        // ========================================

        this.isSelectingLocation = false;


        // ========================================
        // 📱 위치 선택창
        // ========================================

        this.destinationSheet = null;


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
        // 🛣️ 경로 선택
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

                throw new Error(
                    '지도 컨테이너를 찾을 수 없습니다.'
                );
            }


            if (

                window.getComputedStyle(
                    mapContainer
                ).position === 'static'

            ) {

                mapContainer.style.position =
                    'relative';
            }


            // ========================================
            // 지도 생성
            // ========================================

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
            // UI 생성
            // ========================================

            this.createCurrentLocationButton();

            this.createDestinationButton();

            this.createRouteButton();

            this.createRouteSelector();

            this.createDestinationSheet();


            // ========================================
            // 지도 클릭 이벤트
            // ========================================

            this.setupMapClickForDestination();


            // ========================================
            // 현재 위치 요청
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
    // 📍 초기 현재 위치
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


        const button =
            document.createElement('button');


        button.type =
            'button';


        button.className =
            'current-location-button';


        button.innerHTML =
            '📍';


        button.setAttribute(

            'aria-label',

            '현재 위치'
        );


        Object.assign(

            button.style,

            {

                position:
                    'absolute',

                right:
                    '14px',

                bottom:
                    '14px',

                width:
                    '50px',

                height:
                    '50px',

                border:
                    'none',

                borderRadius:
                    '50%',

                background:
                    '#ffffff',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.25)',

                fontSize:
                    '23px',

                cursor:
                    'pointer',

                zIndex:
                    '1000',

                touchAction:
                    'manipulation'
            }
        );


        button.addEventListener(

            'click',

            (event) => {

                event.preventDefault();

                event.stopPropagation();

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
    // 📍 현재 위치 이동
    // ========================================

    goToCurrentLocation() {

        if (!this.map) {

            return;
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

                const location =

                    new kakao.maps.LatLng(

                        latest.latitude,

                        latest.longitude

                    );


                this.map.setCenter(
                    location
                );


                this.map.setLevel(
                    2
                );


                return;
            }
        }


        if (

            !navigator.geolocation

        ) {

            alert(
                '위치 정보를 지원하지 않는 브라우저입니다.'
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
                            position.coords.longitude

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
                    '현재 위치를 확인할 수 없습니다.'
                );
            },


            {

                enableHighAccuracy:
                    true,

                timeout:
                    5000
            }
        );
    }


    // ========================================
    // 🎯 목적지 선택 버튼
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


        const button =
            document.createElement('button');


        button.type =
            'button';


        button.className =
            'destination-button';


        button.innerHTML =
            '🎯';


        button.setAttribute(

            'aria-label',

            '위치 설정'
        );


        Object.assign(

            button.style,

            {

                position:
                    'absolute',

                right:
                    '14px',

                bottom:
                    '72px',

                width:
                    '50px',

                height:
                    '50px',

                border:
                    'none',

                borderRadius:
                    '50%',

                background:
                    '#ffffff',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.25)',

                fontSize:
                    '22px',

                cursor:
                    'pointer',

                zIndex:
                    '1000',

                touchAction:
                    'manipulation',

                transition:
                    '0.2s ease'
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


        this.isSelectingLocation =
            !this.isSelectingLocation;


        this.updateDestinationButtonState();


        // ========================================
        // 기존 선택창 닫기
        // ========================================

        if (

            !this.isSelectingLocation

        ) {

            this.hideDestinationSheet();


            if (

                this.pendingMarker

            ) {

                this.pendingMarker.setMap(
                    null
                );

                this.pendingMarker =
                    null;
            }


            return;
        }


        log(
            '🎯 위치 선택 모드 시작'
        );


        // 중요
        // alert를 사용하지 않음
        // 버튼을 누른 뒤 바로 지도에서 위치 선택
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

            this.isSelectingLocation

        ) {

            this.destinationButton.innerHTML =
                '📌';


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
    // 🗺️ 지도 클릭
    // ========================================

    setupMapClickForDestination() {

        kakao.maps.event.addListener(

            this.map,

            'click',

            (mouseEvent) => {

                if (

                    !this.isSelectingLocation

                ) {

                    return;
                }


                const location =
                    mouseEvent.latLng;


                this.setPendingLocation(
                    location
                );
            }
        );


        log(
            '✅ 지도 위치 선택 이벤트 설정 완료'
        );
    }


    // ========================================
    // 📌 임시 위치 설정
    // ========================================

    setPendingLocation(location) {

        this.pendingLocation =
            location;


        // ========================================
        // 기존 임시 핀 제거
        // ========================================

        if (

            this.pendingMarker

        ) {

            this.pendingMarker.setMap(
                null
            );
        }


        // ========================================
        // 드래그 가능한 핀 생성
        // ========================================

        this.pendingMarker =

            new kakao.maps.Marker({

                position:
                    location,

                map:
                    this.map,

                draggable:
                    true,

                title:
                    '선택한 위치'
            });


        // ========================================
        // 핀 드래그 종료
        // ========================================

        kakao.maps.event.addListener(

            this.pendingMarker,

            'dragend',

            () => {

                this.pendingLocation =

                    this.pendingMarker.getPosition();


                this.getAddressFromLocation(

                    this.pendingLocation

                );
            }
        );


        // ========================================
        // 주소 가져오기
        // ========================================

        this.getAddressFromLocation(
            location
        );
    }


    // ========================================
    // 🏠 좌표 → 주소
    // ========================================

    getAddressFromLocation(location) {

        const latitude =
            location.getLat();


        const longitude =
            location.getLng();


        // ========================================
        // 카카오 주소 서비스 사용 가능
        // ========================================

        if (

            kakao.maps.services

        ) {

            try {

                const geocoder =
                    new kakao.maps.services.Geocoder();


                geocoder.coord2Address(

                    longitude,

                    latitude,

                    (result, status) => {

                        if (

                            status ===

                            kakao.maps.services.Status.OK &&

                            result.length > 0

                        ) {

                            const address =

                                result[0]

                                    .road_address

                                    ?.address_name ||

                                result[0]

                                    .address

                                    ?.address_name ||

                                '선택한 위치';


                            this.pendingAddress =
                                address;


                        } else {

                            this.pendingAddress =
                                `위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`;
                        }


                        this.showDestinationSheet();
                    }

                );


                return;

            } catch (error) {

                log(
                    '주소 변환 오류',
                    error
                );
            }
        }


        // ========================================
        // 주소 서비스 없는 경우
        // ========================================

        this.pendingAddress =

            `위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`;


        this.showDestinationSheet();
    }


    // ========================================
    // 📱 위치 선택창 생성
    // ========================================

    createDestinationSheet() {

        if (

            this.destinationSheet

        ) {

            return;
        }


        const mapContainer =
            document.getElementById('map');


        if (!mapContainer) {

            return;
        }


        const sheet =
            document.createElement('div');


        sheet.className =
            'destination-sheet';


        Object.assign(

            sheet.style,

            {

                position:
                    'absolute',

                left:
                    '12px',

                right:
                    '12px',

                bottom:
                    '14px',

                display:
                    'none',

                background:
                    '#ffffff',

                borderRadius:
                    '20px',

                boxShadow:
                    '0 8px 30px rgba(0,0,0,0.25)',

                zIndex:
                    '2000',

                overflow:
                    'hidden',

                padding:
                    '18px',

                transition:
                    '0.2s ease'
            }
        );


        mapContainer.appendChild(
            sheet
        );


        this.destinationSheet =
            sheet;


        log(
            '✅ 위치 선택창 생성 완료'
        );
    }


    // ========================================
    // 📱 위치 선택창 표시
    // ========================================

    showDestinationSheet() {

        if (

            !this.destinationSheet ||

            !this.pendingLocation

        ) {

            return;
        }


        const sheet =
            this.destinationSheet;


        sheet.innerHTML =
            '';


        // ========================================
        // 주소
        // ========================================

        const address =
            document.createElement('div');


        address.textContent =
            this.pendingAddress;


        Object.assign(

            address.style,

            {

                fontSize:
                    '15px',

                fontWeight:
                    '700',

                lineHeight:
                    '1.5',

                marginBottom:
                    '14px',

                paddingRight:
                    '40px'
            }
        );


        // ========================================
        // 닫기 버튼
        // ========================================

        const closeButton =
            document.createElement('button');


        closeButton.textContent =
            '✕';


        Object.assign(

            closeButton.style,

            {

                position:
                    'absolute',

                right:
                    '16px',

                top:
                    '14px',

                border:
                    'none',

                background:
                    'transparent',

                fontSize:
                    '20px',

                cursor:
                    'pointer'
            }
        );


        closeButton.addEventListener(

            'click',

            () => {

                this.cancelPendingLocation();
            }
        );


        // ========================================
        // 버튼 영역
        // ========================================

        const buttonArea =
            document.createElement('div');


        Object.assign(

            buttonArea.style,

            {

                display:
                    'flex',

                gap:
                    '10px'
            }
        );


        // ========================================
        // 출발 버튼
        // ========================================

        const startButton =
            document.createElement('button');


        startButton.textContent =
            '출발';


        Object.assign(

            startButton.style,

            {

                flex:
                    '1',

                height:
                    '48px',

                border:
                    'none',

                borderRadius:
                    '14px',

                background:
                    '#f0f0f0',

                fontWeight:
                    '700',

                fontSize:
                    '16px',

                cursor:
                    'pointer'
            }
        );


        startButton.addEventListener(

            'click',

            () => {

                this.confirmStartLocation();
            }
        );


        // ========================================
        // 도착 버튼
        // ========================================

        const destinationButton =
            document.createElement('button');


        destinationButton.textContent =
            '도착';


        Object.assign(

            destinationButton.style,

            {

                flex:
                    '1',

                height:
                    '48px',

                border:
                    'none',

                borderRadius:
                    '14px',

                background:
                    '#1677ff',

                color:
                    '#ffffff',

                fontWeight:
                    '700',

                fontSize:
                    '16px',

                cursor:
                    'pointer'
            }
        );


        destinationButton.addEventListener(

            'click',

            () => {

                this.confirmDestination();
            }
        );


        buttonArea.appendChild(
            startButton
        );


        buttonArea.appendChild(
            destinationButton
        );


        sheet.appendChild(
            closeButton
        );


        sheet.appendChild(
            address
        );


        sheet.appendChild(
            buttonArea
        );


        sheet.style.display =
            'block';
    }


    // ========================================
    // 📱 위치 선택창 닫기
    // ========================================

    hideDestinationSheet() {

        if (

            this.destinationSheet

        ) {

            this.destinationSheet.style.display =
                'none';
        }
    }


    // ========================================
    // ❌ 임시 위치 취소
    // ========================================

    cancelPendingLocation() {

        if (

            this.pendingMarker

        ) {

            this.pendingMarker.setMap(
                null
            );
        }


        this.pendingMarker =
            null;


        this.pendingLocation =
            null;


        this.pendingAddress =
            '';


        this.isSelectingLocation =
            false;


        this.updateDestinationButtonState();


        this.hideDestinationSheet();
    }


    // ========================================
    // 🚩 출발 위치 확정
    // ========================================

    confirmStartLocation() {

        if (

            !this.pendingLocation

        ) {

            return;
        }


        this.startLocation =
            this.pendingLocation;


        if (

            this.startMarker

        ) {

            this.startMarker.setMap(
                null
            );
        }


        this.startMarker =

            new kakao.maps.Marker({

                position:
                    this.startLocation,

                map:
                    this.map,

                title:
                    '출발지'
            });


        this.clearNavigationRoute();


        this.finishLocationSelection();


        log(

            '🚩 출발 위치 설정 완료',

            {

                latitude:
                    this.startLocation.getLat(),

                longitude:
                    this.startLocation.getLng(),

                address:
                    this.pendingAddress
            }
        );
    }


    // ========================================
    // 🎯 도착 위치 확정
    // ========================================

    confirmDestination() {

        if (

            !this.pendingLocation

        ) {

            return;
        }


        this.destinationLocation =
            this.pendingLocation;


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
                    this.destinationLocation,

                map:
                    this.map,

                title:
                    '도착지'
            });


        // ========================================
        // 기존 경로 삭제
        // ========================================

        this.clearNavigationRoute();


        // ========================================
        // 선택 종료
        // ========================================

        this.finishLocationSelection();


        // ========================================
        // 경로 버튼 활성화
        // ========================================

        this.updateRouteButtonState();


        log(

            '🎯 목적지 설정 완료',

            {

                latitude:
                    this.destinationLocation.getLat(),

                longitude:
                    this.destinationLocation.getLng(),

                address:
                    this.pendingAddress
            }
        );
    }


    // ========================================
    // 🎯 위치 선택 종료
    // ========================================

    finishLocationSelection() {

        if (

            this.pendingMarker

        ) {

            this.pendingMarker.setMap(
                null
            );
        }


        this.pendingMarker =
            null;


        this.isSelectingLocation =
            false;


        this.updateDestinationButtonState();


        this.hideDestinationSheet();


        this.pendingLocation =
            null;
    }


    // ========================================
    // 🛣️ 경로 선택창 생성
    // ========================================

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


        Object.assign(

            selector.style,

            {

                position:
                    'absolute',

                left:
                    '12px',

                right:
                    '12px',

                bottom:
                    '14px',

                zIndex:
                    '1500',

                display:
                    'none',

                background:
                    '#ffffff',

                borderRadius:
                    '18px',

                boxShadow:
                    '0 4px 20px rgba(0,0,0,0.25)',

                overflow:
                    'hidden',

                padding:
                    '10px'
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

                fontWeight:
                    '700',

                fontSize:
                    '16px',

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


                item.style.width =
                    '100%';


                item.style.border =

                    index ===
                    this.selectedRouteIndex

                        ? '2px solid #1677ff'

                        : '1px solid #dddddd';


                item.style.background =
                    '#ffffff';


                item.style.borderRadius =
                    '12px';


                item.style.padding =
                    '14px';


                item.style.marginBottom =

                    index === routes.length - 1

                        ? '0'

                        : '8px';


                item.style.textAlign =
                    'left';


                item.style.cursor =
                    'pointer';


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
                        color:#666;
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
                            route
                        );


                        this.showRouteSelector(
                            routes
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


    // ========================================
    // 🚴 경로 버튼
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


        const button =
            document.createElement('button');


        button.type =
            'button';


        button.className =
            'route-button';


        button.innerHTML =
            '🚴';


        button.disabled =
            true;


        Object.assign(

            button.style,

            {

                position:
                    'absolute',

                right:
                    '14px',

                bottom:
                    '130px',

                width:
                    '50px',

                height:
                    '50px',

                border:
                    'none',

                borderRadius:
                    '50%',

                background:
                    '#eeeeee',

                boxShadow:
                    '0 3px 10px rgba(0,0,0,0.20)',

                fontSize:
                    '22px',

                zIndex:
                    '1000',

                cursor:
                    'not-allowed',

                touchAction:
                    'manipulation'
            }
        );


        button.addEventListener(

            'click',

            (event) => {

                event.preventDefault();

                event.stopPropagation();


                if (

                    button.disabled

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


    // ========================================
    // 🚴 경로 버튼 상태
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


            this.routeButton.style.cursor =
                'pointer';

        } else {

            this.routeButton.disabled =
                true;


            this.routeButton.style.background =
                '#eeeeee';


            this.routeButton.style.cursor =
                'not-allowed';
        }
    }


    // ========================================
    // 🚴 출발 위치
    // ========================================

    getCurrentOrigin() {

        // ========================================
        // 직접 지정한 출발지 우선
        // ========================================

        if (

            this.startLocation

        ) {

            return {

                latitude:
                    this.startLocation.getLat(),

                longitude:
                    this.startLocation.getLng()
            };
        }


        // ========================================
        // GPS 최신 위치
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
        // 현재 위치 마커
        // ========================================

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

            return;
        }


        const origin =
            this.getCurrentOrigin();


        if (!origin) {

            alert(
                '출발 위치를 확인할 수 없습니다.'
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


        this.routeButton.innerHTML =
            '⏳';


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

                    '자전거 경로 요청 실패'

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


            const selectedRoute =

                data.routes.shortest ||

                data.routes.accessible ||

                data.routes.bikeOnly;


            if (

                !selectedRoute

            ) {

                throw new Error(
                    '사용 가능한 경로가 없습니다.'
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


            this.drawNavigationRoute(
                selectedRoute
            );


            this.showRouteSelector(
                availableRoutes
            );


        } catch (error) {

            log(

                '❌ 자전거 경로 요청 실패',

                error
            );


            alert(

                error.message ||

                '자전거 경로를 가져오지 못했습니다.'
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


            this.updateRouteButtonState();
        }
    }


    // ========================================
    // 🛣️ 경로 그리기
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


        log(
            '✅ 네비게이션 경로 표시 완료'
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
                    result[result.length - 1];


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
    // 🗑️ 네비게이션 경로 삭제
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


        const location =

            new kakao.maps.LatLng(

                position.latitude,

                position.longitude

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
    }


    // ========================================
    // 🔄 초기화
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


        this.updateRouteButtonState();


        log(
            '🔄 지도 초기화 완료'
        );
    }


    // ========================================
    // 📏 경로 전체 보기
    // ========================================

    fitBounds() {

        if (

            !this.map ||

            this.pathCoords.length === 0

        ) {

            return;
        }


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
    }
}


// ========================================
// 🌎 전역 객체
// ========================================

const mapManager =
    new MapManager();
