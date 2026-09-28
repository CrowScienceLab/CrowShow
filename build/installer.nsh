!macro customInstall
  ; Register CrowShow as a PDF-capable application without replacing the
  ; user's existing Windows UserChoice/default PDF handler.
  WriteRegStr SHCTX "Software\Classes\CrowShow.PDF" "" "CrowShow PDF Presentation"
  WriteRegStr SHCTX "Software\Classes\CrowShow.PDF\DefaultIcon" "" "$INSTDIR\CrowShow.exe,0"
  WriteRegStr SHCTX "Software\Classes\CrowShow.PDF\shell\open" "" "Open with CrowShow"
  WriteRegStr SHCTX "Software\Classes\CrowShow.PDF\shell\open\command" "" `"$INSTDIR\CrowShow.exe" "%1"`
  WriteRegNone SHCTX "Software\Classes\.pdf\OpenWithProgids" "CrowShow.PDF"

  WriteRegStr SHCTX "Software\Classes\Applications\CrowShow.exe" "FriendlyAppName" "CrowShow"
  WriteRegStr SHCTX "Software\Classes\Applications\CrowShow.exe\shell\open\command" "" `"$INSTDIR\CrowShow.exe" "%1"`
  WriteRegStr SHCTX "Software\Classes\Applications\CrowShow.exe\SupportedTypes" ".pdf" ""

  WriteRegStr SHCTX "Software\Crow Science Lab\CrowShow\Capabilities" "ApplicationName" "CrowShow"
  WriteRegStr SHCTX "Software\Crow Science Lab\CrowShow\Capabilities" "ApplicationDescription" "Offline PDF presentation player for classrooms"
  WriteRegStr SHCTX "Software\Crow Science Lab\CrowShow\Capabilities" "ApplicationIcon" "$INSTDIR\CrowShow.exe,0"
  WriteRegStr SHCTX "Software\Crow Science Lab\CrowShow\Capabilities\FileAssociations" ".pdf" "CrowShow.PDF"
  WriteRegStr SHCTX "Software\RegisteredApplications" "CrowShow" "Software\Crow Science Lab\CrowShow\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\RegisteredApplications" "CrowShow"
  DeleteRegKey SHCTX "Software\Crow Science Lab\CrowShow\Capabilities"
  DeleteRegKey SHCTX "Software\Crow Science Lab\CrowShow"
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "CrowShow.PDF"
  DeleteRegKey SHCTX "Software\Classes\Applications\CrowShow.exe"
  DeleteRegKey SHCTX "Software\Classes\CrowShow.PDF"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
