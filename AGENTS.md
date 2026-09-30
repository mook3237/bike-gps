# RideMate — 작업 크기 비례 실행 규칙

## 최우선 원칙

정확성을 유지하면서 "요구사항을 증명하는 데 필요한 최소 작업"만 수행한다.

더 조사할 수 있다는 이유로 조사하지 않는다.
더 테스트할 수 있다는 이유로 테스트하지 않는다.
더 검증할 수 있다는 이유로 검증하지 않는다.

작업 비용은 변경 범위와 위험도에 비례해야 한다.

## 1. 먼저 작업 크기를 판단한다

작업 시작 시 내부적으로 다음 중 하나로 분류한다.

- SMALL
- MEDIUM
- LARGE

사용자에게 분류 승인을 요청하지 않는다.
분류 때문에 작업을 멈추지 않는다.

## 2. SMALL — 기본값

다음은 기본적으로 SMALL이다.

- CSS 수정
- 위치/크기/간격 수정
- asset 경로 수정
- 이미지 교체/crop
- 문구 수정
- 버튼 하나의 단순 동작 수정
- 원인이 이미 확인된 버그
- 명확한 1~3개 파일 수정
- 특정 함수 1~2개의 bounded 수정

실행:

1. 관련 위치 검색
2. 필요한 코드만 읽기
3. 최소 수정
4. 가장 직접적인 검증 1회
5. 종료

SMALL에서는 기본적으로 하지 않는다:

- 프로젝트 전체 조사
- 광범위한 architecture 분석
- brainstorming
- 별도 implementation plan
- 형식적인 TDD
- full regression
- 전체 test suite
- 여러 브라우저 검증
- 동일 테스트 반복
- 여러 viewport 반복
- 불필요한 screenshot 생성
- 별도 QA 환경 구축
- 관련 없는 cleanup/refactor
- 관련 없는 파일 읽기

이미 root cause가 사용자 또는 이전 조사에서 확인되었다면 다시 root cause 조사를 반복하지 않는다.

## 3. SMALL 검증 규칙

변경사항을 직접 증명하는 가장 짧은 검증을 선택한다.

예:

- asset 404 → asset 존재/HTTP 200 → 필요하면 viewport 1회 → 종료
- CSS 위치 변경 → 해당 viewport 렌더링 1회 → 종료
- 단일 JS 조건 수정 → 해당 조건 focused test → 종료
- 문구 수정 → DOM/text 확인 → 종료

하나의 검증으로 충분하면 두 번째 방법으로 다시 증명하지 않는다.

## 4. 검증 환경 문제가 생겼을 때

SMALL 작업에서 검증 도구가 실패하면 같은 목적의 재시도는 최대 1회만 한다.

그래도 환경 때문에 실패하면 다음과 같이 명확히 보고하고 종료한다.

`[NOT VERIFIED - ENVIRONMENT]`

다음 행동을 금지한다:

- 다른 브라우저 환경 새로 구축
- 별도 서버를 여러 번 구성
- 새로운 자동화 framework 설치
- 우회 검증을 연속적으로 시도
- production 수정 시간보다 QA 환경 구축에 더 많은 시간 사용

환경 문제는 production 코드 문제로 취급하지 않는다.

## 5. MEDIUM

다음과 같은 경우 MEDIUM이다.

- 여러 state/function이 연결됨
- 기존 workflow regression 위험이 있음
- navigation flow 변경
- persistence 동작 변경
- 여러 화면이 연결된 기능 수정

실행:

1. bounded investigation
2. root cause
3. 필요한 regression test
4. 최소 수정
5. focused tests
6. 필요한 경우 connected flow 1회
7. 종료

전체 regression은 기본적으로 실행하지 않는다.

실제 변경 영향이 넓다는 구체적인 이유가 있을 때만 실행한다.

## 6. LARGE

다음과 같은 경우에만 LARGE다.

- 새로운 storage system
- profile/account architecture
- database/backend 도입
- 대규모 navigation architecture 변경
- 핵심 데이터 migration
- 여러 subsystem을 동시에 변경

이 경우에만 필요에 따라 다음을 사용한다.

- 상세 조사
- implementation plan
- TDD
- connected flow
- broader regression
- browser verification

LARGE라고 해서 모든 절차를 기계적으로 전부 실행하지 않는다.

## 7. Superpowers 사용 규칙

Superpowers skill은 작업을 더 크게 만들기 위한 절차가 아니다.

SMALL 작업에 다음을 기계적으로 연쇄 적용하지 않는다.

- brainstorming
- writing-plans
- systematic-debugging
- TDD
- browser automation

skill 사용 자체가 작업보다 비싸지기 시작하면 사용하지 않는다.

이미 원인이 확인된 SMALL 작업에서는 diagnosing/debugging 절차를 처음부터 반복하지 않는다.

## 8. 조사 범위 제한

항상 rg/search를 먼저 사용한다.

다음 순서로 확인한다.

1. 관련 symbol
2. 직접 호출부
3. 필요한 코드 범위

관련 없는 파일까지 읽지 않는다.

사용자가 "최소한으로 찾아", "이것만 고쳐", "다른 것은 건드리지 마"라고 하면 이 규칙을 특히 엄격하게 적용한다.

## 9. 수정 범위 제한

요구사항을 해결하는 최소 변경만 한다.

금지:

- 관련 없는 refactor
- naming 정리
- formatting 정리
- architecture 개선
- 다른 버그 동시 수정
- 사용자가 요구하지 않은 UX 개선

다른 문제를 발견하면 수정하지 말고 필요할 때만 보고한다.

## 10. 테스트 규칙

테스트 개수를 최대화하지 않는다.

변경된 동작을 증명하는 최소 테스트를 사용한다.

이미 PASS한 동일 테스트를 이유 없이 반복 실행하지 않는다.

- SMALL: focused verification 1회가 기본
- MEDIUM: focused tests + 필요한 connected flow
- LARGE: 필요한 경우 broader regression

## 11. 시간 우선 규칙

사용자의 시간은 중요한 비용이다.

작은 변경을 검증하기 위해 10~15분짜리 조사/환경 구축을 만드는 것은 실패로 간주한다.

production 수정보다 검증 infrastructure 작업이 커지면 즉시 범위를 축소한다.

## 12. 기존 확정 UX 보호

RideMate에서 이미 확정된 UX는 다시 설계하지 않는다.

확정 UX에 대해:

- 대안 제안 금지
- 임의 버튼 추가/삭제 금지
- 화면 순서 변경 금지
- 구현 편의를 위한 동작 변경 금지

자율 판단 범위는 확정 동작을 안전하고 최소한으로 구현하는 방법뿐이다.

## 13. Git

사용자가 명시적으로 요청하기 전에는:

- git add 금지
- git commit 금지
- git push 금지

git status / git diff 등 읽기 전용 확인은 가능하다.

## 14. 종료 조건

요구사항이 구현되고 그 요구사항을 직접 증명하는 충분한 evidence가 확보되면 즉시 작업을 종료한다.

"추가로 확인하면 더 안전할 것 같다"는 이유만으로 작업을 계속하지 않는다.

최종 목표는 MAXIMUM VERIFICATION이 아니라 MINIMUM SUFFICIENT VERIFICATION이다.
