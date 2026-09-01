# 🚴 자전거 GPS 트래커 - 로컬 셋업 가이드

**로컬에서 바로 테스트하기!**

---

## 🚀 빠른 시작 (5분)

### 1️⃣ API 키 설정

**config.local.js** 파일을 열어서:

```javascript
KAKAO_MAP_API_KEY: 'YOUR_KAKAO_API_KEY_HERE',  // ← 여기에 본인 키 입력!
```

본인의 카카오 JavaScript 키로 바꾸기

### 2️⃣ 로컬 서버 실행

**Python** 사용:
```bash
python -m http.server 8080
```

**Node.js** 사용:
```bash
npx http-server -p 8080
```

### 3️⃣ 접속

```
http://localhost:8080/index.local.html
```

### 4️⃣ 테스트!

- ✅ "위치 추적 시작" 클릭
- ✅ 시간 카운트 확인
- ✅ GPS 신호 수신 확인
- ✅ 속도/거리 업데이트 확인

---

## 📂 로컬 파일 구조

```
bike-gps/
├── index.local.html      # ← 로컬 테스트용 (이 파일 사용!)
├── config.local.js       # ← API 키 입력
├── index.html            # (GitHub용, 무시)
├── config.js             # (GitHub용, 무시)
├── app.js
├── map.js
├── gps.js
├── styles.css
├── manifest.json
└── ...
```

---

## 🔐 보안 주의

⚠️ **config.local.js는 로컬에만 있고 GitHub에 올라가지 않습니다!**

`.gitignore`에서 제외되므로 안전합니다:
```
config.js
config.local.js
index.local.html
```

---

## 🐛 문제 해결

### "지도가 안 나와요"
- ✅ config.local.js에 API 키 입력 확인
- ✅ 브라우저 콘솔 (F12) 에러 메시지 확인

### "GPS가 안 됩니다"
- ✅ HTTPS 필요 (로컬호스트 제외) → localhost:8080 사용
- ✅ 브라우저 위치 권한 허용
- ✅ 옥내는 신호 약할 수 있음

### "카카오 SDK 로드 실패"
```
❌ 카카오 SDK 로드 실패!
config.local.js의 API 키를 확인하세요.
```
→ config.local.js의 API 키가 올바른지 확인

---

## 📱 핸드폰에서 테스트

### iOS (iPhone)
1. Safari에서 `http://[당신의PC IP]:8080/index.local.html` 접속
2. 하단 공유 버튼 → "홈 화면에 추가"
3. GPS 권한 허용

### Android
1. Chrome에서 `http://[당신의PC IP]:8080/index.local.html` 접속
2. 우측 메뉴 → "앱 설치"
3. GPS 권한 허용

---

## ✨ 테스트 체크리스트

- [ ] "위치 추적 시작" 클릭
- [ ] 시간 카운트 (00:00:01, 00:00:02...)
- [ ] GPS 신호 수신 (위도/경도 표시)
- [ ] 속도 측정 (km/h 표시)
- [ ] 거리 계산 (km 증가)
- [ ] "속도 기록 지도" 탭 확인
- [ ] "경로 지도" 탭에서 경로 표시
- [ ] "기록 저장하기" 버튼 작동
- [ ] "추적 중지" 버튼 작동

---

## 💡 팁

### 현재 PC의 로컬 IP 확인

**Mac/Linux:**
```bash
ifconfig | grep "inet "
```

**Windows:**
```cmd
ipconfig
```

192.168.x.x 형태의 IP 사용

### 더 빠른 개발 (자동 새로고침)

```bash
# live-server 설치
npm install -g live-server

# 실행 (자동 새로고침)
live-server --port=8080
```

---

## 🎉 준비 완료!

**index.local.html에서 바로 테스트 시작!** 🚴‍♂️

문제가 있으면 브라우저 콘솔(F12)에서 에러 확인하세요.
