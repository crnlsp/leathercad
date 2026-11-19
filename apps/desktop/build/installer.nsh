# Additions to electron-builder's NSIS installer, which includes this file
# (nsis.include's default) on Windows. The installer is assisted (R12; the
# installer spec, docs/superpowers/specs/2026-11-03-windows-installer-and-
# distribution-design.md §3): it asks for whom and where. What is here guards
# both, so the maker's files are never inside what an uninstall removes, and
# takes the .lcp type away on uninstall. Nothing here touches %APPDATA%.

# .lcp is registered for this user on install: `.lcp` names the ProgID, the
# ProgID names the app. electron-builder's uninstaller (APP_UNASSOCIATE)
# removes the ProgID and the OpenWithProgids entry but leaves `.lcp` naming
# the ProgID it removed, so after an uninstall a project double-clicked still
# points at LeatherCAD, now gone (found by R13's CI job). This takes the name
# away when it is still LeatherCAD's — another program may have claimed .lcp
# since — and the key when nothing else is left in it. Not on an update: the
# new version's installer runs the old uninstaller, and the type must survive.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.lcp" ""
    ${if} $R0 == "LeatherCAD project"
      DeleteRegValue SHELL_CONTEXT "Software\Classes\.lcp" ""
    ${endif}
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.lcp\OpenWithProgids" "LeatherCAD project"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.lcp\OpenWithProgids"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.lcp"
  ${endif}
!macroend

!ifndef BUILD_UNINSTALLER

# The folder page says what the guard below wants, in each language the
# installer speaks (nsis.installerLanguages: the app's own). The numbers are
# the languages' LCIDs, as electron-builder's own messages use.
LangString leathercadFolderRule 1033 "LeatherCAD will be installed in the folder below. Choose a folder that is new, empty or holds an earlier LeatherCAD: uninstalling removes the folder and everything in it."
LangString leathercadFolderRule 1045 "LeatherCAD zostanie zainstalowany w poniższym folderze. Wybierz folder nowy, pusty lub z wcześniejszą wersją LeatherCAD: odinstalowanie usuwa folder wraz z całą zawartością."
LangString leathercadFolderRule 1031 "LeatherCAD wird in den folgenden Ordner installiert. Wählen Sie einen neuen oder leeren Ordner oder einen mit einer früheren LeatherCAD-Installation: Beim Deinstallieren wird der Ordner mit seinem gesamten Inhalt entfernt."
LangString leathercadFolderRule 1049 "LeatherCAD будет установлен в указанную ниже папку. Выберите новую или пустую папку либо папку с прежней установкой LeatherCAD: при удалении программы папка удаляется вместе со всем содержимым."
LangString leathercadFolderRule 1036 "LeatherCAD sera installé dans le dossier ci-dessous. Choisissez un dossier nouveau, vide ou contenant déjà LeatherCAD : la désinstallation supprime le dossier et tout son contenu."
LangString leathercadFolderRule 3082 "LeatherCAD se instalará en la carpeta siguiente. Elija una carpeta nueva, vacía o que ya contenga LeatherCAD: al desinstalar se elimina la carpeta con todo su contenido."
!define MUI_DIRECTORYPAGE_TEXT_TOP "$(leathercadFolderRule)"

# Guard 2: no install into a folder that holds anything else. Every upgrade
# and the uninstaller remove the whole install folder (`RMDir /r $INSTDIR`),
# so a maker who chose their projects folder would lose it. A folder is safe
# when it does not exist, is empty, or already holds LeatherCAD.
# Push the folder; pops "1" when safe, "0" when not.
Function leathercadInstallDirIsSafe
  Exch $0
  Push $1
  Push $2
  StrCpy $2 "1"
  ${IfNot} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
    ClearErrors
    FindFirst $1 $0 "$0\*"
    ${DoUntil} ${Errors}
      ${if} $0 != "."
      ${andIf} $0 != ".."
        StrCpy $2 "0"
        ${Break}
      ${endif}
      FindNext $1 $0
    ${Loop}
    FindClose $1
  ${endif}
  StrCpy $0 $2
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

# On the folder page: Next stays unavailable while the folder is unsafe. The
# files go where electron-builder's instFilesPre puts them, into a LeatherCAD
# subfolder unless the path already names the app, so that is the folder
# checked. Defined here, after the folder page, where its StrContains is.
!macro customPageAfterChangeDir
  Function .onVerifyInstDir
    Push $0
    Push $1
    StrCpy $1 $INSTDIR
    ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
    ${if} $0 == ""
      StrCpy $1 "$INSTDIR\${APP_FILENAME}"
    ${endif}
    Push $1
    Call leathercadInstallDirIsSafe
    Pop $0
    Pop $1
    ${if} $0 != "1"
      Pop $0
      Abort
    ${endif}
    Pop $0
  FunctionEnd
!macroend

# Guard 1: one install per account. With LeatherCAD installed for this user
# or for everyone (and not both), the page asking for whom is skipped and
# that scope is used; otherwise an upgrade could make a second copy in the
# other scope, its .lcp registration shadowing the first.
!macro customInstallMode
  ${if} $hasPerUserInstallation == "1"
  ${andIf} $hasPerMachineInstallation == "0"
    StrCpy $isForceCurrentInstall "1"
  ${elseIf} $hasPerMachineInstallation == "1"
  ${andIf} $hasPerUserInstallation == "0"
    StrCpy $isForceMachineInstall "1"
  ${endif}
!macroend

# What the pages cannot stop, on the command line, refused with exit code 2
# and nothing installed: /allusers over a per-user install or /currentuser
# over a per-machine one (initMultiUser has already let the switch override
# the registry, so it is read again), and, silently, an unsafe folder — $INSTDIR
# is resolved by now, from the registry, the default or /D=, and a silent
# install adds no subfolder.
!macro customInit
  ${ifNot} ${UAC_IsInnerInstance}
    ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $installMode == "all"
    ${andIf} $R0 != ""
    ${andIf} $R1 == ""
      MessageBox MB_OK|MB_ICONSTOP "$(perUserInstallExists)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${elseIf} $installMode == "CurrentUser"
    ${andIf} $R1 != ""
    ${andIf} $R0 == ""
      MessageBox MB_OK|MB_ICONSTOP "$(perMachineInstallExists)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}

    ${if} ${Silent}
      Push $INSTDIR
      Call leathercadInstallDirIsSafe
      Pop $R0
      ${if} $R0 != "1"
        SetErrorLevel 2
        Quit
      ${endif}
    ${endif}
  ${endIf}
!macroend

!endif
