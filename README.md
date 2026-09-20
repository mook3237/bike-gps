RideMate Unified v2

구조
- Kakao Map 인스턴스 1개
- 지도/검색/결과/장소상세/경로선택/내비게이션을 하나의 SPA 상태로 처리
- 현재위치 마커는 실제 GPS 좌표에 연결
- 검색 정확명 우선 재정렬
- 3개 자전거 경로 카드 + 실제 경로 geometry extractor
- 안내 시작 -> 간소화 자전거 Navigation -> 종료 -> 저장 여부 UX
- 저장 기록은 현재 localStorage(ridemate_rides)에 저장. Supabase 연결 시 저장 adapter 교체 가능.

Vercel 환경변수
- KAKAO_MAP_API_KEY (또는 KAKAO_JS_KEY)
- KAKAO_REST_API_KEY

주의
- bicycle-route API는 기존 RideMate에서 실제 응답을 받았던 dapi.kakao.com/v2/routing/bicycle 계약을 유지했습니다.
- geometry extractor는 vertexes / coordinates / points / sections / roads / legs / steps 구조를 방어적으로 처리합니다.
