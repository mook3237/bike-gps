const CONFIG = {
    MAP: {
        centerLat: 37.4979,
        centerLng: 127.0276,
        initialZoom: 3, // 초기 줌 (숫자가 클수록 넓게 보임)
        // 속도별/상황별 자동 줌 설정 (카카오맵은 숫자가 작을수록 확대, 클수록 축소)
        ZOOM_LEVELS: {
            SLOW: 1,    // 30km/h 미만 시 상세하게 (확대)
            FAST: 2     // 30km/h 이상 시 넓게 (축소)
        }
    },
    GPS: {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
    },
    KAKAO_MAP_API_KEY: '여기에_실제_API_키_입력', // 🔑 키가 정확히 입력되어 있는지 확인
};

console.log('✅ CONFIG 로드됨:', CONFIG);
