# 🚴 자전거 GPS 트래커 - 1단계

**현재 기능**: GPS 위치 읽기 + 구글맵 표시

# 🚴 자전거 GPS 트래커

## 📋 설명
웹 기반 자전거 GPS 추적 앱입니다. 실시간으로 위치를 추적하고 경로를 지도에 표시합니다.

---

## 🚀 시작하기

### 1️⃣ 카카오 API 키 설정
1. [카카오 Developers](https://developers.kakao.com/) 접속
2. 애플리케이션 생성
3. JavaScript 키 복사
4. `config.js`의 `KAKAO_MAP_API_KEY` 값을 수정

```javascript
// config.js
KAKAO_MAP_API_KEY: 'YOUR_KAKAO_API_KEY_HERE',  // ← 여기에 키 입력
```

### 2️⃣ 로컬 실행
```bash
# Python 간단 서버 (포트 8080)
python -m http.server 8080

# Node.js http-server
npx http-server -p 8080
```

브라우저 열기: `http://localhost:8080`

### 3️⃣ 카카오 Developers 설정
- 플랫폼 추가: `http://localhost:8080` (또는 배포 도메인)
- 웹 → 사용 설정
- JavaScript 키가 해당 도메인에서 작동하도록 설정

---

## 📂 파일 구조

```
bike-gps-1stage/
├── index.html          ← 메인 HTML (가장 먼저 실행)
├── config.js           ← 설정 파일 (API 키 여기서 수정)
├── gps.js              ← GPS 로직
├── map.js              ← 지도 로직
├── app.js              ← 메인 앱 로직
├── styles.css          ← 스타일
├── manifest.json       ← PWA 설정
└── README.md           ← 이 파일
```

---

## 🔑 구글맵 API 키 발급 방법

### 1단계: Google Cloud Console 접속
- https://console.cloud.google.com 에 접속

### 2단계: 프로젝트 생성
- "프로젝트 선택" → "새 프로젝트" 클릭
- 프로젝트명: "자전거GPS" (아무거나 상관없음)
- 만들기 클릭

### 3단계: API 활성화
- 검색창에 "Maps JavaScript API" 검색
- 클릭하여 들어간 후 "활성화" 클릭

### 4단계: API 키 생성
- 좌측 메뉴 "사용자 인증 정보" 클릭
- 상단 "사용자 인증 정보 만들기" → "API 키" 클릭
- 생성된 키 복사

### 5단계: 코드에 입력
`config.js` 파일을 열고:
```javascript
GOOGLE_MAP_API_KEY: 'YOUR_GOOGLE_MAP_API_KEY'
```
를 복사한 키로 바꿈:
```javascript
GOOGLE_MAP_API_KEY: 'AIzaSyD...'
```




---

## 🚀 실행 방법

### 방법 1️⃣: Vercel에 배포 (추천)

1. GitHub 계정 만들기
2. 이 폴더를 GitHub에 업로드
3. Vercel(https://vercel.com)에서 GitHub 연동
4. 배포하면 자동으로 URL 생성
5. iPhone에서 그 URL 방문 후 홈 화면에 추가

### 방법 2️⃣: 로컬 테스트

1. Python이 설치되어 있으면:
```bash
# 이 폴더로 이동 후
python3 -m http.server 8000

# 브라우저에서 http://localhost:8000 방문
```

2. Node.js가 설치되어 있으면:
```bash
# npm으로 간단한 서버 실행
npx http-server
```

---

## 📱 iPhone에 설치하기

1. Safari에서 배포된 URL 방문
2. 하단 공유 버튼 클릭
3. "홈 화면에 추가" 선택
4. 이름: "자전거GPS" → 추가

이제 일반 앱처럼 홈 화면에서 실행 가능!

---

## 🔧 코드 수정 방법

### 색깔 변경하고 싶으면?
`styles.css`에서:
```css
background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
```
색상 코드를 변경 (예: #FF0000 = 빨강)

### 초기 지도 위치 변경?
`config.js`에서:
```javascript
centerLat: 37.4979,  // 위도
centerLng: 127.0276, // 경도
```
변경 (예: 강남역은 37.4979, 127.0276)

### GPS 업데이트 속도 조정?
`config.js`에서:
```javascript
UPDATE_INTERVAL: 1000,  // 1초 → 2000으로 바꾸면 2초마다
```

### 경로선 색깔 바꾸기?
`map.js`에서:
```javascript
strokeColor: '#FF0000',  // 빨간색 → '#0000FF'로 바꾸면 파란색
```

---

## 🔧 핵심 코드 설명

### GPS 추적 (gps.js)
```javascript
gpsTracker.startTracking(onSuccess, onError);
gpsTracker.stopTracking();
```

### 지도 관리 (map.js)
```javascript
mapManager.initMap();                    // 지도 초기화
mapManager.updateCurrentMarker(coords);  // 마커 업데이트
mapManager.updatePolyline();             // 경로선 그리기
```

### 앱 로직 (app.js)
```javascript
app.handleStart();   // 추적 시작
app.handleStop();    // 추적 중지
```

---

---

## 🐛 문제 해결

### GPS가 안 나온다?
1. iPhone 설정 → Safari → 위치 허용인지 확인
2. 브라우저 콘솔에서 오류 확인 (개발자 도구)
3. config.js에서 API 키가 정확한지 확인

### 지도가 안 보인다?
1. API 키가 맞는지 다시 확인
2. Google Cloud에서 "Maps JavaScript API" 활성화되어있는지 확인
3. 브라우저 캐시 삭제 후 새로고침

### "권한이 거부되었습니다" 나온다?
- iPhone 설정 → Safari → 위치 허용으로 변경

---

## 🐛 문제 해결  2

### 지도가 안 나올 때
1. **브라우저 콘솔 확인** (F12)
   - `kakao is not defined` → SDK 로드 실패
   - `404 error` → API 키 잘못됨 또는 도메인 미등록

2. **API 키 확인**
   - 카카오 Developers에서 JavaScript 키 재확인
   - 도메인이 등록되었는지 확인

3. **캐시 삭제**
   - `Ctrl+Shift+R` (강력 새로고침)

### GPS가 안 될 때
1. HTTPS 필요 (로컬호스트 제외)
2. 브라우저에서 위치 권한 허용 필요
3. GPS 신호 확인 (옥내에서는 약할 수 있음)

---

## 📊 다음 단계 (2단계)

1단계 테스트 완료하면, 다음을 추가합니다:
- ✅ 경로 그리기 (현재는 마커만 표시)
- ✅ 속도 계산
- ✅ 거리 계산
- ✅ 시간 기록

---

## 💡 팁

**개발자 도구 사용법** (iPhone Safari):
1. Mac에서 Safari 열기
2. 개발 메뉴 → iPhone 연결
3. "iPhone의 Safari" → 당신 페이지 선택
4. 콘솔 탭에서 실시간 오류 확인 가능

**실시간 수정하려면**:
- 코드 수정 → 저장 → 브라우저 새로고침 (Cmd+R)

# 📱 배포

### Vercel 배포
```bash
vercel deploy
```

### GitHub Pages
1. GitHub에 repository 생성
2. `gh-pages` 브랜치 설정
3. 파일 push

---

## 📊 다음 단계 (2-4단계)

- 2단계: 기본 기능 (기록 저장, 속도/거리 계산)
- 3단계: 고급 기능 (목적지 설정, 속도 기반 색칠)
- 4단계: 통계 + 기록 화면

---

## 📄 라이선스
MIT License


---

## 📝 주의사항

- 🔴 개발 초기 단계이므로 버그 있을 수 있음
- 🔴 배터리 소비 많으니 충전기 준비
- 🔴 실제 자전거 탈 때는 안전 먼저!

---

## 🙋 추가 질문?

각 파일에 한국어 주석이 있으니 읽어보세요!

Happy Cycling! 🚴‍♂️
