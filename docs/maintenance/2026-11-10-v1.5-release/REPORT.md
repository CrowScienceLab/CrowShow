# CrowShow 1.5 배포 결과

기준일: 2026-11-10 한국 시간. 사용자가 GitHub·Microsoft Store 각각 패키징 및 업로드를 지시했습니다.

## GitHub: 공개 완료

- 릴리스: https://github.com/CrowScienceLab/CrowShow/releases/tag/v1.5.0
- 최신 정식 버전 API 응답: v1.5.0, draft=false, prerelease=false.
- 소스 및 태그 커밋: d20a4d2. 원격의 README 경로 수정 47f5956도 병합했습니다.
- 설치 파일: CrowShow-v1.5-Setup-x64.exe, 9,640,971 bytes.
- SHA-256: 4f22fcdac9daa54299a7556a3336e1aa5429a0957cb9577fcf60e26eb9adbb12.
- 표준 SHA256SUMS.txt 업로드 및 원격에서 다시 내려받은 내용 일치 확인.
- 릴리스 설명은 1.5 변경점뿐 아니라 PDF 발표·필기·도형·Notebook·인쇄·페이지 편집·오프라인 한글 리소스 등 주요 기능과 저장 호환 범위를 포함합니다. docs/RELEASE-v1.5.0.md와 동일합니다.
- 최종 테마 문구 및 4개 버튼 한 줄 배치를 포함한 정식 식별자 빌드입니다. .crownotebook JSON 형식은 변경하지 않았습니다.

## 설치 검증

- 사용자별 기존 설치판 1.2.0을 1.5.0으로 무인 업그레이드했습니다. NSIS 종료 코드 0.
- 설치 위치: C:\Users\user\AppData\Local\CrowShow\crowshow.exe.
- 설치된 파일 버전 1.5.0 확인.
- Windows PDF 기본 앱 ProgId는 설치 전후 ChromePDF로 동일했습니다.
- 검토판 1.5의 실제 화면/대량 필기 검증은 별도 2026-11-10-v1.5/REPORT.md에 보존했습니다. 정식판을 새로 실행한 UI 검증은 이 단계에서 시행하지 않았습니다.

## Microsoft Store: 패키지 완성, 업로드·제출 대기

- 제품: 9N2G0ST27LBW (CrowShow), 기존 제품은 Store 공개 상태입니다.
- 새 업데이트 초안: Submission 2, 1152921505702355870.
- 패키지: release/CrowShow-v1.5-Store-x64.msix, 10,546,028 bytes, 버전 1.5.0.0.
- SHA-256: 6ba7688f63cbbb2113dfaf84fd24af349c08f3ca4e9d946462109944c85a0fc3.
- Store 전용 식별자/기능으로 빌드했고 MakeAppx 패키지 생성 및 검증이 성공했습니다.
- 전체 기능 설명: store/LISTING-ko-KR-v1.5.txt.
- 새 버전 설명: store/WHATSNEW-ko-KR-v1.5.txt.
- 사용자가 만료된 Partner Center 로그인 세션을 복구했습니다. 기존 가격/가용성은 변경하지 않았으며 업데이트 초안을 만들었습니다.
- 파일 선택 API는 Chrome ChatGPT 확장의 파일 URL 접근 권한이 꺼져 있어 실패했습니다. 확장 권한을 자동으로 확대하지 않았습니다.
- Windows 파일 선택 창 경로를 시도하던 중 컴퓨터 제어가 현재 브라우저 URL을 충분히 확인하지 못해 이 턴의 Computer Use를 중단했습니다. 이를 우회하지 않았습니다.
- 따라서 MSIX 업로드, 신규 Store 설명 저장, 새 심사 제출은 아직 하지 않았습니다. 초안의 패키지는 여전히 기존 1.2 상태로 확인됐습니다.
- 업로드 재개 화면: https://partner.microsoft.com/ko-kr/dashboard/products/9N2G0ST27LBW/submissions/1152921505702355870/packages
- 기존 지시인 무료·한국만·심사 후 즉시 출시는 변경하지 않았습니다. 새 제출 전 해당 설정을 최종 확인해야 합니다.

## 보존과 다음 단계

GitHub 설치 파일과 Store MSIX는 서로 다른 빌드로 보존했습니다. GitHub에는 Store MSIX나 검토판 설치 파일을 섞어 올리지 않았습니다. 검증용 PDF/.crownotebook 원본은 소스 커밋에서 제외했습니다.

Store 업로드가 재개되면 1.5 MSIX 검증, 전체 제품 설명 및 새 버전 안내 저장, 무료·한국·심사 후 즉시 출시 확인 후 심사에 제출합니다. 이번 작업에서 Store 1.5가 공개됐다고 보고하지 않습니다.
