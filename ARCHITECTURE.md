# PDF Presentation Player - 시스템 아키텍처 (ARCHITECTURE.md)

## 1. 기술 스택 검토 및 선정 이유

### A. 데스크톱 런타임: Tauri 2 + WebView2 (React 19 + TypeScript + Vite)
- **후보 비교**:
  - **Electron**: Node.js와 Chromium 풀 번들을 탑재하여 번들 용량이 크고(150MB+), 윈도우 환경에 따른 빌드/권한 복잡도가 높음.
  - **Tauri**: Rust 백엔드와 OS Webview2(Windows 11)를 활용하여 경량이나, Rust 툴체인 선행 설치가 요구됨.
  - **선정 방식**:
    - React 19 + TypeScript + Vite 기반의 고성능 SPA 아키텍처로 구현.
    - 브라우저 표준 Web API(Fullscreen API, Pointer Events, File System API, LocalStorage/IndexedDB, Web Worker)만을 사용하여 OS 및 브라우저 어디서나 즉시 실행 가능.
    - Windows 앱은 `src-tauri`의 Rust 백엔드와 운영체제 WebView2를 사용합니다.
    - PDF 파일 연결, 단일 인스턴스 및 SHA-256 검증 업데이트는 Tauri 명령으로 분리했습니다.
    - 같은 React 코어는 향후 Windows 완료본을 기준으로 Android Tauri 프로젝트에 재사용합니다.

### B. PDF 렌더링 엔진: Mozilla PDF.js (`pdfjs-dist`)
- 브라우저 및 Node 생태계에서 가장 검증된 순수 웹 기반 PDF 파싱/렌더링 라이브러리.
- Web Worker를 활용하여 메인 스레드 렌더링 차단을 방지.
- HTML5 Canvas에 직접 래스터화하며, `window.devicePixelRatio`를 반영하여 4K/레티나 및 125%/150% 윈도우 배율에서도 텍스트가 뭉개지지 않고 선명하게 출력.

### C. 펜 필기 레이어: Direct HTML5 Canvas with PointerEvents
- **비교 분석**:
  - **SVG**: 스트로크 개수가 수백 개를 넘어가면 DOM 트리가 비대해져 프레임 드롭 발생.
  - **Konva / Fabric.js**: 범용 캔버스 라이브러리는 발표 전용 플레이어에 불필요한 레이아웃/이벤트 오버헤드와 번들 크기 증가를 유발.
  - **직접 구현 Canvas (선택)**:
    - `pointerdown`, `pointermove`, `pointerup` 기반으로 서피스 펜(Surface Pen), 와콤 스타일러스, 정전식 터치, 마우스를 통합 처리.
    - 2차 베지어 곡선(Quadratic Bezier) 스무딩 알고리즘 적용으로 자연스러운 손글씨 필기감 제공.
    - 모든 좌표를 $[0.0, 1.0]$ 정규화 좌표(Normalized Coordinates)로 변환/저장하여 윈도우 크기 변경이나 줌(Zoom) 인/아웃 시에도 스트로크 왜곡 없음.
    - 획 단위 지우개(Stroke-based Eraser)를 위해 점과 선분 간 최단 거리 공식을 이용한 스마트 히트테스트(Hit-testing) 탑재.

### D. 슬라이드 전환 엔진: GPU 가속 CSS 3D 트랜스폼 기반 `TransitionEngine`
- `translate3d`, `scale3d`, `opacity` 속성만을 조작하여 브라우저의 Composite 스레드에서 60fps 하드웨어 가속 처리.
- 듀얼 버퍼 슬라이드 프레임(`exitingFrame`과 `enteringFrame`)을 동시 운용하여 페이드, 슬라이드 좌/우/상/하, 줌, 디졸브를 부드럽게 연출.

---

## 2. 5계층 프레젠테이션 아키텍처

```
┌────────────────────────────────────────────────────────┐
│ 5. Presentation Control Layer                          │
│    (Header Toolbar, Floating Toolbar, Presenter Studio, │
│     KeyboardShortcutManager, Navigation HUD)           │
├────────────────────────────────────────────────────────┤
│ 4. Presentation Effect Layer                           │
│    (Laser Pointer Dot & Trail, Spotlight Cutout,       │
│     Black/White Screen Curtains)                       │
├────────────────────────────────────────────────────────┤
│ 3. Annotation Layer                                    │
│    (Vector Stroke Canvas, Pen/Highlighter, Eraser,     │
│     Undo/Redo History, Normalized Coordinates)         │
├────────────────────────────────────────────────────────┤
│ 2. Slide Display Layer                                 │
│    (Aspect-ratio auto fit, Responsive Container,       │
│     Zoom & Pan Coordinate Transformer)                 │
├────────────────────────────────────────────────────────┤
│ 1. PDF Render Layer                                    │
│    (Mozilla PDF.js, Offscreen Canvas LRU Cache,        │
│     Preloading ±2 Distance Slides)                     │
└────────────────────────────────────────────────────────┘
```

1. **PDF Render Layer**: 원본 문서를 건드리지 않고, 비동기 백그라운드에서 오프스크린 캔버스로 고품질 래스터화합니다.
2. **Slide Display Layer**: 컨테이너의 크기에 맞춰 슬라이드의 가로/세로 비율을 유지하며 중앙 배치하고 줌/팬을 처리합니다.
3. **Annotation Layer**: 투명 캔버스 위에서 사용자의 펜/형광펜/지우개 입력을 받아 정규화 벡터 좌표로 관리합니다.
4. **Presentation Effect Layer**: 발표 도구(레이저 잔상, 스포트라이트 어두운 오버레이 + 원형 컷아웃, 블랙/화이트 커튼)를 렌더링합니다.
5. **Presentation Control Layer**: 사용자의 인터랙션(F5 전체화면, 마우스 무반응 시 플로팅 툴바 자동 숨김, 단축키 처리)을 총괄합니다.

---

## 3. 디렉터리 및 모듈 구조

```
src/
├── types/
│   ├── pdf.ts             # PDF 메타데이터 및 렌더링 옵션 타입
│   ├── annotation.ts      # 스트로크, 정규화 좌표, 도구 타입, .crowshow 포맷
│   ├── presentation.ts    # 뷰 모드, 화면 전환, 프레젠테이션 상태 타입
│   └── settings.ts        # 테마, 기본 전환, 도구 기본값 설정
├── pdf/
│   ├── pdfLoader.ts       # PDF.js 워커 세팅, ArrayBuffer/File 로딩
│   ├── pdfRenderer.ts     # 고해상도(DPR) 렌더링 및 썸네일 축소 렌더러
│   ├── pdfCache.ts        # 주변 ±2 슬라이드 사전 렌더링 & LRU 캐시
├── annotations/
│   ├── strokeEngine.ts    # 베지어 곡선 보간 및 형광펜 multiply 블렌딩
│   ├── eraserEngine.ts    # 선분 거리 기반 스마트 획 삭제 히트테스터
│   ├── annotationStore.ts # Undo/Redo 스택, 로컬스토리지 자동저장, 프로젝트 Export
│   ├── annotationCanvas.tsx# 포인터 이벤트 수신 및 인터랙티브 캔버스
│   └── effectsLayer.tsx   # 레이저 잔상 및 스포트라이트 컷아웃 렌더러
├── transitions/
│   ├── transitionEngine.ts# 방향/타입별 CSS 클래스 매핑 엔진
│   ├── transitionContainer.tsx # 듀얼 버퍼 슬라이드 전환 컨테이너
│   └── transitionStyles.css # GPU 가속 3D 트랜스폼 키프레임
├── presentation/
│   ├── keyboardShortcutManager.ts # F5, 화살표, 도구 키 중앙 디스패처
│   ├── presentationTimer.ts       # 시작/일시정지/초기화 경과 타이머
│   └── presenterModeView.tsx      # 발표자 전용 듀얼 뷰 (청중화면 + 다음화면)
├── components/
│   ├── StartScreen.tsx        # 시작 화면, 드래그앤드롭, 최근 파일 열기
│   ├── HeaderToolbar.tsx      # 상단 도구 모음 (슬라이드쇼, 펜, 전환 효과)
│   ├── SlideThumbnailList.tsx # 좌측 슬라이드 썸네일 탐색기
│   ├── FloatingToolbar.tsx    # 전체화면용 자동 숨김 플로팅 컨트롤 바
│   ├── BottomStatusBar.tsx    # 하단 내비게이션, 타이머, 줌 컨트롤
│   ├── ColorPickerPopover.tsx # 색상 팔레트 및 선 굵기 조절 팝오버
│   ├── GoToSlideModal.tsx     # Ctrl+G 특정 슬라이드 직접 이동 모달
│   ├── SettingsModal.tsx      # 테마, 전환시간, 레이저 색상 환경설정
│   └── ConfirmModal.tsx       # 전체 삭제 확인 모달
├── styles/
│   └── fluent.css             # Windows 11 Fluent Design 토큰 및 스타일
├── App.tsx                    # 상태 통합 및 뷰 모드 라우팅 메인 컴포넌트
└── main.tsx                   # 진입점
```

---

## 4. 데이터 모델 설계

### A. Annotation Stroke (`AnnotationStroke`)
```typescript
interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  opacity: number;
  points: NormalizedPoint[]; // [{ x: 0.25, y: 0.40, pressure: 0.8 }, ...]
  slideNumber: number;
  createdAt: number;
}
```

### B. Project Data File (`.crowshow`)
```json
{
  "version": "1.0.0",
  "documentName": "lecture.pdf",
  "totalSlides": 5,
  "createdAt": "2026-09-28T04:00:00.000Z",
  "settings": {
    "transitionType": "fade",
    "transitionDuration": 400
  },
  "annotations": {
    "1": [ /* 슬라이드 1 스트로크 목록 */ ],
    "2": [ /* 슬라이드 2 스트로크 목록 */ ]
  }
}
```

---

## 5. 성능 최적화 전략

1. **사전 렌더링 (Preload Strategy)**: 현재 슬라이드가 변경되면 `pdfCache.preloadNearbySlides(pdf, currentSlide, 2)`가 작동하여 앞뒤 2장의 슬라이드를 오프스크린 캔버스에 비동기로 렌더링해 둡니다. 사용자가 다음/이전 슬라이드로 넘길 때 PDF 파싱 과정을 거치지 않고 캐시된 캔버스를 `drawImage`하여 0ms로 화면이 전환됩니다.
2. **DPR 보정 렌더링**: `Math.min(window.devicePixelRatio || 1, 2.5)` 배율을 곱해 렌더링하여 고해상도 모니터에서도 선명함을 유지하면서 과도한 메모리 사용을 억제합니다.
3. **획 단위 지우개 Bounding-Box 사전 필터링**: 지우개 궤적 검사 시 모든 획의 모든 점을 전수 조사하지 않고, 획의 Bounding-box를 먼저 체크하여 불필요한 연산을 $O(1)$로 차단합니다.
