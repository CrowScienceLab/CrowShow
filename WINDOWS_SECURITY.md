# Windows 설치 보안 안내

CrowShow 1.0 설치 파일은 초기 무료 배포판으로 코드 서명 인증서가 없습니다. 따라서 Windows에서
Microsoft Defender SmartScreen의 `Windows의 PC 보호` 또는 Smart App Control 경고가 나타날 수
있습니다.

- 공식 배포처는 <https://github.com/CrowScienceLab/CrowShow/releases>뿐입니다.
- 설치 전 릴리스의 `SHA256SUMS.txt`와 다운로드 파일의 SHA-256을 비교하십시오.
- 파일 해시가 다르거나 출처가 확실하지 않으면 실행하지 마십시오.
- CrowShow는 Defender, SmartScreen 또는 Smart App Control을 끄도록 요구하거나 변경하지 않습니다.
- 학교·기관 관리 PC에서 차단되면 보안 설정을 변경하지 말고 기관 관리자 정책을 따르십시오.

## PowerShell에서 SHA-256 확인

```powershell
Get-FileHash .\CrowShow-v1.0.0-Setup-x64.exe -Algorithm SHA256
```

출력값이 같은 릴리스의 `SHA256SUMS.txt`와 완전히 일치할 때만 공식 파일로 판단할 수 있습니다.
