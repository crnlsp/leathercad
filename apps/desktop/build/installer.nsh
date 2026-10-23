# LeatherCAD's additions to electron-builder's NSIS installer (Windows, 8.6a).
#
# Up to 1.5 the installer put the app in %LOCALAPPDATA%\Programs\@leathercaddesktop,
# a name taken from the workspace package. It is Programs\LeatherCAD now
# (extraMetadata in electron-builder.config.mjs), but an update installs where
# the registry says the last version is. So a version found in the old
# directory moves: the new one goes beside it, in LeatherCAD, and the old one
# is uninstalled as every old version is — which keeps the maker's settings,
# recovery copies and log, in %APPDATA%\leathercad, and never touches their
# projects. The Start menu and desktop shortcuts are made again; a taskbar pin
# to the old path has to be pinned again.

!include FileFunc.nsh

!macro customInit
  Push $R0
  ${GetFileName} "$INSTDIR" $R0
  ${if} $R0 == "@leathercaddesktop"
    ${GetParent} "$INSTDIR" $R0
    StrCpy $INSTDIR "$R0\${APP_FILENAME}"
  ${endif}
  Pop $R0
!macroend
