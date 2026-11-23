!include "nsDialogs.nsh"

!define CROWSHOW_PDF_PROGID "CrowScienceLab.CrowShow.PDF"
!define CROWSHOW_PDF_EXTENSION "Software\Classes\.pdf"
!define CROWSHOW_PDF_CLASS "Software\Classes\${CROWSHOW_PDF_PROGID}"
!define CROWSHOW_LEGACY_CLASS "Software\Classes\PDF document"

!macro CROWSHOW_LEGACY_COMMANDS
  StrCpy $R4 '$INSTDIR\${MAINBINARYNAME}.exe "%1"'
  StrCpy $R5 '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro CROWSHOW_INSTALL_OPTIONS
  Var CrowShowDesktop
  Var CrowShowPdf
  Var CrowShowDesktopCheckbox
  Var CrowShowPdfCheckbox
  Var CrowShowLegacyPdf
  Var CrowShowPreviousPdfClass
  Var CrowShowLegacyPdfBackup

  Page custom CrowShowOptionsShow CrowShowOptionsLeave

  Function CrowShowOptionsShow
    Call SkipIfPassive
    !insertmacro MUI_HEADER_TEXT "$(CrowShowOptionsTitle)" "$(CrowShowOptionsDescription)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateCheckbox} 0 8u 100% 13u "$(CrowShowDesktopOption)"
    Pop $CrowShowDesktopCheckbox
    ${NSD_SetState} $CrowShowDesktopCheckbox $CrowShowDesktop
    ${NSD_CreateCheckbox} 0 30u 100% 13u "$(CrowShowPdfOption)"
    Pop $CrowShowPdfCheckbox
    ${NSD_SetState} $CrowShowPdfCheckbox $CrowShowPdf
    ${NSD_CreateLabel} 10u 48u 93% 28u "$(CrowShowPdfDescription)"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function CrowShowOptionsLeave
    ${NSD_GetState} $CrowShowDesktopCheckbox $CrowShowDesktop
    ${NSD_GetState} $CrowShowPdfCheckbox $CrowShowPdf
  FunctionEnd

  Function CrowShowLoadInstallOptions
    StrCpy $CrowShowDesktop ${BST_UNCHECKED}
    ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $CrowShowDesktop
    ${EndIf}
    ReadRegDWORD $CrowShowPdf SHCTX "${MANUPRODUCTKEY}" "OfferPdfOpenWith"
    ${If} $CrowShowPdf != ${BST_CHECKED}
      StrCpy $CrowShowPdf ${BST_UNCHECKED}
    ${EndIf}

    ; Capture ownership before an earlier uninstaller can remove the old ProgID.
    StrCpy $CrowShowLegacyPdf 0
    !insertmacro CROWSHOW_LEGACY_COMMANDS
    ReadRegStr $0 SHCTX "${CROWSHOW_LEGACY_CLASS}\shell\open\command" ""
    ${If} $0 == $R4
    ${OrIf} $0 == $R5
      StrCpy $CrowShowLegacyPdf 1
    ${ElseIf} $0 == ""
      ; The old uninstaller may already have removed the handler while leaving
      ; a dangling default and its backup. Only recover it for a known install.
      ReadRegStr $1 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $2 SHCTX "${CROWSHOW_PDF_EXTENSION}" ""
      ReadRegStr $3 HKCR "PDF document\shell\open\command" ""
      ReadRegStr $R3 HKCR "PDF document\DefaultIcon" ""
      ${If} $1 == $INSTDIR
      ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ${AndIf} $2 == "PDF document"
      ${AndIf} $3 == ""
      ${AndIf} $R3 == ""
        ClearErrors
        ReadRegStr $1 SHCTX "${CROWSHOW_PDF_EXTENSION}" "PDF document_backup"
        ${IfNot} ${Errors}
          StrCpy $CrowShowLegacyPdf 1
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} $CrowShowLegacyPdf == 1
      ReadRegStr $CrowShowPreviousPdfClass SHCTX "${CROWSHOW_PDF_EXTENSION}" ""
      ReadRegStr $CrowShowLegacyPdfBackup SHCTX "${CROWSHOW_PDF_EXTENSION}" "PDF document_backup"
    ${EndIf}
  FunctionEnd

  Function CrowShowRestoreLegacyPdf
    ${If} $CrowShowLegacyPdf != 1
      Return
    ${EndIf}
    !insertmacro CROWSHOW_LEGACY_COMMANDS
    ReadRegStr $2 SHCTX "${CROWSHOW_LEGACY_CLASS}\shell\open\command" ""
    ${If} $2 != ""
    ${AndIf} $2 != $R4
    ${AndIf} $2 != $R5
      Return
    ${EndIf}
    ReadRegStr $0 SHCTX "${CROWSHOW_PDF_EXTENSION}" ""
    ${If} $0 == "PDF document"
    ${OrIf} $0 == $CrowShowLegacyPdfBackup
      StrCpy $1 $CrowShowPreviousPdfClass
      ${If} $1 == "PDF document"
        StrCpy $1 $CrowShowLegacyPdfBackup
      ${EndIf}
      ${If} $1 == ""
      ${OrIf} $1 == "PDF document"
        ; A repeated old install could back up its own ProgID. Fall through to the system association.
        DeleteRegValue SHCTX "${CROWSHOW_PDF_EXTENSION}" ""
      ${Else}
        WriteRegStr SHCTX "${CROWSHOW_PDF_EXTENSION}" "" "$1"
      ${EndIf}
    ${EndIf}
    ${If} $2 != ""
      DeleteRegKey SHCTX "${CROWSHOW_LEGACY_CLASS}"
    ${EndIf}
    DeleteRegValue SHCTX "${CROWSHOW_PDF_EXTENSION}" "PDF document_backup"
  FunctionEnd

  Function CrowShowUpdateDesktopShortcut
    ${If} $NoShortcutMode = 1
      Return
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $0
      ${If} $0 != 1
        Return
      ${EndIf}
    ${ElseIf} $CrowShowDesktop != ${BST_CHECKED}
      Return
    ${EndIf}
    CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\resources\desktop-shortcut-alpha.ico" 0 SW_SHOWNORMAL "" "CrowShow PDF presentation player"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  FunctionEnd
!macroend

!macro CROWSHOW_OPTIONS_LANGUAGE
  LangString CrowShowOptionsTitle ${LANG_KOREAN} "설치 옵션"
  LangString CrowShowOptionsDescription ${LANG_KOREAN} "사용할 옵션을 선택하세요."
  LangString CrowShowDesktopOption ${LANG_KOREAN} "바탕 화면에 CrowShow 바로가기 만들기"
  LangString CrowShowPdfOption ${LANG_KOREAN} "PDF 연결 프로그램 목록에 CrowShow 추가"
  LangString CrowShowPdfDescription ${LANG_KOREAN} "현재 PDF 기본 앱과 아이콘은 유지됩니다. 기본 앱은 Windows 설정에서 선택할 수 있습니다."

  LangString CrowShowOptionsTitle ${LANG_ENGLISH} "Installation options"
  LangString CrowShowOptionsDescription ${LANG_ENGLISH} "Choose the options you want to use."
  LangString CrowShowDesktopOption ${LANG_ENGLISH} "Create a CrowShow desktop shortcut"
  LangString CrowShowPdfOption ${LANG_ENGLISH} "Add CrowShow to Open with for PDF files"
  LangString CrowShowPdfDescription ${LANG_ENGLISH} "Your current PDF app and icon stay the same. You can choose your default app in Windows Settings."
!macroend

!macro CROWSHOW_REMOVE_PDF_OPEN_WITH
  DeleteRegValue SHCTX "${CROWSHOW_PDF_EXTENSION}\OpenWithProgids" "${CROWSHOW_PDF_PROGID}"
  DeleteRegKey SHCTX "${CROWSHOW_PDF_CLASS}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}"
  DeleteRegKey SHCTX "${MANUPRODUCTKEY}\Capabilities"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Call CrowShowRestoreLegacyPdf
  Call CrowShowUpdateDesktopShortcut

  ${If} $CrowShowPdf == ${BST_CHECKED}
    ; Register a candidate for Open With without setting .pdf or UserChoice.
    WriteRegStr SHCTX "${CROWSHOW_PDF_CLASS}" "" "PDF document"
    WriteRegExpandStr SHCTX "${CROWSHOW_PDF_CLASS}\DefaultIcon" "" "%SystemRoot%\System32\imageres.dll,-2"
    WriteRegStr SHCTX "${CROWSHOW_PDF_CLASS}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
    WriteRegStr SHCTX "${CROWSHOW_PDF_EXTENSION}\OpenWithProgids" "${CROWSHOW_PDF_PROGID}" ""
    WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
    WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities" "ApplicationDescription" "CrowShow PDF presentation player"
    WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities\FileAssociations" ".pdf" "${CROWSHOW_PDF_PROGID}"
    WriteRegStr SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}" "${MANUPRODUCTKEY}\Capabilities"
  ${Else}
    !insertmacro CROWSHOW_REMOVE_PDF_OPEN_WITH
  ${EndIf}
  WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "OfferPdfOpenWith" $CrowShowPdf
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode != 1
    !insertmacro CROWSHOW_REMOVE_PDF_OPEN_WITH
    !insertmacro UPDATEFILEASSOC
  ${EndIf}
  ; Remove the old packaged icon on uninstall after upgrading with /UPDATE.
  Delete "$INSTDIR\resources\desktop-shortcut.ico"
!macroend
