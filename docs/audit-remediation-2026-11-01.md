# RideMate 감사 후 수정 요약 (2026-11-01)

감사 지적을 현재 코드와 실제 호출부에서 확인했다. 이 문서는 로컬 수정 상태를 설명하며 커밋·배포 결과를 뜻하지 않는다.

## 오류별 결과

| 항목 | 결과 | 확인한 변경과 근거 |
|---|---|---|
| 주행·레이싱 프로필 소유권 | 수정 | `ensureSharedRide`와 레이싱 시작 시 소유 프로필을 고정한다. 일반 결과와 완료 대기 레이싱 저장은 고정한 프로필로 기록하며, 결과 화면의 최고 기록 비교도 해당 프로필을 읽는다. 프로필 전환 뒤 두 저장 경로 테스트를 추가했다. |
| 여러 탭 저장 충돌 | 수정, 제한 있음 | 새 주행·레이싱 기록은 프로필별 고유 `localStorage` 키에 추가한다. 설정·최근 검색은 기존 저장소를 새로 읽고 저장한다. 설정 저장과 두 탭의 독립 주행 저장이 기록을 지우지 않는 테스트, 저장 실패 후 기존 기록 유지 테스트를 추가했다. 동일 설정 필드를 두 탭이 정확히 동시에 바꾸는 경우까지 트랜잭션으로 보장하지는 않는다. |
| 레이싱 최고 기록 교체 용량 | 수정, 제한 있음 | 교체 대상은 기록 전체 JSON 대신 저장 키의 고유 ID로 참조한다. 새 기록 저장이 성공한 뒤 이전 레이싱 기록 키를 삭제한다. 예전 형식의 전체 JSON 참조도 읽고, 그 기록이 숨긴 기존 프로필 기록의 ID를 새 기록에 이어받는다. 용량 제한·저장 실패·연속 교체 테스트로 확인했다. |
| 기록계 저장 합계 반복 읽기 | 수정 | 기록계는 같은 프로필과 달에서는 저장 기록 합계를 재사용한다. 일반 주행 저장, 레이싱의 일반 기록 저장, 다른 탭의 저장소 변경, 프로필 전환, 달 변경 시 다시 계산한다. GPS 화면 갱신마다 저장 키 전체를 읽지 않는다. |
| 다른 코스 교체 | 수정 | `courseId` 일치만으로 같은 코스로 판단하지 않는다. 시작·끝·거리와 경로 거리별 중간 지점을 비교한다. 반올림 ID가 같아도 약 109m 떨어진 두 경로는 함께 남고, 같은 경로의 더 빠른 기록은 교체된다. |
| GPS 판정 불일치 | 수정 | 지도와 기록계의 표시 경로가 공통 FAST 최신성·순서·비정상 위치 판정을 사용한다. 이동 판정에는 같은 FAST 관측을 전달하며, 기록 중 경로와 레이싱 구간은 기존 `ingestRideFix`를 유지한다. 위치 표시와 기록 인정 기준은 분리한다. |
| 중복 시작 좌표 경로 거부 | 수정 | 처음 두 점이 같아도 뒤의 유효한 점까지 검사한다. 전체 동일 좌표와 범위 밖 좌표는 거부한다. |
| 예약 검색 취소 | 수정 | 취소 시 타이머와 진행 요청을 중단하고 순번을 무효화한다. 지우기·새 검색·장소 선택·검색 화면 이탈 경로를 연결했다. |
| 최근 검색 저장 실패 | 수정 | 최근 검색 저장 실패는 검색 결과와 장소 선택을 막지 않는다. 주행·레이싱 기록 저장 실패는 기존 오류 경로로 남긴다. |
| 화면 항상 켜기 | 수정 | 비동기 획득 시 요청 세대와 현재 설정·화면 상태를 재확인하고, 늦게 받은 잠금은 해제한다. |
| 검색 요청 대기 | 수정 | 카카오 키워드 페이지·주소·주변 장소 요청마다 6초 제한을 둔다. 추가 페이지 실패 시 이미 받은 결과를 유지하며 기존 오류 안내 정책을 유지한다. |

## 공통 함수와 실제 호출부

| 공통 기반 | 실제 호출부 | 분리해서 유지하는 기능 규칙 |
|---|---|---|
| `Ride.createGpsSource` → `Ride.processFastObservation` | `app.js`의 `navigation`, `ride-session`, `map-movement`, `riding-board-live` 구독 | 화면별 구독 시점 |
| `Ride.isFastObservationUsable` | 내비 표시·카메라, 레이싱 표시, 일반 지도, 기록계 표시 | 표시용 위치는 기록 거리·도착 인정과 별도 |
| `Ride.processMotionFix` / `Ride.ingestRideFix` | 지도·기록계의 비기록 이동, 전체 주행 기록, 레이싱 구간 기록 | 전체 주행과 레이싱 구간의 시작 시각·저장 형식 |
| `Ride.smoothHeading` | 내비와 레이싱 표시 | 내비 안내 방향과 레이싱 목표 방향 |
| `Ride.haversineDistance`, `Ride.bearingDegrees`, `Ride.routeDistance`, `Ride.routePointAtDistance` | `app.js`의 경로 계산과 코스 비교, `racing-foundation.js`의 Ghost·진행 계산, 공통 도착 게이트 | 왕복 단계, 재탐색, 카메라 이동 조건 |
| `Ride.createRouteArrivalState` / `Ride.evaluateRouteArrival` | 내비 시작·재탐색과 레이싱 도착·반환점 | 내비 안내 완료와 레이싱 완주 처리 |

## 정리 범위

- 제거: 실제 검색 경로가 사용하지 않던 앱·API의 예전 검색 정렬 함수와 해당 테스트, 예전 도착 판정 함수·테스트, HTML·앱·테스트 어디에서도 참조하지 않는 단순 래퍼 5개(`performanceMs`, `replaceNavigationDestination`, `addNavigationWaypoint`, `closeRacingSaveModal`, `savePendingRacingRecord`). 재탐색에 남아 있던 옛 도착 상태 호출은 현재 도착 상태 호출로 바꿨다.
- 유지: `syncRouteViewport`, `handleCategoryMarkerClick`, `moveRoutePoint`, `activeRideDuration`처럼 테스트에서 직접 사용하는 후보와 지도 장소 갱신 관련 함수는 이번 변경에서 일괄 삭제하지 않았다. 네비 안내, 왕복·Ghost, 전체 주행·레이싱 구간은 역할이 다르므로 합치지 않았다.
- README의 검색 범위·45개 상한·프로필별 저장 설명을 현재 동작에 맞췄다.

## 검증 범위와 남는 제한

- 이전 감사 수정 직후 전체 자동 회귀에서 464개 통과, 별도 감사 스크립트에서 42개 통과했다. 이번 저장 용량·기록계 수정 후에는 프로필 및 운영 연결 테스트 27개, 기록계 캐시 집중 테스트 1개, 관련 화면 저장 흐름 5개가 통과했다. 이번 변경에 대해 전체 회귀를 다시 실행하지는 않았다.
- 프로필 소유권·두 탭 저장·코스 충돌·GPS 표시·검색 취소·저장 실패·Wake Lock·API 중복 좌표·API 대기 제한에 집중 테스트를 추가했다. 이 테스트들은 모의 저장소·GPS·카카오 응답을 사용한다.
- 자동 테스트는 실제 카카오 API, iPhone GPS·Safari 애니메이션, Vercel 배포를 실행하지 않는다.
- 고유 기록 키는 두 탭이 서로 다른 기록을 동시에 추가할 때 덮어쓰기를 피한다. 동일 코스의 최고 기록을 두 탭이 같은 순간 저장하면 둘 다 남을 수 있으므로, 단일 최고 기록의 동시성까지 보장하려면 트랜잭션 저장소가 필요하다.
- 이전 레이싱 기록 키는 새 기록 저장에 성공한 뒤 삭제한다. 기존 프로필 본문에 들어 있는 예전 기록은 다른 탭의 설정을 덮어쓰지 않도록 물리적으로 지우지 않고 ID로 숨긴다. 새 기록과 이전 기록이 동시에 들어갈 임시 공간조차 없으면 교체 저장은 실패하고 이전 기록을 유지한다.

## 수정 파일

- 운영 코드: `app.js`, `ride-foundation.js`, `racing-foundation.js`, `profile-system.js`, `settings-foundation.js`, `api/bicycle-route.js`, `api/place-search.js`
- 테스트: `tests/full-audit.mjs`, `tests/map-place-waypoint.test.mjs`, `tests/profile-production-contract.test.cjs`, `tests/profile-system.test.cjs`, `tests/regression.test.mjs`, `tests/ride-foundation.test.cjs`, `tests/settings-foundation.test.cjs`
- 문서: `README.md`, `docs/audit-remediation-2026-11-01.md`
