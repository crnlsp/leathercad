# Installing on Windows, and the data that must survive it — design for 1.7 (R12 – R14, B5, 7.6c)

**Status:** design, for the 1.7 plan ([`2026-11-03-release-1.7.md`](../plans/2026-11-03-release-1.7.md)).
Nothing here is built or has been run on Windows. Linux and macOS packaging stay as they are.

---

## 1. What ships today (develop at 7a69dc9, electron-builder 26.18.0)

- **NSIS, one click, per user:** `nsis: { oneClick: true, perMachine: false }` in
  [`apps/desktop/electron-builder.config.mjs`](../../../apps/desktop/electron-builder.config.mjs).
  No pages, no administrator; a desktop and a Start-menu shortcut; `.lcp` registered for the user.
- **Where it installs:** `%LOCALAPPDATA%\Programs\@leathercaddesktop`. In one-click mode
  electron-builder names the folder from the npm package name (`@leathercad/desktop`, sanitised —
  `appInfo.sanitizedName`, `NsisTarget.js` line 270). In assisted mode it names it from
  `executableName`, `leathercad`.
- **The registry:** `HKCU\Software\{GUID}` with `InstallLocation`, and the uninstall entry, the
  GUID derived from `appId` (`io.github.crnlsp.leathercad`), so every version finds the last one.
  The type: `HKCU\Software\Classes\.lcp` → ProgID `LeatherCAD project`, `OpenWithProgids`, the
  app's own icon (`$appExe,0`); there is no document icon.
- **The installer's description** and the shortcuts' tooltip are package.json's description,
  "Electron shell for LeatherCAD". **No AppUserModelID** is set by the app, so Windows may file a
  window started from a pinned shortcut under a second taskbar button. Both are the unmerged
  branch's findings (the deleted `feat/windows-builder`, commits d4320f4 and 18b37f1; [§10](#10-the-deleted-branch-kept-for-later)); not yet seen on
  Windows by anyone.
- **CI never installs it.** `installers.yml` builds the `.exe`, but the packaged smoke test drives
  `win-unpacked` (`e2e/packaged/packaged.spec.ts`). Only the `.deb` is installed, smoke-tested and
  removed in CI.
- **Signing:** none, by decision (roadmap, *Collected from makers, and decided*). SmartScreen warns
  on every release, because an unsigned file's reputation starts from nothing.

**The deleted branch** (`feat/windows-builder`, October 2026, [§10](#10-the-deleted-branch-kept-for-later); never built or run on
Windows): an assisted installer with a licence page, a 190-line `build/installer.nsh` adding a
desktop-shortcut and file-association options page (undoing what electron-builder creates when
unticked), one install per account, an uninstaller page that can remove `%APPDATA%\leathercad`, a
move of `@leathercaddesktop` installs to `Programs\LeatherCAD`, and the two fixes above.

## 2. Where things live — the rules this design protects

| What | Where on Windows | Install | Upgrade | Uninstall |
|---|---|---|---|---|
| The program | The install folder | Written | Replaced | Removed |
| Settings, keys, irons, the language (`preferences.json`) | `%APPDATA%\leathercad` | — | Kept | **Kept** |
| The maker's templates (`templates\`) | `%APPDATA%\leathercad` | — | Kept | **Kept** |
| Unsaved projects kept at close (`unsaved\`), printer corrections (`printers.json`) | `%APPDATA%\leathercad` | — | Kept | **Kept** |
| Recovery copies, the log, crash dumps | `%APPDATA%\leathercad` (the state directory off Linux) | — | Kept | **Kept** |
| Projects | Wherever the maker saved them | — | Never touched | **Never touched** |

The app writes nothing into its install folder, and the install folder is never offered as a
place to save. `getting-started.md` says where the data folder is, and that deleting it resets the
app.

**The rule: an installer never removes the maker's data.** The maker's templates are their work,
not a cache. So no uninstaller option deletes `%APPDATA%\leathercad` — neither electron-builder's
`deleteAppDataOnUninstall` nor the branch's checkbox. (`--delete-app-data` would remove
`$APPDATA\leathercad` too: Windows compares folder names without case.)

## 3. The installer (R12)

```js
nsis: {
  oneClick: false,
  perMachine: false,                 // "Only for me" chosen, no administrator
  allowElevation: true,              // "Anyone who uses this computer" offered, with UAC
  allowToChangeInstallationDirectory: true,
  runAfterFinish: true,
  deleteAppDataOnUninstall: false,   // explicit: §2's rule
  include: 'build/installer.nsh',
},
```

**Pages:** who it is for · where · installing · finish (start LeatherCAD). No licence page:
Apache-2.0 asks for no acceptance, and the licence is in Help and beside the program. On an upgrade
electron-builder skips the folder page itself (`skipPageIfUpdated`).

**`build/installer.nsh` — two guards, about 30 lines, nothing else:**

1. **One install per account** (the branch's `customInstallMode`, kept). When LeatherCAD is
   installed for this user, or for everyone, the *who* page is skipped and that scope is used. On
   the command line, `/allusers` over a per-user install, or `/currentuser` over a per-machine one,
   exits with code 2 and installs nothing. Without it, electron-builder's page offers the other
   scope during an upgrade (`multiUserUi.nsh`), and the result is two copies, two Start entries
   and a per-user `.lcp` registration shadowing the per-machine one.
2. **No install into a folder that holds anything else.** electron-builder's uninstaller, and every
   upgrade, removes the whole install folder (`RMDir /r $INSTDIR`, `uninstaller.nsh`), and the
   assisted installer adds its own subfolder only when the chosen path does not already contain the
   app's name (`instFilesPre`, `assistedInstaller.nsh`). So a maker who chooses
   `Documents\LeatherCAD` — their projects folder — would install into it and lose it on uninstall.
   The guard: the folder the files will go to (after that subfolder rule) must not exist, be empty,
   or already hold `leathercad.exe`. Interactively, `.onVerifyInstDir` keeps *Next* unavailable
   and the folder page's text says why; silently (`/S /D=…`), `customInit` — which runs after the
   folder is resolved (`installer.nsi`) — exits with code 2. electron-builder 26.18 defines neither
   `.onVerifyInstDir` nor `customInit` itself; the slice confirms that again on the version it ships.

**Left out of the branch, and why:**

| Branch feature | Decision |
|---|---|
| Licence page | Out: no acceptance needed; one page fewer |
| Options page: desktop shortcut, open `.lcp` here | Out of 1.7: it works by undoing what electron-builder just made, never run on Windows. Windows' own *Open with* and deleting a shortcut do both. Revisit with a request |
| Uninstaller "remove my data" | Out, by §2's rule |
| Moving `@leathercaddesktop` installs to `Programs\LeatherCAD` | Out: an upgrade installs where the registry says, so existing installs stay and their pins keep working. New installs go to `Programs\leathercad` anyway, in assisted mode. One less migration that can fail |
| AppUserModelID, installer description | **In, as R14**, each its own fix |

**Upgrade from 1.6's one-click install:** same `appId`, so same GUID; the assisted installer reads
`InstallLocation` from `HKCU`, sees a per-user install, uses it (guard 1), runs the old uninstaller
with `--updated` — which keeps app data and only replaces files — and installs into the same
`@leathercaddesktop` folder. Shortcuts are re-created at the same paths.

**Uninstall:** removes the install folder, the shortcuts and the `.lcp` registration
(`APP_UNASSOCIATE`); keeps everything in §2; leaves projects alone. A running app is asked to close
first (electron-builder's `checkAppRunning`).

**File association:** per user under `HKCU\Software\Classes`, per machine under `HKLM`. Windows
never replaces a default app the user already chose; the first time, it may ask. `getting-started`
says how to choose LeatherCAD with *Open with → Always*. The ProgID keeps its name: renaming it
would orphan registrations for no gain.

## 4. Identity and desktop integration (R14)

- **AppUserModelID:** `app.setAppUserModelId(appId)` on Windows before any window, as the branch's
  18b37f1 does; `packaging.test.ts` holds it equal to the builder's `appId`. A pinned shortcut then
  starts into its own taskbar button, and its jump list shows recent projects.
- **Description:** the packaged package.json carries the app's synopsis (the Linux desktop entry's
  line), as d4320f4 does, read from one constant.
- **A document icon for `.lcp`** — drawn with the app's own icons (ADR 0021), generated by `pnpm
  icons:generate`: `fileAssociations[].icon` for Windows (`.ico`) and macOS (`.icns`); on Linux a
  hicolor icon named for the MIME type (`application-vnd.leathercad.project`) installed by the
  `.deb` and the Flatpak. The AppImage registers nothing, as now.
- **Checked by hand on each platform**, since none of it is visible to the test host: the file's
  icon in Explorer, Finder and Files; the taskbar pin; the Start menu entry's name and description.

## 5. CI: the real installer, installed (R13 — before anything above changes)

A job in `installers.yml` on `windows-latest`, after the `.exe` is built, in this order. The
packaged smoke test needs the inspector fuse, so — as the `.deb` job does — the installer under
test is the E2E build of the same commit (`LEATHERCAD_PACKAGE_FOR_E2E=1`), and the shipped
installer is checked for its pages and registry alone.

1. **Baseline.** Download 1.6.0's `.exe` from its release, verify it with `gh attestation verify`,
   install it silently (`/S`). Seed `%APPDATA%\leathercad` with a `preferences.json` holding a
   changed key, a template, a kept unsaved copy and `printers.json`.
2. **Upgrade.** Install this commit's `.exe` silently. Assert: the same `InstallLocation`; the
   uninstall entry's version is the new one; `HKCU\Software\Classes\.lcp` names the ProgID; every
   seeded file is byte-identical; the installed executable passes the packaged smoke test
   (`LEATHERCAD_PACKAGED_EXECUTABLE`, as the `.deb` job uses), which opens a `.lcp` named on its
   command line, as a double-click does.
3. **Second launch.** Start the installed app twice with two projects: one process, two tabs
   (8.11), as the existing single-instance test checks on the unpacked app.
4. **Uninstall** (`Uninstall leathercad.exe /currentuser /S`, as one-click names it; R13). Assert: the install folder, shortcuts, uninstall
   entry and `.lcp` keys are gone; `%APPDATA%\leathercad` is untouched.
5. **Unsafe folder.** Create a folder holding a dummy `.lcp`; install with `/S /D=<it>`. Assert exit
   code 2, nothing installed, the dummy still there. (Fails until R12's guard lands: R13 records it
   as expected-to-fail with a link, and R12 turns it on.)
6. **Scope.** With a per-user install present, `/S /allusers` exits 2 and makes no second copy
   (after R12).

R13 lands first against today's one-click installer (steps 1–4), so R12 is a change to something
already tested. A job that cannot verify the attestation or download the baseline fails; it is
never skipped.

## 6. By hand, on a real Windows 11 PC (release checklist §10, §11)

The assisted pages, in English and with the app's language set to another; *Only for me* and
*Anyone*; a folder with a space and non-ASCII characters; an upgrade over 1.6.0 started from a
pinned taskbar icon; double-clicking a `.lcp` with the app closed and open; *Open with*; the
SmartScreen text shown; Settings › Apps' entry (name, version, publisher); uninstall from Settings,
then the data folder still there; reinstall, and the templates and keys come back.

## 7. The Microsoft Store and MSIX (B5 readiness)

The CI/CD plan already makes the Store the main Windows channel (D10, task B5) and postponed it
until after 1.6: the Store signs the package for free, which ends the SmartScreen warning, and
updates it. 1.7 prepares it; the listing goes live only after the maintainer's Partner Center steps.

**The fact that decides the design** — [Microsoft's MSIX documentation](https://learn.microsoft.com/windows/msix/desktop/flexible-virtualization):
on Windows 10 later than 1809, a packaged desktop app's **newly created files in AppData are written
to a private, per-package location and removed when the app is uninstalled**; changes to files that
already existed outside are made to the real files. For LeatherCAD that means:

- a maker who installs from the Store, saves templates and later reinstalls **loses every
  template**, every kept unsaved copy and every printer correction;
- a maker moving from the `.exe` to the Store keeps the files that existed, but every *new*
  template is private to the package.

**So the package must not virtualize `%APPDATA%\leathercad`.** Windows 11 lets a package exclude one
folder (`virtualization:ExcludedDirectory` with `$(KnownFolder:RoamingAppData)\leathercad`);
Windows 10 1903 and later only turn AppData virtualization off for the whole package
(`desktop6:FileSystemWriteVirtualization` = `disabled`). Both need the **restricted capability**
`unvirtualizedResources`, which Store certification asks to be justified. Declare both forms;
justify it as "the maker's templates and settings must survive reinstalling, as with the `.exe`".

Then the `.exe` and the Store app share one data folder, and so one single-instance lock (the lock
is the configuration folder's, 8.11): with both installed, the second to start hands over to the
first, whichever it is. That is acceptable; the docs say to keep one.

**Readiness work in 1.7** (B5's *Find out first*, extended):

1. Electron-builder's `msix` target is marked beta; build one in `installers.yml` (not attached to
   releases, D10), signed with a throwaway test certificate, with the `.lcp` association and the
   two virtualization declarations.
2. On `windows-2025`: `Add-AppxPackage`, start through `shell:AppsFolder`, write a template,
   remove the package, reinstall: **the template must still be there.** A failure here holds B5.
3. `isManagedInstall` (CI/CD plan B5) — the Store copy says the Store updates it.
4. `docs/store-listing.md` and the Partner Center steps for the maintainer, who reserves the name and
   submits. The listing going live is not a 1.7 release item.

## 8. Printing from Windows (7.6c — conditional)

The preview's last step on Windows is *Save PDF…*, printed from a viewer at *Actual size*. A direct
path needs a transport that can be told not to scale. SumatraPDF is the roadmap's candidate (GPL-3.0,
shipped beside the app as a separate program with its licence and source offer; its own ADR):
`-print-to "<printer>" -print-settings "noscale"`. Its documentation says command-line printing
takes the printer's Windows defaults, so a driver set to *fit* may still scale.

**The condition:** a Windows PC and a printer, and a print-test row in the verification log with the
readings A–H through the new path. Until then nothing is claimed and the item moves to *Later* in a
change of its own, at the release candidate at the latest.

## 9. Linux and macOS

No change of method: the AppImage, `.deb`, AUR and Flatpak keep their own conventions, and the dmg
stays drag-to-Applications. R14's document icon and the release checklist's file-manager checks
cover them. Q37 (Cmd+Q then *Discard* on macOS) and R10 stay with a maker who has a Mac.

## 10. The deleted branch, kept for later

`feat/windows-builder` (six commits on `develop`, 23–26 October 2026; no pull request; never built
or run on Windows by anyone) was deleted on 2026-11-17. Its commits are recorded here so R12 and
R14 need not find it. A copy exists only as a local tag on the maintainer's machine,
`archive/windows-builder`, never pushed.

| Commit | What it did | Decision |
|---|---|---|
| `10a02da` | Install to `Programs\LeatherCAD`; an `installer.nsh` macro moved an old `@leathercaddesktop` install | **Rejected** (D13). Releases to date never made that folder wrong enough to move users' installs. |
| `ce44f6c` | `pnpm package:win` (`tools/package-win.mjs`): builds the `.exe` in the pinned `electronuserland/builder` Wine image | **Not wanted now.** CI builds and (R13) installs the real `.exe` on `windows-latest`, which a Wine build cannot do, so Wine only saves a contributor a Windows PC. Worth reviving if someone has to try an installer change without one; the script was 82 lines plus an ADR 0014 amendment (Wine in the image, host builds the bundles, digest-pinned). |
| `18b37f1` | `app.setAppUserModelId(appId)` on Windows | **Take, in R14** (§4). Code below. |
| `d4320f4` | Packaged description is the synopsis, from one constant | **Take, in R14** (§4). Code below. |
| `236fe28` | Assisted installer: licence page, shortcut and `.lcp`-association options page, one install per account, uninstaller "remove data" | **Rejected** (D12, D13), **except the one-per-account guard → R12** (code below). The options page: revisit with a maker's request ([roadmap](../../roadmap.md#later)). "Remove data" breaks §2's rule and is never taken. |
| `8660fc2` | ADR 0014 and roadmap wording | **Something is missing from `develop`**: the ADR still says Windows is not built (it is: 8.6a) and that asar integrity protects nothing (on Windows and macOS it catches a damaged install, not a deliberate one, while the exe is unsigned); the roadmap's *Code signing* row lacks the 2026-10-26 *Deferred* wording (a certificate's key must now be in hardware or a cloud service; candidates SignPath Foundation, Azure Trusted Signing via `azureSignOptions`, a Certum open-source certificate). Fix in a change of its own. |

### AppUserModelID (R14)

`apps/desktop/src/main/appUserModelId.ts`:

```ts
export const APP_USER_MODEL_ID = 'io.github.crnlsp.leathercad';
```

In `main/index.ts`, after `app.setPath('userData', …)` and before any window:

```ts
if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);
```

In `packaging.test.ts` (`BuilderConfig` gains `appId: string`):

```ts
it('gives the running app the id the Windows shortcuts carry', async () => {
  const { appId } = await config();
  expect(APP_USER_MODEL_ID).toBe(appId);
});
```

### Description (R14)

In `electron-builder.config.mjs`:

```js
/** One line on what the app is: the Linux entry's comment, and Windows' description. */
const SYNOPSIS = 'Leathercraft patterns that print at exact 1:1 scale';
// …
extraMetadata: { name: 'LeatherCAD', description: SYNOPSIS },
// …
linux: { /* … */ synopsis: SYNOPSIS },
```

In `packaging.test.ts` (`BuilderConfig` gains `extraMetadata: { description: string }` and
`linux.synopsis: string`):

```ts
it('describes the Windows installer and its shortcuts as Linux does, not as the workspace package', async () => {
  const { linux, extraMetadata } = await config();
  expect(extraMetadata.description).toBe(linux.synopsis);
});
```

### One install per account (R12)

Untested NSIS, written against electron-builder 26; it must be re-checked against R13's CI. The
macro runs before the page that asks for whom and skips it when one install exists:

```nsis
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
```

And, in `customInit`, a guard against `/allusers` or `/currentuser` on the command line making a
second install in the other mode (where both already exist, electron-builder's choice stands):

```nsis
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
```

The message strings are English literals in the branch; R12 words them as the installer's other
pages are (the installer is not the app and has no catalogue).
