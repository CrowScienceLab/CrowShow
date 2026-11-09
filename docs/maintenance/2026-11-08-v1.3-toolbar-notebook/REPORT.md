# CrowShow 1.3 Review2 · 메뉴·노트 개편 검토

- 날짜: 2026-11-08
- 프로젝트: `D:\App coding\CrowShow`
- 배포 상태: 로컬 검토 전용. GitHub push/release 및 Microsoft Store 업로드/제출 없음.
- 검토판은 별도 앱 식별자를 사용하며 정식 설치판의 로컬 데이터와 분리됩니다. Review1과 Review2는 같은 검토 식별자를 사용합니다.

## 사용자 요청 반영

| 항목 | 반영 결과 | 검증 |
|---|---|---|
| 1·2 직선형 공통 메뉴 | 원형 메뉴 폐기. 편집·발표·노트에 선택/올가미/펜/형광펜/텍스트/도형/지우개/레이저/색상표/두께 순서 | 실제 PC 화면, 접근성 목록의 10항목, 발표 화면 |
| 3 펜·형광펜 팝업 | 위로 열리는 248px 소형 아이콘 팝업. 색상·두께·필압/기울임 옵션. 툴팁 | PC 화면 및 구현 확인 |
| 4 상단 노트·주의 환기 제거 | 슬라이드쇼 옆 붉은 노트 아이콘. 차임·폭탄 컴포넌트·단축키 제거 | PC 상단과 단축키 코드 확인 |
| 5 도형 정리 | 사각형/원/삼각형/직선/점선/화살표/별/하트 8종. 화살촉 폭:길이=1:3 | 실제 8아이콘 메뉴, 화살촉 좌표 비율 자동 검사 |
| 6 PDF 복원·저장 | 위/아래 이동 버튼 제거, 수정전 복원/PDF 저장. 드래그 순서 변경 유지 | UI·PDF 편집 회귀 검사. 복원은 페이지 편집 이력이 있을 때 활성화 |
| 7 스크롤바 | 6px, 어두운 회색 thumb와 투명한 track | 스타일 및 PC 화면 |
| 8 지우개 메뉴 | 객체/영역/페이지/문서 전체 4아이콘과 두께. 닫기 가능 | 실제 위쪽 메뉴, 바깥 클릭 닫기 |
| 9 전체 노트 화면 | 중앙 작업 화면 전환. 편집 모드의 좌측 목록 유지. 노트 닫으면 PDF로 복귀. 공통 도구바 하나 | PC 편집·발표에서 N 전환/복귀, 1/2페이지 필기 |
| 10 용지·이미지·링크 | 스프링 질감, 전체 페이지 필기, 1/2페이지 보기, 이미지 파일과 캡처 Ctrl+V, HTTP/HTTPS 링크 | PNG 파일 추가, Alt+Print 캡처 Ctrl+V 및 undo, 한글 링크 추가, 노트 PDF 2페이지 재렌더링 |
| 11 필압·기울임 | PointerEvent pen pressure/tilt/twist 보존, coalesced event 입력. 펜 굵기·형광펜 너비 반영, 옵션 토글 | 렌더러 단위 검사. 실제 스타일러스 하드웨어 미검증 |

이전 프로젝트의 구형 도형은 계속 표시하되 새 도형 선택 메뉴에서는 제외합니다.
PDF 본문을 지우는 기능과 필기를 지우는 기능은 구분합니다.

## 실제 사용자 동선으로 확인한 UI

1. 예제 PDF 열기 → 도구 10개 순서 확인 → 도형 팝업 열기/닫기: 정상.
2. 상단 노트 → 두 페이지 → 이미지 추가 → 링크 추가 → 다른 페이지 필기: 정상. 중복 도구바 없음.
3. Alt+Print로 앱 화면 캡처 → Ctrl+V → 이미지 추가 → Ctrl+Z: 정상.
4. 지우개 → 4아이콘 확인 → 바깥 클릭: 닫힘. X/Esc/같은 도구 재클릭도 닫기 경로를 공유함.
5. 노트 닫기 → 이전 PDF → F5 발표 → N 노트 → N 복귀 → Esc 종료: 정상.
6. 노트 PDF 저장 → A4 2페이지, Poppler로 각 페이지 재렌더링: 용지·한글·이미지·필기 표시 정상.

1440×900급 창과 전체화면에서 관찰했습니다. 작은 창은 반응형 스타일을 적용했으나 이번 네이티브 창 크기 변경 자동화로 검증을 완료하지 못했으므로 별도 사용자 확인이 필요합니다.

## 변경 전후 근거

- 변경 전: `before.jpg`, 앞선 검토의 `../2026-11-08-v1.3/02-notebook.png`.
- `after-shapes.png`: 도형 8종, 상단 노트, PDF 복원/저장, 공통 메뉴.
- `after-eraser.png`: 작은 위쪽 지우개 팝업과 아이콘 4개.
- `after-note-content.png`: 왼쪽 목록, 2페이지 스프링 노트, 이미지·링크·필기, 공통 도구바.
- `after-paste.png`: 캡처 붙여넣기 기록.
- `after-slideshow.png`, `after-slideshow-note.png`: 발표와 노트 전환. 화면 우측 상단 FPS/GPU 표시는 소스에 없는 외부 성능 오버레이로 관찰됨.
- `note-export.pdf`: 검증 과정에서 실제 앱으로 저장한 2페이지 결과. 링크는 노트 앱에서는 열 수 있지만 PDF에는 문구로 평면화됨.

## 자동 검증

- `npm run build`: TypeScript/Vite 성공. 기존 500kB 초과 청크 크기 안내만 남음.
- `npm run lint`: 경고/오류 없음.
- `node scripts/v13-data.cjs`: 브라우저식 줌 단계, PDF 삭제/삽입/복사/이동/회전/저장, 필기 재매핑, undo/redo, 인쇄 범위 검사 통과.
- `node scripts/toolbar-notebook-data.cjs`: 화살촉 1:3, 점선, 필압·기울임 굵기, 안전한 링크, 이미지·스프링 노트 프로젝트 왕복 검사 통과.
- `cargo test --manifest-path src-tauri/Cargo.toml`: Rust 테스트 1개 통과.
- `npm run tauri:build -- --config src-tauri/tauri.review.conf.json`: Windows x64 실행/NSIS 패키지 생성.
- 예전 `scripts/v13-ui.cjs`는 원형 메뉴를 전제로 하므로 현행 검증으로 재사용하지 않고 보관함으로 이동.

## 남은 사용 환경 검토

- 실제 Windows Ink 펜의 필압·기울임·팜 터치 체감은 장치 테스트가 필요합니다. 마우스로는 고정 압력을 사용합니다.
- Google Drive 연결은 이번 범위에서 활성화하지 않았습니다.
- 노트와 삽입 이미지는 로컬 저장소 용량 제한의 영향을 받습니다. 20MB 이하 이미지를 긴 변 1600px로 보관하고 프로젝트 백업을 제공합니다.
- 링크는 HTTP/HTTPS만 허용하며 파일·스크립트 URL 및 자격 증명을 포함한 URL은 열지 않습니다.
- 링크 내보내기 PDF는 필기와 함께 평면화되어 PDF의 대화형 링크는 아닙니다.
- 설치 파일 생성까지 확인했으며 실제 설치/제거, Store 재패키징·제출은 수행하지 않았습니다.
- 브라우저 확장의 로컬 파일 권한 제한은 변경하지 않았으며 네이티브 검토 앱으로 PDF/이미지를 확인했습니다.

## 스프링 용지 자산

- 파일: `public/note-spring-paper.png`
- 생성 방식: 내장 image_gen 도구. 외부 업로드 없음.
- 프롬프트 요지: top-down blank warm ivory A4 portrait spiral notebook; slim realistic metal loops restricted to far-left 5%; subtle paper grain; no writing, rules, props or text; uniform light writable area.
- 넓은 필기 공간을 확보하고 UI 아이콘은 기존 lucide-react 체계를 유지했습니다.

## 보관·검토 파일

- `release/CrowShow-v1.3-Review2-x64.exe`: 설치 없이 실행하는 검토판.
- `release/CrowShow-v1.3-Review2-Setup-x64.exe`: 검토판 설치 파일.
- `release/CrowShow-v1.3-Review2-SHA256SUMS.txt`: 최종 파일 해시.
- 이전 소스·폐기한 컴포넌트·진단 스크립트: `D:\App coding\_archive\CrowShow-2026-11-08-toolbar-notebook`.
- 현행 사용법: `USER_GUIDE.md`. Review1 이력은 과거 기록으로 보존합니다.

최종 바이너리 재실행 확인: 로컬 노트·이미지·링크·필기 재로드, = 키 100→110%, 0 키 100% 복귀 및 Esc 팝업 닫기 정상. 최종 UI: final-note.png. 최종 실행 파일과 빌드 산출물의 SHA-256 일치 확인.

