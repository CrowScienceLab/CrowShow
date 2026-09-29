# PDF Presentation Player - 개발 및 유지보수 가이드 (DEVELOPMENT.md)

이 문서는 Codex 또는 후속 개발자가 이 프로젝트를 이어서 수정 및 확장할 수 있도록 작성된 기술 가이드입니다.

---

## 1. 개발 환경 요구사항

- **운영체제**: Windows 11 (macOS 및 Linux 웹 브라우저 호환)
- **Node.js**: v22.12 이상 권장
- **Rust**: stable MSVC 툴체인
- **Windows 구성요소**: Visual Studio Build Tools 2022, Windows SDK, WebView2 Runtime
- **패키지 매니저**: npm (또는 pnpm / yarn)
- **기본 포트**: `http://localhost:5173`

---

## 2. 프로젝트 실행 및 빌드 명령어

### A. 의존성 설치
```bash
npm install
```

### B. 로컬 개발 서버 실행 (HMR 지원)
```bash
npm run dev
```
- 브라우저에서 `http://localhost:5173`으로 접속합니다.
- 코드 수정 시 Vite Hot Module Replacement(HMR)가 작동하여 즉시 반영됩니다.

### C. 프로덕션 빌드 및 타입 검사
```bash
npm run build
```
- `tsc -b`로 엄격한 TypeScript 타입 검사를 수행합니다.
- `vite build`로 번들링된 결과물이 `dist/` 폴더에 생성됩니다.

### D. 프로덕션 미리보기
```bash
npm run preview
```

### E. Tauri Windows 앱 실행 및 패키징
```powershell
npm.cmd run tauri:dev
npm.cmd run tauri:build
```

NSIS 설치 파일은 `src-tauri\target\release\bundle\nsis`에 생성됩니다.

---

## 3. 핵심 모듈별 개발 및 수정 포인트

### A. PDF 렌더링 (`src/pdf/`)
- `pdfLoader.ts`: PDF.js 인스턴스 초기화 및 메타데이터 파싱.
  - 파일 로드 시 각 페이지의 가로/세로 비율(`pageAspectRatios`)을 미리 계산하여 슬라이드 넘김 시 레이아웃 흔들림(Layout Shift)을 방지합니다.
- `pdfRenderer.ts`: 고해상도 Canvas 렌더링.
  - DPR(Device Pixel Ratio) 계산과 캔버스 폭/높이 스타일 지정을 담당합니다.
- `pdfCache.ts`: 슬라이드 사전 렌더링.
  - 슬라이드 전환 빈도가 높은 대용량 문서의 경우 `maxEntries`(현재 16)나 `preloadDistance`(현재 $\pm 2$)를 조정할 수 있습니다.

### B. 펜 필기 및 효과 (`src/annotations/`)
- `strokeEngine.ts`: 베지어 곡선 보간 로직.
  - `renderSingleStroke()`에서 2차 베지어(`quadraticCurveTo`)를 사용하며, 스타일러스 압력 감도(`pressure`)를 반영할 수 있습니다.
- `eraserEngine.ts`: 선분 최단 거리 계산.
  - `distToSegment()` 함수에서 슬라이드 종횡비 왜곡을 보정하여 터치 화면에서도 손쉽게 획을 지울 수 있습니다.
- `annotationStore.ts`:
  - 상태 업데이트 시 `notify()`를 통해 구독자(Canvas)에 렌더링을 트리거하며, `autoSave()`로 브라우저 로컬 스토리지에 즉시 직렬화합니다.

### C. 슬라이드 전환 효과 (`src/transitions/`)
- `transitionEngine.ts`:
  - 새로운 전환 애니메이션(예: Cube 3D, Page Curl 등)을 추가하려면 이 엔진의 `getAnimationClasses()`에 새 타입을 등록하고 `transitionStyles.css`에 키프레임을 정의하면 됩니다.

### D. 키보드 단축키 관리 (`src/presentation/keyboardShortcutManager.ts`)
- 중앙 집중식 이벤트 디스패처로 작동합니다. 텍스트 입력 폼(INPUT, TEXTAREA)에 포커스가 있을 때는 단축키가 자동 비활성화되도록 안전장치가 내장되어 있습니다.

---

## 4. 네이티브 데스크톱 앱 구조

- `src-tauri/src/lib.rs`: PDF 파일 연결, 단일 인스턴스, GitHub 업데이트 확인·다운로드·SHA-256 검증, Windows 기본 앱 설정 연결
- `src-tauri/tauri.conf.json`: 창 최소 크기, WebView2 번들, NSIS, 아이콘 및 PDF 연결 설정
- `src/utils/desktopBridge.ts`: 브라우저·Tauri 런타임 차이를 격리하는 프런트엔드 브리지
- Electron 런타임과 Chromium은 배포물에 포함하지 않습니다.

---

## 5. 현재 구현 상태와 검증

자동 재생, 필기 포함 PDF 내보내기, 청중 분리 창과 Windows NSIS 패키징은 구현되어 있습니다.
청중 창은 팝업 허용 및 실행 환경에 따라 별도 확인이 필요합니다.

- 표시 버전: 1.0f (내부 1.0.5)
- 회귀 검사: `node scripts/regression.cjs`
- 상세 변경 및 제한: `docs/maintenance/2026-09-29-v1.0f-review/REPORT.md`
