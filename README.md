# CrowShow

> PC판 2.0 개발판에서는 **문서 열기** 또는 끌어 놓기로 HWP·HWPX를 열 수 있습니다. 로컬에서 PDF로 변환해 기존 발표·필기 화면에 표시합니다. [2.0 변환 검증](docs/maintenance/2026-11-23-v2.0-hwp/REPORT.md)

> PC판 1.6의 변경점은 [1.6 릴리스 안내](docs/RELEASE-v1.6.0.md)에 있습니다. 공개 다운로드 버전은 아래 GitHub 또는 Microsoft Store에서 확인할 수 있습니다.

> 후속 작업: [전체 인계서](HANDOFF.md) · [다음 채팅 시작문](NEXT_CHAT_PROMPT.md). 사용자 확인(2026-11-10): Microsoft Store 심사 완료 후 배포 중.

PDF 발표·필기·Notebook을 위한 Windows PC 앱입니다. Crow Science Lab이 교실 수업과 강의에 맞춰 만들었습니다. 문서를 열고 필기하거나 발표하는 데 개발자 계정이나 인터넷 연결이 필요하지 않습니다.

[최신 GitHub 설치 파일](https://github.com/CrowScienceLab/CrowShow/releases/latest) · [Microsoft Store](https://apps.microsoft.com/detail/9N2G0ST27LBW) · [사용 방법](USER_GUIDE.md)

## 주요 기능

- PDF 수업 자료를 전체화면 슬라이드쇼로 발표하고, 썸네일·전환 효과·전환음·타이머·자동 재생·발표자 메모·별도 청중 창을 활용합니다.
- 펜·형광펜·텍스트·12종 도형으로 필기하며, 선택·사각 영역·올가미·객체/영역 지우기와 실행 취소·다시 실행을 지원합니다.
- 도형의 너비·높이·크기를 개별 조절하고 자유 회전·각도 입력·반전·복사·색상 변경을 사용합니다. 텍스트의 글꼴·굵게·기울임·밑줄·외곽선을 조합합니다.
- 레이저의 빛나는 점과 잔상, 검은 화면·흰 화면 가리기로 발표 흐름을 조절합니다. 편집·발표·노트에서 같은 하단 도구를 사용합니다.
- PDF와 노트의 너비 맞춤을 100%로 표시하고, 페이지 맞춤·단계별 확대·축소·스크롤·우클릭 드래그로 문서를 이동합니다.
- Notebook에서 여러 노트와 페이지를 관리합니다. 무지·줄·모눈·점·코넬·스프링 용지, 배경색, 한/두 페이지 보기, 이미지 붙여넣기·추가, 하이퍼링크와 PDF 가져오기를 지원합니다.
- 편집 가능한 .crownotebook 독립 파일, .crowshow 프로젝트, 필기 포함 PDF 및 노트 PDF로 저장합니다. PC용 Google Drive 동기화 폴더를 지정해 노트 파일을 보관하고 불러옵니다.
- PDF 페이지를 삽입·복사·회전·삭제하고 드래그로 순서를 바꾼 뒤 저장합니다. 인쇄 미리보기에서 페이지 범위·한 면의 장수·필기 포함·용지 방향을 선택합니다.
- 한글/CJK 문자 매핑·표준 글꼴·이미지/색상 리소스를 설치본에 포함합니다. 큰 PDF는 첫 페이지와 주변 썸네일부터 처리합니다.
- Dark·Light·밝은 Pink·밝은 Blue 테마, 기능·단축키 상세 도움말을 제공합니다.

## 시작하기

1. GitHub의 Windows x64 설치 파일 또는 Microsoft Store에서 설치합니다.
2. PDF를 열거나 창에 끌어 놓습니다. 1.6에서는 **노트 시작**으로 PDF 없이 필기할 수도 있습니다. PDF 페이지는 썸네일과 방향키로 이동합니다.
3. 하단 도구로 필기하고 F5로 발표합니다. N 또는 상단 노트 버튼으로 Notebook을 엽니다.
4. 중요한 작업은 .crowshow 프로젝트 또는 .crownotebook 파일로 저장합니다. 공유·인쇄에는 PDF를 내보냅니다.
5. 상단 ? 버튼에서 자세한 기능과 단축키를 확인합니다.

1.6은 작은 시작 창, 독립 Notebook, 캡슐 메뉴와 데스크 배경, Windows 설치 옵션을 추가했습니다. [1.6 변경점](docs/RELEASE-v1.6.0.md) · [1.5 변경점](docs/RELEASE-v1.5.0.md)

## 설치·개인정보

Windows 10 2004 이상 또는 Windows 11 x64와 WebView2 Runtime이 필요합니다. GitHub판은 SHA256SUMS.txt로 검증하며 현재 미서명입니다. Windows 보안을 해제하도록 요구하지 않습니다. [Windows 설치 안내](WINDOWS_SECURITY.md)

문서·필기·노트는 로컬에서 처리하며 개발자 서버로 전송하지 않습니다. 사용자가 Drive 동기화 폴더를 선택한 경우 PC용 Drive의 동기화 정책이 적용됩니다. [개인정보 처리방침](PRIVACY.md)

이 저장소는 PC판입니다. Android 모바일판은 CrowShow_m에서 별도로 관리합니다. [버전 내역](VERSION_HISTORY.md) · [개발 기록](PC_DEVELOPMENT_HISTORY.md) · [구조](ARCHITECTURE.md) · [검증 보고서](docs/maintenance/2026-11-10-v1.5/REPORT.md)
