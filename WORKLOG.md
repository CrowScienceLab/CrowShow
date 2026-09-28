# CrowShow 1.0 작업 기록 및 인계 안내

## 프로젝트 위치

`D:\App coding\CrowShow`

기존 `PDF player` 프로젝트를 `CrowShow`로 이름 변경했으며 병렬 사본은 만들지 않았습니다.

## 기술 구성

- React 19, TypeScript, Vite
- Mozilla PDF.js 기반 오프라인 PDF 렌더링
- Canvas 기반 필기·도형·텍스트·레이저·스포트라이트
- IndexedDB 기반 최근 PDF 보관
- LocalStorage 기반 필기·메모·설정 자동 저장
- `pdf-lib` 기반 필기 포함 PDF 내보내기

## 다른 Windows 컴퓨터에서 개발 실행

1. Node.js 20 이상을 설치합니다.
2. 프로젝트 폴더 전체를 복사합니다. `node_modules`와 `dist`는 복사하지 않아도 됩니다.
3. PowerShell에서 프로젝트 폴더로 이동합니다.
4. 아래 명령을 실행합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

5. 출력된 로컬 주소(보통 `http://localhost:5173`)를 Chrome 또는 Edge에서 엽니다.

PowerShell 실행 정책으로 `npm.ps1`이 차단될 수 있으므로 `npm.cmd`를 사용합니다.

## 빌드 및 검사

```powershell
npm.cmd run build
npm.cmd run lint
```

빌드 결과는 `dist`에 생성됩니다. 현재 버전은 웹 코어 1.0이며 Windows 설치 파일은
Tauri 패키징 단계에서 생성합니다. Android 작업은 Windows 앱 완료 이후 진행합니다.

Windows 배포 전에는 `DISTRIBUTION.md`의 Crow Science Lab 제작자 정보, GitHub SHA-256
검증 업데이트, 사용 안내, 미서명 설치 경고 및 사용자 선택형 PDF 연결 요구사항을 모두
구현하고 실제 설치 환경에서 검증해야 합니다.

## Windows Tauri 2 개발 환경

2026-09-28에 다음 환경 설치와 인식을 확인했습니다.

- Rustup `1.29.1`
- Rust `1.98.1` stable `x86_64-pc-windows-msvc`
- Cargo `1.98.1`
- Rustfmt 및 Clippy
- Visual Studio Build Tools 2022 / MSVC `14.44.35207`
- Windows SDK `10.0.26100.0`
- WebView2 Runtime `153.0.4234.48`
- `@tauri-apps/cli` `2.12.0`
- `@tauri-apps/api` `2.12.0`

새 터미널은 사용자 PATH의 `C:\Users\user\.cargo\bin`을 자동으로 사용합니다.

Android SDK는 기본 위치가 아닌 `C:\Android\Sdk`에 설치되어 있습니다. `ANDROID_HOME`,
`JAVA_HOME`, `NDK_HOME`과 SDK 도구 PATH를 사용자 환경변수로 연결했고 Android 36,
Build Tools 36.0.0, Platform Tools 37.0.1, NDK 28.2 및 Rust Android 대상 4종을 확인했습니다.

## CrowShow 1.0 주요 기능

- PDF 열기, 드래그 앤 드롭, 최근 파일 다시 열기
- 썸네일, 전체화면 발표, 좌우 이동 버튼, 마우스 휠 페이지 이동
- 펜, 형광펜, 지우개, 텍스트, 벡터 도형, 실행 취소·다시 실행
- 레이저 포인터, 스포트라이트, 블랙·화이트 화면
- 슬라이드별 전환 효과와 발표자 메모
- 자동 재생, 청중 분리 창, `.crowshow` 프로젝트 파일
- 필기 포함 PDF 내보내기

## 1.0 UI 수정 기록

- 텍스트 입력창을 넓히고 5줄 높이로 확대
- 입력창을 밝은 배경으로 변경하고 글자색 대비 테두리·그림자 적용
- 슬라이드 클릭 및 우클릭 페이지 이동 제거
- 휠 아래/위로 다음/이전 슬라이드 이동, Ctrl+휠은 확대·축소 유지
- 레이저 포인터를 단단한 원형에서 부드러운 확산 그라데이션으로 변경
- 검지손가락 도형을 Apache 2.0 Google Material `touch_app` 벡터로 교체
- 텍스트 객체의 한 점 판정 오류를 수정해 문장 영역 전체를 선택 가능하게 변경
- 텍스트 입력 완료 시 선택 도구로 자동 전환하여 즉시 이동·수정·개별 삭제 가능
- 레이저 포인터를 반지름 6px의 작은 방사형 그라데이션 점으로 축소

## 데이터 호환성

문서 ID는 PDF 내용의 SHA-256 지문으로 생성됩니다. 같은 PDF를 다시 열면 기존 필기와
메모가 연결됩니다. 브라우저 저장소를 삭제하면 자동 저장 데이터도 삭제되므로 중요한
수업 자료는 `.crowshow` 파일로 별도 내보내기 하십시오.

## 2026-09-29 Tauri v1.0 교체 작업

- `src-tauri`를 초기화하고 Windows 배포 런타임을 Tauri 2/WebView2로 전환
- 창 최소 크기를 1140×680으로 지정하고 일반 화면 도구와 PDF 파일명을 하단 2단 도크로 이동
- 환경설정을 2열 카드 구조로 줄이고 저장 기능을 도크의 풀다운 메뉴로 이동
- 형광펜 한 획을 단일 합성 경로로 렌더링하여 정지 시 농도 증가와 구간 줄무늬 제거
- GitHub 업데이트 확인, 공식 릴리스 주소 제한, 설치 파일 SHA-256 검증 후 실행 구현
- PDF 파일 연결 및 두 번째 실행에서 기존 창으로 PDF 전달 구현
- Electron 소스·빌드 도구·112MB 배포물은 삭제하지 않고 `D:\App coding\_archive`로 이동
- 최종 NSIS: `release\CrowShow-v1.0.0-Setup-x64.exe` (`3,593,699 bytes`)
- SHA-256: `1a8362ec8c95e2ff6d0d8813bd80b32666002fa900dd7fe6968b152b41063ec1`

# 2026-09-29 · CrowShow 1.0c UI revision

- 시작 화면을 전체 플레이어 배경 + 소형 PDF 열기 패널 구조로 교체
- Tauri WebView2의 네이티브 드롭 가로채기를 해제해 웹 PDF 드래그 앤 드롭 복구
- 체험용 슬라이드 진입 UI 제거
- 노란부리까마귀를 사실적인 투명 배경 이미지로 교체
- 상단 명령 바와 하단 상태·도구 바로 3단 메뉴를 2단 구조로 재편
- 전환음 선택지를 없음/부드러운 넘김/종이 넘김/짧은 클릭/차임으로 확대
- 환경설정에서 중복 레이저 색상 및 잔상 옵션 제거, 가로형 무스크롤 레이아웃 적용
- 사용자 표시 버전은 1.0c, 패키지 내부 SemVer는 1.0.2로 설정
- GitHub에는 게시하지 않고 로컬 NSIS 설치 패키지만 생성
