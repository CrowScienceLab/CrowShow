# CrowShow Windows 배포 명세

이 문서는 CrowShow Windows 패키징 전에 반드시 반영할 배포 요구사항이다.

## 제품 식별 정보

- 제품명: `CrowShow`
- 제품 버전: `1.0.0`
- 표시 제작자: `Crow Science Lab`
- GitHub 조직: `CrowScienceLab`
- GitHub 저장소: `https://github.com/CrowScienceLab/CrowShow`
- Windows 앱 식별자: `CrowScienceLab.CrowShow`
- 설치 경로: `%ProgramFiles%\Crow Science Lab\CrowShow`

## 업데이트

CrowLink, CrowEyes, Crow Pack과 같은 흐름을 사용한다.

1. 앱 실행 후 백그라운드에서 GitHub의 `CrowScienceLab/CrowShow` 최신 릴리스를 확인한다.
2. 현재 버전보다 높은 정식 버전이 있을 때만 사용자에게 알린다.
3. 사용자가 승인하면 공식 GitHub 릴리스의 Windows 설치 파일을 임시 폴더에 다운로드한다.
4. 릴리스의 `SHA256SUMS.txt`와 설치 파일의 SHA-256을 비교한다.
5. 파일명, 다운로드 URL, 크기 및 SHA-256 검증이 모두 성공한 경우에만 설치 실행을 다시 확인한다.
6. 검증 실패 시 파일을 실행하지 않고 오류를 안내한다.
7. 설정 화면에 `업데이트 확인` 버튼과 현재 버전을 표시한다.

자동 업데이트는 Windows 보안 설정을 변경하거나 경고를 우회하지 않는다. 오프라인에서는
업데이트 확인 실패가 앱 실행이나 PDF 수업 기능을 방해하지 않아야 한다.

## 사용 방법 안내

- 첫 실행 시 짧은 시작 안내를 제공한다.
- 앱 내부 `도움말`에서 PDF 열기, 페이지 이동, 필기, 텍스트, 도형, 레이저,
  스포트라이트, 전체화면, 프로젝트 저장 및 단축키를 확인할 수 있어야 한다.
- GitHub README와 설치 프로그램에도 동일한 한국어 기본 사용법을 포함한다.
- 앱의 정보 화면에 제품 버전, 제작자, 공식 GitHub 주소를 표시한다.

## Windows 설치 보안 안내

초기 무료 배포판은 코드 서명 인증서가 없으면 Microsoft Defender SmartScreen 또는
Smart App Control 경고가 표시될 수 있다. 설치 화면과 GitHub 릴리스에 다음을 명확히
안내한다.

- 공식 배포처는 `https://github.com/CrowScienceLab/CrowShow/releases`뿐이다.
- 사용자는 릴리스에 게시된 SHA-256과 다운로드 파일을 확인할 수 있다.
- 제작자를 확인할 수 없거나 해시가 다르면 실행하지 않는다.
- CrowShow는 Windows 보안 기능을 끄도록 요구하거나 자동 변경하지 않는다.
- 학교·기관 관리 PC에서 실행이 차단되면 기관 관리자 정책을 따른다.

## PDF 확장자 연결

- 설치 프로그램은 CrowShow를 Windows의 PDF 열기 가능 앱으로 등록한다.
- ProgID는 `CrowShow.PDF`, 표시 이름은 `CrowShow PDF Presentation`으로 한다.
- 기존 PDF 기본 앱을 설치 과정에서 강제로 변경하지 않는다.
- 설치 완료 화면과 CrowShow 설정에 `PDF 기본 앱 설정` 안내 버튼을 제공한다.
- 사용자가 동의하면 Windows 기본 앱 설정 화면을 열어 CrowShow를 직접 선택하게 한다.
- 파일 탐색기의 `연결 프로그램` 목록에서도 CrowShow를 선택할 수 있어야 한다.
- `CrowShow.exe "%1"`로 전달된 PDF 경로를 시작 시 열도록 구현한다.
- 제거 시 CrowShow가 등록한 항목만 정리하고 다른 PDF 앱의 설정은 변경하지 않는다.

## GitHub 릴리스 구성

`v1.0.0` 릴리스에는 최소한 다음 파일을 게시한다.

- `CrowShow-v1.0.0-Setup-x64.exe`
- `SHA256SUMS.txt`
- 한국어 사용 안내 또는 README 링크
- Windows 미서명 설치 경고 안내
- 변경 사항과 알려진 제한 사항

GitHub 저장소와 릴리스는 Windows 설치 프로그램, 업데이트 검사, PDF 연결 및 실제 설치
검증이 완료된 뒤 공개한다.
