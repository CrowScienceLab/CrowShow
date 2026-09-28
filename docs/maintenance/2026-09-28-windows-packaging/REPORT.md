# CrowShow v1.0.0 Windows 패키징 보고서

- 작업일: 2026-09-28
- 제작자: Crow Science Lab
- 대상: Windows x64
- 패키징: Electron 44.4.5 / electron-builder 26.15.3 / NSIS

## 결과물

- 파일: `CrowShow-v1.0.0-Setup-x64.exe`
- 크기: 112,067,742 bytes (106.88 MiB)
- SHA-256: `1c47691852feb65e0554b5ee17e6f00115743ae63e80d40fa0a8cf3fab42863f`
- 코드 서명: 없음

## 포함된 Windows 기능

- 제작자·제품 버전 메타데이터
- 앱 시작 시 GitHub 최신 정식 릴리스 확인
- 사용자 승인 후 공식 설치 파일 다운로드
- `SHA256SUMS.txt` 검증 성공 시에만 설치 실행
- 오프라인 업데이트 실패가 PDF 실행을 방해하지 않는 예외 처리
- `CrowShow.PDF` ProgID와 RegisteredApplications 등록
- 기존 PDF 기본 앱을 강제로 변경하지 않는 `연결 프로그램` 등록
- Windows 기본 앱 설정 화면 안내 버튼
- 탐색기에서 전달된 PDF 및 두 번째 실행의 PDF 열기
- 앱 내부 빠른 사용 안내

## 검증

- `npm.cmd run build`: 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run dist:win`: 통과
- 설치 전 실행본 자동 화면 스모크 테스트: 시작 화면 문구·스크립트·데스크톱 브리지 로드 확인
- 실행 파일 제품 버전: `1.0.0.0`
- 실행 파일 회사명: `Crow Science Lab`
- NSIS 사용자 선택형 PDF 등록 스크립트 컴파일: 통과
- 최종 설치 파일 SHA-256 재계산: 통과

## 패키징 결함 수정

최초 업로드 파일은 Vite 자산 URL이 `/assets/...` 절대경로여서 Electron의 `file://` 실행에서
빈 화면이 표시되는 결함이 있었다. Vite의 패키지 기준 경로를 `./`로 변경하고 favicon 경로도
상대경로로 수정했다. 기본 Electron 메뉴를 제거하고 앱 이름을 `CrowShow`로 통일했다.

재발 방지를 위해 패키지 실행본에 원격 디버그 검사를 연결하여 다음 항목을 자동 검증한다.

- 문서 로드 상태가 `complete`인지 확인
- CrowShow 시작 화면의 실제 문구 확인
- 렌더러 스크립트 로드 확인
- Electron preload 데스크톱 브리지 확인

## 보안 안내

현재 설치 파일은 코드 서명 인증서가 없어 Windows SmartScreen 또는 Smart App Control 경고가
표시될 수 있다. Windows 보안 기능을 끄도록 안내하지 않으며, 공식 GitHub 배포처와 SHA-256
확인을 기본 설치 안전 절차로 제공한다.
