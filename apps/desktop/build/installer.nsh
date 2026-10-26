# LeatherCAD's additions to electron-builder's NSIS installer (Windows, 8.6a).
#
# The installer asks (`oneClick: false` in electron-builder.config.mjs): the
# licence, for whom — this user or every user — and where, then the two
# choices below, a desktop shortcut and opening .lcp projects. The uninstaller
# asks whether to remove the maker's data as well. The words are English: so
# is the app, until a language is added under ADR 0018.
#
# Every macro here is one electron-builder inserts at a fixed point of its own
# script (templates/nsis in app-builder-lib); a Function a page needs is
# defined inside the macro that adds the page, so it is compiled only into the
# installer or the uninstaller that has the page.

!include FileFunc.nsh
!include nsDialogs.nsh

# The type electron-builder registers from `fileAssociations`: its extension,
# and its `name`, which becomes the file class. packaging.test.ts holds these
# to the configuration.
!define LCP_EXT "lcp"
!define LCP_FILE_CLASS "LeatherCAD project"

!ifndef BUILD_UNINSTALLER
  # The two choices, "1" or "0". A fresh install starts with both on; one over
  # an existing install starts from what that one chose, read in customInit,
  # before the old version's uninstaller deletes the key that holds them.
  Var lcDesktopShortcut
  Var lcOpenProjects
  Var lcDesktopShortcutBox
  Var lcOpenProjectsBox
!else
  Var lcDeleteData
  Var lcDeleteDataBox
!endif

!macro customInit
  # Up to 1.5 the installer put the app in %LOCALAPPDATA%\Programs\@leathercaddesktop,
  # a name taken from the workspace package. It is Programs\LeatherCAD now
  # (extraMetadata in electron-builder.config.mjs), but an update installs where
  # the registry says the last version is. So a version found in the old
  # directory moves: the new one goes beside it, in LeatherCAD, and the old one
  # is uninstalled as every old version is — which keeps the maker's settings,
  # recovery copies and log, in %APPDATA%\leathercad, and never touches their
  # projects. The Start menu and desktop shortcuts are made again; a taskbar pin
  # to the old path has to be pinned again.
  Push $R0
  Push $R1
  ${GetFileName} "$INSTDIR" $R0
  ${if} $R0 == "@leathercaddesktop"
    ${GetParent} "$INSTDIR" $R0
    StrCpy $INSTDIR "$R0\${APP_FILENAME}"
  ${endif}

  # One install per account. The page that asks for whom is never offered when
  # there is one already (customInstallMode); this stops /allusers or
  # /currentuser on the command line from making a second, in the other mode.
  # Where both exist from before, electron-builder's own choice stands.
  ${IfNot} ${UAC_IsInnerInstance}
    ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $installMode == "all"
    ${andIf} $R0 != ""
    ${andIf} $R1 == ""
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} is installed for you only. Uninstall it first to install it for every user." /SD IDOK
      SetErrorLevel 2
      Quit
    ${elseIf} $installMode == "CurrentUser"
    ${andIf} $R1 != ""
    ${andIf} $R0 == ""
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} is installed for every user. Uninstall it first to install it for you only." /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
  ${endIf}

  StrCpy $lcDesktopShortcut "1"
  StrCpy $lcOpenProjects "1"
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut
  ${if} $R0 == "0"
    StrCpy $lcDesktopShortcut "0"
  ${endif}
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" OpenProjects
  ${if} $R0 == "0"
    StrCpy $lcOpenProjects "0"
  ${endif}
  Pop $R1
  Pop $R0
!macroend

# Before the page that asks for whom: an existing install decides, and the page
# is skipped. Choosing the other mode would leave two copies, two entries in
# Installed apps, and .lcp projects opened by whichever registered last.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${if} $hasPerUserInstallation == "1"
    ${andIf} $hasPerMachineInstallation == "0"
      StrCpy $isForceCurrentInstall "1"
    ${elseIf} $hasPerMachineInstallation == "1"
    ${andIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${endif}
  !endif
!macroend

!macro customPageAfterChangeDir
  Page custom lcOptionsPageCreate lcOptionsPageLeave

  Function lcOptionsPageCreate
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Choose options" "Choose how ${PRODUCT_NAME} fits into Windows."
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateCheckbox} 0u 0u 100% 12u "Create a &desktop shortcut"
    Pop $lcDesktopShortcutBox
    ${if} $lcDesktopShortcut == "1"
      ${NSD_Check} $lcDesktopShortcutBox
    ${endif}

    ${NSD_CreateCheckbox} 0u 20u 100% 12u "&Open .${LCP_EXT} projects with ${PRODUCT_NAME} when double-clicked"
    Pop $lcOpenProjectsBox
    ${if} $lcOpenProjects == "1"
      ${NSD_Check} $lcOpenProjectsBox
    ${endif}

    nsDialogs::Show
  FunctionEnd

  Function lcOptionsPageLeave
    ${NSD_GetState} $lcDesktopShortcutBox $lcDesktopShortcut
    ${NSD_GetState} $lcOpenProjectsBox $lcOpenProjects
  FunctionEnd
!macroend

# electron-builder makes the desktop shortcut and registers .lcp on every
# install, so a choice of "no" is applied after it, and remembered.
!macro customInstall
  ${if} ${isNoDesktopShortcut}
    StrCpy $lcDesktopShortcut "0"
  ${endif}
  ${if} $lcDesktopShortcut == "0"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${endif}
  ${if} $lcOpenProjects == "0"
    !insertmacro APP_UNASSOCIATE "${LCP_EXT}" "${LCP_FILE_CLASS}"
    !insertmacro UPDATEFILEASSOC
  ${endif}
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut $lcDesktopShortcut
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" OpenProjects $lcOpenProjects
!macroend

# The uninstaller's second page: keep the maker's data, or remove it too. Off
# unless ticked, and never on an update, which uninstalls the old version
# silently.
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.lcDataPageCreate un.lcDataPageLeave

  Function un.lcDataPageCreate
    !insertmacro MUI_HEADER_TEXT "Your ${PRODUCT_NAME} data" "Choose whether to keep it."
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0u 0u 100% 30u "Your projects are never removed. Settings, your templates, recovery copies and the log are kept, for a later install, unless you choose otherwise."
    Pop $0

    ${NSD_CreateCheckbox} 0u 36u 100% 12u "&Remove settings, templates, recovery copies and the log as well"
    Pop $lcDeleteDataBox

    nsDialogs::Show
  FunctionEnd

  Function un.lcDataPageLeave
    ${NSD_GetState} $lcDeleteDataBox $lcDeleteData
  FunctionEnd
!macroend

# The directory is userData, which the main process names (docs/file-format.md
# §6). It is per user: removing it for an install for every user removes the
# data of the account that uninstalls.
!macro customUnInstall
  ${if} $lcDeleteData == "1"
  ${andIfNot} ${isUpdated}
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\leathercad"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endif}
!macroend
