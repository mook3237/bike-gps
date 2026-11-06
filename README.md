# RideMate Unified v2

카카오 지도 한 개를 공유하는 자전거 내비게이션, 레이싱, 주행 기록 앱입니다.

## 실행 구조

- `index.html`이 공통 모듈을 로드한 뒤 `app.js`에서 화면과 기능을 연결합니다.
- `ride-foundation.js`가 GPS 수신원, 최신성·순서·이동 판정, 거리·방위각·경로상 좌표와 주행 기록 계산을 제공합니다. 내비게이션과 레이싱의 안내·카메라·경기 규칙은 각 기능에 남아 있습니다.
- `racing-foundation.js`가 Ghost, 레이싱 진행과 경로 재탐색을 처리합니다.
- `profile-system.js`는 프로필별 설정, 장소, 최근 검색을 브라우저 `localStorage`에, 주행·레이싱 기록을 `IndexedDB`에 저장합니다. 이전 `ridemate_rides`와 `ridemate_recent_searches` 데이터는 최초 프로필 생성 시 가져오며, 기존 주행·레이싱 기록은 `IndexedDB`에 저장된 뒤 이전됩니다.

## 목적지 검색

검색 시작 시 보이는 지도 화면 범위로 카카오 장소·주소를 검색합니다. 최대 45개는 상한이며, 적게 나오면 그대로 표시합니다. 화면 안 결과가 없을 때에만 현재 위치에서 가까운 후보를 가져옵니다. 첫 결과와 목록 스크롤 위치로 지도 중심을 옮기되 줌은 유지합니다. 추가 페이지 요청이 실패하면 이미 받은 결과를 표시합니다.

## Vercel 환경 변수

- `KAKAO_MAP_API_KEY` 또는 `KAKAO_JS_KEY`
- `KAKAO_REST_API_KEY`

`api/bicycle-route.js`는 카카오 자전거 경로 API의 실제 응답 형식을 사용합니다. 경로 좌표 추출은 `vertexes`, `coordinates`, `points`, `sections`, `roads`, `legs`, `steps`를 처리합니다.
