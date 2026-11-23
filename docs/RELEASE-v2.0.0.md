# CrowShow 2.0

## 변경 사항

- Windows용 CrowShow에서 **문서 열기** 또는 끌어 놓기로 PDF·HWP·HWPX를 엽니다. 한글 문서는 rhwp로 로컬 변환해 발표와 필기에 사용합니다.
- 조판 검사에서 경고가 없는 로컬 PDF 변환본을 재사용합니다. **환경 설정 → 캐시 없이 한글 문서 열기**에서 원본을 새로 변환하거나 **한글 변환 캐시 비우기**로 전체 변환 캐시를 비울 수 있습니다.
- **저장 → A4에 맞춰 PDF 저장**은 한글 문서의 각 페이지를 비율을 유지해 A4로 내보냅니다. 기본 PDF 저장은 원본 용지를 사용합니다.
- 조판 검사가 겹침을 감지하거나 확인을 완료하지 못하면, 한컴에서 저장한 PDF를 선택하거나 변환본을 열 수 있습니다.

## 설치와 배포

- Windows x64와 Microsoft Edge WebView2 Runtime이 필요합니다.
- GitHub 릴리스 태그는 `v2.0.0`입니다. 설치 파일은 `CrowShow-v2.0-Setup-x64.exe`이고 검증 파일은 `SHA256SUMS.txt`입니다.
- Microsoft Store 패키지는 `CrowShow-v2.0-Store-x64.msix`이며 패키지 버전은 `2.0.0.0`입니다.
- 다단 문서의 들여쓰기 때문에 그림과 선택지가 사라지는 조판 오류를 수정한 rhwp 0.9.1을 사용합니다. 적용 패치와 MIT 라이선스, 제3자 고지문을 함께 제공합니다.

공개 여부는 [2.0 검증 결과](maintenance/2026-11-23-v2.0-hwp/REPORT.md)를 기준으로 결정합니다.

## English

- Open HWP and HWPX documents through local PDF conversion and use them in the presentation and annotation tools.
- Reopen identical documents using the local conversion cache. Clear it from Settings.
- Export an A4 copy of a converted Hangul document with the original page proportions.
- When the layout check reports a problem, open the conversion or select a PDF exported from Hancom Hangul.
