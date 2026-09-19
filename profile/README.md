# RideMate Screen 01 — Profile Selection

첨부된 기준 이미지의 화면을 최대한 그대로 유지하면서,
프로필 카드/선택 버튼은 실제 HTML/CSS/JS UI로 만든 버전입니다.

## 바로 확인

### 가장 간단한 방법
`index.html`을 더블클릭해서 Chrome으로 엽니다.

### 권장 방법
VS Code에서 이 폴더를 연 뒤 Live Server로 `index.html`을 실행합니다.

## 구조

- `index.html` — 화면 구조
- `styles.css` — 화면 디자인
- `app.js` — 프로필 선택/선택하기 동작
- `assets/hero-reference.jpg` — 기준 이미지 상단 영역
- `assets/avatar-*.jpg` — 기준 이미지에서 추출한 프로필 이미지

## 중요한 점

스크린샷만 가지고는 원본 배경 사진/프로필 사진의 원본 파일을 복원할 수 없기 때문에,
상단 히어로 영역은 기준 이미지에서 그대로 잘라 사용했습니다.

반면 프로필 선택 영역은 실제 HTML 요소로 구성했기 때문에
나중에 다음 화면과 연결하거나 Supabase/GPS 로직을 붙일 수 있습니다.
