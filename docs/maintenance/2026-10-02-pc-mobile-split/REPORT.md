# CrowShow PC·모바일 프로젝트 분리 보고서

작업일: 2026-10-02

## 분리 결과

- `D:\App coding\CrowShow`: Windows PC판 1.0f 전용
- `D:\App coding\CrowShow_m`: Android 모바일판 전용

PC판 Git HEAD `f8d616a` 이후 작업 트리에 있던 Android 초기화 코드, 모바일 반응형 UI,
Android Gradle 프로젝트와 모바일 검증 자료를 `CrowShow_m`으로 옮겼습니다. PC판의 추적
파일은 1.0f 상태로 복원했고, PC 개발 경과는 루트의 `PC_DEVELOPMENT_HISTORY.md`에
정리했습니다.

## PC판 정리

- 모바일 전용 `src-tauri/gen/android` 제거
- 모바일 빌드 스크립트와 모바일 개발 문서 제거
- Android Rust 타깃 빌드 캐시 제거
- PC용 `package.json`, Rust 진입점, 데스크톱 브리지와 UI 스타일을 1.0f로 복원
- 오래된 1.0.0, 1.0c, 1.0e 설치 파일과 체크섬을 아카이브로 이동
- 최종 1.0f 설치 파일과 체크섬만 `release`에 유지

## 모바일판 정리

- PC판 1.0f 공통 코어에 기존 모바일 변경을 적용
- Windows NSIS 문서, 설치 후크와 과거 PC 유지보수 보고서를 제외
- Android 전용 npm 명령과 Tauri 번들 설정 적용
- 모바일 README, 개발 가이드, 기능 현황과 사용자 안내 작성
- 별도 Node 의존성 설치 및 x86_64 Android APK 재생성

## 검증

### PC판

- `npm run build`: 통과
- `npm run lint`: 통과
- `node scripts/regression.cjs`: 통과
- `cargo check --manifest-path src-tauri/Cargo.toml`: 통과

### 모바일판

- `npm ci`: 통과
- `npm run build`: 통과
- `npm run lint`: 통과
- `cargo check --manifest-path src-tauri/Cargo.toml`: 통과
- `npm run android:build:debug`: 통과
- 생성 APK: `CrowShow_m\src-tauri\gen\android\app\build\outputs\apk\x86_64\debug\app-x86_64-debug.apk`

## 보관 위치

복구용 PC 1.0f 기준 ZIP, 모바일에서 제외한 PC 자료, PC에서 옮긴 모바일 자료와 이전
설치 파일은 `D:\App coding\_archive\CrowShow-split-2026-10-02`에 보관했습니다.
