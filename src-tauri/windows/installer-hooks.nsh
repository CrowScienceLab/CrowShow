; Keep the CrowShow application icon unchanged and apply the presentation artwork
; only to the optional desktop shortcut created by the NSIS installer.
!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$DESKTOP\CrowShow.lnk" 0 desktop_shortcut_done
  Delete "$DESKTOP\CrowShow.lnk"
  CreateShortCut "$DESKTOP\CrowShow.lnk" "$INSTDIR\crowshow.exe" "" "$INSTDIR\resources\desktop-shortcut.ico" 0 SW_SHOWNORMAL "" "CrowShow PDF presentation player"
desktop_shortcut_done:
!macroend
