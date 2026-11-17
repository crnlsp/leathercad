# Additions to electron-builder's NSIS installer, which includes this file
# (nsis.include's default) on Windows.

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
