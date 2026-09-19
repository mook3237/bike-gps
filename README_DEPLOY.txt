RideMate 통합 Vercel v1

연결 흐름
프로필 -> 메인지도(실제 Kakao) -> 목적지 검색(실제 Kakao 장소검색) -> 검색결과/장소상세 -> 출발/도착 -> 실제 Kakao 자전거 경로 3종 -> 경로 선택

Vercel 환경변수
KAKAO_REST_API_KEY = Default Rest API Key
KAKAO_JS_KEY = Bikegpstest JavaScript Key

중요
- REST 키는 브라우저 소스에 노출되지 않고 /api 서버리스 함수에서만 사용합니다.
- JavaScript 키는 Kakao Maps JS SDK용입니다.
- Kakao Developers > Bikegpstest > JS SDK 도메인에 실제 Vercel 배포 도메인이 등록되어 있어야 합니다.
- 현재 등록해둔 bike-gps.vercel.app를 그대로 배포 도메인으로 쓰면 별도 도메인 추가 없이 맞출 수 있습니다.
- 가족 테스트 흐름 때문에 / 는 프로필 화면으로 시작합니다. 실제 공개 앱에서 프로필 시작화면을 제거할 때는 / 를 /map/으로 바꾸면 됩니다.
- 안내 시작 이후의 실제 턴바이턴 내비게이션 화면은 이번 v1 연결 범위에 넣지 않았습니다. selectedRoute는 sessionStorage에 저장되므로 다음 네비게이션 통합에서 그대로 이어받을 수 있습니다.
