# Release checklist

The manual gate before a release, done by a person on the **packaged** build, on Linux, Windows and
macOS. Everything automated is green before this starts (`pnpm check`, E2E, the packaged smoke
test, the pixel references). What they cannot prove is the printer, its driver, the viewer's print
dialog and the paper — and whether the workflow makes sense to a leatherworker holding the result.

**When:** before every release that changes what is drawn, exported or printed, or how a maker
gets there. A release of only fixes elsewhere needs checks 1 and 3 on one platform. How a release
is cut is in [`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases).

**Last updated:** 2026-10-23, for check 10's Windows install directory; before that 2026-10-18,
for check 14, recovery after a renderer dies on macOS; before that for check 13, ⌘A on macOS
(U.20), the Flatpak among the release's files, and R10 left unverified for 1.5. First written for 1.0
(sheet plan, Sheets view, project and work bars), and passed for it on 2026-09-24.

---

## Before you start

- **The scope.** Every item under *the next release* in [`roadmap.md`](roadmap.md) is ✅:
  `tools/release-gate.sh` says so, and so does the *Release gate* check on the `develop` → `main`
  pull request. A release never ships part of its section.
- **The build.** The installer or AppImage from `pnpm package` (or the release workflow) at the
  commit under test. Note the version shown in the status bar.
- **Tools:**
  - a steel rule graduated in 0.5 mm — not a tape;
  - a pen, tape, scissors or a knife;
  - scrap card or leather;
  - the pricking iron you normally use.
- **The printer:** its usual paper. On Linux and macOS, print with LeatherCAD's own **Print**. On
  Windows, which the app does not print from yet, *Save PDF…* in its preview and print from the
  operating system's **default** PDF viewer.
- **Recording:**
  - Record every step as *expected / actual / pass or fail / note*.
  - Measurements go into [`print-verification-log.md`](print-verification-log.md), one row per
    platform.

## What blocks the release

Any one of these is a blocker:

- A printed measurement more than **0.5 mm** from expected, printed with LeatherCAD's *Print* (on
  Windows: from the viewer at 100 % / Actual size).
- The Print Preview offering any scale choice, or showing sheets that differ from the Sheets view.
- The sheet count, the numbering or what is on a sheet differs between:
  - the paper button and the Sheets tab;
  - the Sheets view;
  - the PDF.
- Anything magenta on paper. Magenta is screen-only furniture.
- A part printed that Parts says is *Not printed*, or a part missing that Parts says prints.
- A taped join misaligned by more than 0.5 mm, or a step in an edge across a join.
- A sheet without its 100 × 5 mm verification gauge, or anything printed in its margins.
- Lost work, a crash, or a file that does not reopen as it was saved.

**Not blockers:**
- cosmetic layout;
- packing that uses more paper than a person would;
- a label cut short in a narrow window.

Record them anyway.

## The checks

### 1. Start-up

1. The window title reads **Untitled — LeatherCAD**.
2. The top bar has three zones: the project menu, whose button is the name, and its save state and
   *Save*; *Design | Sheets* in the middle; the paper button, *Export PDF* and *Print* — the only
   primary button, in the paper's colour, its second half a check — then Settings and Help.
3. The second bar holds the work: *Undo*, *Redo* and *Draw as*.
4. The paper button reads **1 × A4 portrait**, and the Sheets tab **1**.

### 2. An empty project

1. *Print*: the preview shows one sheet, carrying only the verification strip: the gauge and its
   words. It reads *100 % — locked* and *No scaling*.
2. *Print 1 sheet*. The gauge measures **100.0 × 5.0**.

### 3. The print test

Follow the procedure in [`print-verification-log.md`](print-verification-log.md) on
`fixtures/projects/print-test.lcp`, and record its row.

1. **In the Sheets view:**
   - sheet 1 holds the panel and the pocket;
   - the strap spans sheets 2–3 with one dashed join.
2. **The measurements, A to H:**
   - gauge **100.0** across;
   - gauge **5.0** up;
   - panel edge **100.0**;
   - dimension line **100.0**;
   - the 25-hole row **93.0**;
   - 10 gaps **38.75**;
   - the taped strap **275.0** end to end;
   - strap width **25.0**, with no step at the join.
3. **The sheets:**
   - the sheets read *Sheet 1 of 3*, *Sheet 2 of 3*, *Sheet 3 of 3* at their foot;
   - each sheet carries what the Sheets view showed on it.

### 4. Every paper, on the print test

For each paper, check three things agree: the paper button's count, the Sheets view's summary, and
the PDF's page count.

| Paper | Portrait | Landscape |
|---|---|---|
| A5 | 4 | 3 (the pocket turned) |
| A4 | 3 | 1 |
| A3 | 1 | 1 |
| Letter | 3 | 3 |
| Legal | 1 (the strap turned) | 1 |

Print one portrait sheet and one landscape sheet, and measure both gauges. The landscape sheet
comes out on upright paper, the sheet turned a quarter on it, whole: turn the paper to read it
([ADR 0019](adr/0019-print-from-the-app.md), amended for 7.6b). The preview shows it landscape,
like the Sheets view.

### 5. A realistic wallet

Build a bifold, as in [`getting-started.md`](getting-started.md):

- **the outer:** 200 × 95 mm, a stitch line 3 mm in, holes at 3.85 mm, and a fold line at 100 mm;
- **the lining:** 196 × 91 mm;
- **a card pocket:** 95 × 60 mm, with a thumb scoop, stitched on three sides, *Cut* 2.

1. **On A4 portrait**, Parts says the outer and the lining are *turned*: 200 mm is more than the
   190 mm A4 prints across, so they print a quarter turned, whole, on two sheets. On A4 landscape
   they are as drawn.
2. **On the paper you really print on:**
   - the number on the paper button and the Sheets tab;
   - the number of sheets in the Sheets view;
   - the PDF's page count.

   All three are the same.
3. **The pocket's printed caption** reads *— cut 2*.
4. **Print and cut out** the pieces, then:
   - the outer measures **200.0 × 95.0**;
   - the lining measures **196.0 × 91.0**;
   - the fold line sits at **100.0**.
5. **Lay the pricking iron on the printed holes:** every tooth lands on a hole mark along a straight
   run.
6. **Lay the pocket on the outer:** its stitch line lines up with the outer's where they are sewn
   together.
7. **Trace one piece onto leather,** and check it against the rule.

### 6. Taped both ways

1. Draw a 300 × 300 mm panel on A4 portrait: too large for it either way.
   - The Sheets view shows it as a 2 × 2 group.
   - The board shows its joins both ways, labelled *Tape join*.
2. Print it, and assemble the four sheets on the crosses. The centre cross meets on all four.
3. Measure **300.0 × 300.0**.

### 7. Printing one sheet again

1. In the Print Preview, untick sheets 1 and 3, and print sheet 2 alone.
2. It is identical to sheet 2 of the first print.
3. Its gauge still measures **100.0 × 5.0**.

### 8. What does not print

1. **Hide the panel's stitch holes.**
   - Parts says *1 hidden feature isn't printed*.
   - The PDF has no holes on the panel.
2. **Hide a whole part.**
   - Parts says *Not printed — It is hidden*.
   - The sheet count drops, and the part is not in the PDF.
3. **Nothing magenta on any printed page:** no join label, no outline, no sheet number above a
   sheet. The footer number *is* printed, in black.

### 9. Edge cases

1. **The wrong paper.** In the Print Preview, choose a paper the printer does not list: the
   preview says so, and *Print* is unavailable. On Windows, print a PDF saved for Letter on A4
   paper, and the other way round.
   - The viewer may scale it; the gauge must show that it did.
   - Record the viewer's behaviour. This is a procedure finding, not a software blocker.
2. **Long names.** Long part and project names never hide the project menu, *Save*, *Design |
   Sheets*, the paper button, *Export PDF* or *Print* at any window size: a long name gives way,
   and its tooltip says it whole.
3. **Undo.** Undo after a paper change brings back the previous paper, in one step.
4. **Unsaved work.** Closing with unsaved changes asks first. Save, reopen, and everything —
   including the paper — is as it was.

### 10. Every platform

Repeat checks 1–4 and 7 on macOS, with *Print*: the same CUPS path as Linux, against Apple's
filters, and unverified until its row is in the log. Repeat them on Windows through *Save PDF…* and
the default PDF viewer, noting the exact name of the viewer's actual-size setting. Record one row
per platform in the log.

On Windows, the installer asks. On a machine without LeatherCAD, run it with every choice left as
it is: it shows the licence and goes no further until it is accepted, offers *Only for me* and
*Anyone who uses this computer*, then the folder — `%LOCALAPPDATA%\Programs\LeatherCAD` — then
a desktop shortcut and opening `.lcp` projects, both ticked, and starts LeatherCAD at the end. No
administrator prompt appears. Then each of these, uninstalling in between:

- **Every user:** choose *Anyone who uses this computer*. Windows asks for an administrator; the
  app is in `Program Files\LeatherCAD`, and another account finds it in its Start menu.
- **A folder of your own:** choose one; the app is in a *LeatherCAD* folder inside it.
- **No desktop shortcut, no `.lcp`:** untick both. No shortcut is on the desktop, and
  double-clicking a project does not start LeatherCAD. Run the installer again: the page offers
  both unticked, and *Install* leaves them so.
- **One install only:** with LeatherCAD installed for you only, run the installer again: it does
  not offer *Anyone who uses this computer*. `LeatherCAD-Setup.exe /S /allusers` refuses, with
  exit code 2, and installs nothing.
- **Uninstall:** from *Installed apps*. The second page offers to remove settings, templates,
  recovery copies and the log, unticked. Left so, `%APPDATA%\leathercad` is still there; ticked, it
  is gone. Projects saved elsewhere are untouched either way.

Install over 1.5.0 or earlier, which lived in `Programs\@leathercaddesktop` and asked nothing: the
old directory is gone, the Start menu entry starts the new version, and Settings and the Project
menu's recent projects are as they were.

Still on Windows, pin LeatherCAD to the taskbar from its Start menu entry, close it, start it from
the pin and open a saved project: the window belongs to the pin — one taskbar button, not a second
one beside it — and right-clicking the pin lists the project under *Recent*.
The installer's *Properties → Details* and the tooltip of the Start menu entry say *Leathercraft
patterns that print at exact 1:1 scale*, not *Electron shell for LeatherCAD*.

### 11. Opening a project from the file manager

Since 8.5. On each platform — the Windows installer, the macOS dmg, and on Linux the `.flatpak`
installed with `flatpak install --user` — double-click a saved `.lcp`. The app starts with it open,
and **Save** writes back to it without asking where. With the app already open and unsaved work, a
second double-click — of another `.lcp` — opens it in a tab of its own beside the unsaved work, in
the same window, on every platform: since 8.11 a second launch on Linux and Windows starts no second
process, and since 8.12 each project has a tab. Double-click the first project again: its tab comes
forward, and no second tab opens. Minimise the window and double-click again: it comes back to the front. Start LeatherCAD
from the Start menu or the launcher while it runs: the window comes forward, and nothing else
happens. On Linux, the file manager calls the file a *LeatherCAD project*.

### 12. The window's edited flag, on macOS

Since 1.5 (U.7). On a **real Mac**, with the packaged dmg. Not Linux, where Electron ignores the
flag; not the test host or the end-to-end mock, which replace it.

1. Open a project, saved and unchanged: the window's close button shows no edited dot.
2. Make an edit: the dot appears in the close button.
3. *Save*: the dot clears.

**R10** left 1.5 unverified on 2026-10-18, by the maintainer's decision: no Mac was at hand. It is
monitored in [`roadmap.md`](roadmap.md)'s 1.6 *Release engineering*, not a ☐, so the release gate
does not wait for it. Tick it in the pull request that records a pass on a Mac, with the macOS
version and the date.

### 13. ⌘A outside a text field, on macOS

Since 1.5 (U.20), in the same Mac session as check 12. The renderer stops `Ctrl+A` outside a text
field, which the end-to-end test checks on Linux; on macOS, ⌘A is also the accelerator of the Edit
menu's *Select All* (`role: 'selectAll'` in `apps/desktop/src/main/menu.ts`), and nobody has seen
which one wins ([#97](https://github.com/crnlsp/leathercad/issues/97)).

1. Open the *Bifold wallet* template, and click the board so that no text field has focus. ⌘A: nothing is
   highlighted anywhere in the window, the Problems drawer included.
2. In the project's name field, and in a size in Properties, ⌘A selects that field's text and
   nothing else.
3. Choose *Edit › Select All* from the menu bar, once with the board focused and once in a field,
   and note what each does.

Record the result on #97. A failure is not on the list of blockers above, but say so in the release
pull request, so the maintainer decides whether it waits.

### 14. Unsaved work after a window's renderer dies, on macOS

Since the post-1.5 stabilization, in the same Mac session as check 12. On macOS a closed window does
not quit the app, so a new window opens in the same process; it must offer the dead window's work,
not delete it. `recovery.test.ts` checks the files; nobody has watched it on a Mac.

1. Open the *Bifold wallet* template and make an edit. Wait half a minute, for the recovery copy to be written.
2. In Activity Monitor, force-quit *LeatherCAD Helper (Renderer)*. The window goes blank.
3. Close the window, then click LeatherCAD in the Dock: the new window offers the unsaved work.
   *Recover* brings back the edit.

A failure is lost work, which is a blocker above.

### 15. Project tabs

Since 8.11–8.14, on each platform, with the packaged app.

1. Start the app: the start screen shows, headed *Start new project*, with *New project from
   scratch*, *New project from template*, *Open existing project* and the recent projects.
2. Open two saved projects and start a new one: three tabs, the new one *Untitled*. Edit two of
   them. Ctrl+Page Down and Ctrl+Page Up go round them (⌘ on macOS); each keeps its own drawing,
   undo, Design or Sheets view and zoom.
3. Choose *Open…* on a project that is already open: its tab comes forward and bounces, and no
   second tab opens.
4. Rename a saved project to the name of another project in its folder: *Not renamed*, and both
   files are as they were. Rename it to a free name: the tab and the file in the folder both change.
5. Right-click a saved tab: *Reload from disk* asks about unsaved work first; *Show in folder* opens
   the file manager on the file; *Move file to Trash…* asks, and the file is in the system's Trash
   afterwards, from which it can be restored.
6. With two tabs holding unsaved work, force-quit LeatherCAD (Task Manager, Activity Monitor,
   `kill -9`). Start it again: both projects are offered, one after the other, each into a tab.
7. Close the window with unsaved tabs: one question names them all; *Cancel* keeps the window.
   Save them, close, and start again: the tabs come back, the one in front in front.
8. On macOS, ⌘W closes the tab, not the window, and the Window menu has no *Close* on ⌘W.
9. Rename a saved project, then Undo: the project and its file both have the old name again.
10. Open a saved project, and change its file in another program (copy another `.lcp` over it):
    a bar over the board says so; *Reload* reads it. Delete the file: the bar says it went;
    *Save it again* writes it back.
11. With two projects unsaved, close the window: one question names both; *Cancel* keeps them.
12. Drag a tab along the strip; drop a `.lcp` from the file manager on the window: it opens in a
    tab. Close a saved project, then Ctrl+Shift+T: it opens again.
13. Turn on Settings › General › *Keep unsaved projects when closing*, make an untitled project
    with a drawing, and close the window: nothing is asked. Start again: it is back, unsaved, and
    each tab is on its view and zoom.
14. *New project › from template…*: the card holder opens *Untitled*, unchanged, with no problems;
    *Save* asks where. *Save as template…* the project under a name already used: it asks before
    replacing. The maker's template is in the picker, and removing it there takes it off.
14. *New project from template…*: each template that ships opens, untitled, with nothing to fix in
    Problems. *Save as template…* on a project of yours: it is listed under *Mine*, and a
    second save under the same name asks before replacing it. In the picker, search, *Show*
    and *Sort* narrow and order the list, and open the same way next time; describe and tag one of
    yours through *Edit details…*; rename, pin, duplicate, export and remove (then *Undo*) it from
    the icons above its details, and import one; *Edit template* opens it,
    and Save writes the template.

## After it passes

- Record one row per platform in [`print-verification-log.md`](print-verification-log.md), with
  the readings. A release never claims print accuracy without them.
- Merge the release pull request (see
  [`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)), and check that the release has
  the AppImage, the Flatpak, the Windows installer, the macOS dmg and the SBOM attached — five
  files, as `release.yml` attaches them.
- The installers are not code-signed, by decision ([`roadmap.md`](roadmap.md), *Release
  engineering*); [`getting-started.md`](getting-started.md) tells makers how to open them.
