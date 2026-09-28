# CrowShow v1.0.0 Windows 패키징 보고서

- 작업일: 2026-09-28
- 제작자: Crow Science Lab
- 대상: Windows x64
- 패키징: Electron 44.4.5 / electron-builder 26.15.3 / NSIS

## 결과물

- 파일: `CrowShow-v1.0.0-Setup-x64.exe`
- 크기: 112,067,740 bytes (106.88 MiB)
- SHA-256: `5fe1646ee068cfbb68d4e33a577052f53ebe75f4e68f97c507f05a6ccbeb0384`
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
- 설치 전 실행본 6초 스모크 테스트: 프로세스 응답 상태 정상
- 실행 파일 제품 버전: `1.0.0.0`
- 실행 파일 회사명: `Crow Science Lab`
- NSIS 사용자 선택형 PDF 등록 스크립트 컴파일: 통과
- 최종 설치 파일 SHA-256 재계산: 통과

## 보안 안내

현재 설치 파일은 코드 서명 인증서가 없어 Windows SmartScreen 또는 Smart App Control 경고가
표시될 수 있다. Windows 보안 기능을 끄도록 안내하지 않으며, 공식 GitHub 배포처와 SHA-256
확인을 기본 설치 안전 절차로 제공한다.
