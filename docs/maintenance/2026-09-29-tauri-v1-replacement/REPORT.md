# CrowShow v1.0 Tauri/WebView2 교체 보고서

## 결과

- 기존 Electron/Chromium 설치 파일을 Tauri 2/WebView2 NSIS 설치 파일로 교체했습니다.
- 설치 파일 크기는 `112,067,742 bytes`에서 `3,593,699 bytes`로 감소했습니다.
- 앱 표시 버전과 패키지 버전은 각각 `v1.0`, `1.0.0`입니다.

## 주요 수정

- 일반 화면의 상단 도구 모음을 하단 2단 도크로 이동하고 PDF 파일명·버전을 함께 표시
- 최소 창 크기 1140×680 적용 및 한글 버튼 줄바꿈 방지
- 환경설정 창을 2열 카드 구조와 제한 높이로 축소
- 삭제 버튼 옆 저장 풀다운에 `필기 포함 PDF`, `내보내기`, `가져오기` 배치
- 형광펜을 획당 한 번만 합성해 정지 시 진해짐과 경로 줄무늬 제거
- Tauri 단일 인스턴스, PDF 파일 연결, GitHub 업데이트 확인과 SHA-256 검증 구현

## 검증

- `npm run build`: 통과
- `npm run lint`: 통과
- `cargo check --manifest-path src-tauri/Cargo.toml`: 통과
- `npm run tauri:build`: 통과
- 릴리스 실행 파일의 Windows 창 생성: 통과 (`MainWindowTitle: CrowShow`)
- 1280px UI에서 모든 하단 도구 노출, 설정 모달, 저장 풀다운, 형광펜 균일 획 시각 확인

## 배포물

- `release/CrowShow-v1.0.0-Setup-x64.exe`
- 크기: `3,593,699 bytes`
- SHA-256: `1a8362ec8c95e2ff6d0d8813bd80b32666002fa900dd7fe6968b152b41063ec1`
- `release/SHA256SUMS.txt`

이전 Electron 소스와 배포물은 복구 가능하도록 `D:\App coding\_archive`에 보관했습니다.
