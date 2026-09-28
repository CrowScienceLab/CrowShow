# CrowShow 핵심 기능 확장 보고서

## 작업 범위

- 프로젝트 폴더를 `PDF player`에서 `CrowShow`로 변경
- 시스템 기본 글꼴 적용 및 전용 글꼴 강제 지정 제거
- 시작 화면 복원과 앱 전체 PDF 드래그 앤 드롭 지원
- IndexedDB 기반 최근 PDF 보관 및 실제 다시 열기
- 확대 화면 이동, Ctrl+휠 확대, 위치 초기화
- 슬라이드별 발표자 메모 자동 저장
- Windows 시스템 테마 실시간 연동
- 스타일러스 압력 굵기 반영과 레이저 잔상 설정 연결
- 발표 중 빈 화면 클릭으로 다음 슬라이드 이동
- 슬라이드별 전환 효과 저장 및 `.crowshow` 포함
- 발표 자동 재생, 간격 설정, 반복 재생
- 별도 청중 창과 발표자 창 동기화
- 필기·도형·텍스트가 포함된 새 PDF 내보내기

## 데이터 보존 구조

- PDF 원본: IndexedDB `crowshow_documents`
- 필기: LocalStorage `crowshow_annotations_<document-id>`
- 발표자 메모: LocalStorage `crowshow_notes_<document-id>`
- 슬라이드별 전환: LocalStorage `crowshow_transitions_<document-id>`
- 문서 ID: PDF 바이트의 SHA-256 지문 기반

## 검증 결과

- `npm run build`: 통과
- `npm run lint`: 경고 및 오류 없이 통과
- `npm audit`: 취약점 0건
- 브라우저 확인: 시작 화면 표시, 샘플 5페이지 로드, 썸네일 및 본문 PDF 렌더링 정상

## 다음 단계

- Tauri 2 기반 Windows `.exe` / `.msi` 패키징
- 대용량 PDF에서 필기 포함 PDF 내보내기 성능 측정
- 실제 듀얼 모니터와 스타일러스 장치에서 현장 검증
- Windows 앱 안정화 이후 Android 패키징 진행
