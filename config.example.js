const CONFIG = {
    MAP: {
        centerLat: 37.4979,
        centerLng: 127.0276,
        initialZoom: 15,
    },
    GPS: {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
    },
    KAKAO_MAP_API_KEY: 'YOUR_KAKAO_API_KEY_HERE', // ← 너의 키 넣기
};

console.log('✅ CONFIG 로드됨:', CONFIG);
