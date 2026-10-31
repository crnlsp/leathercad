# Getting started

From installing LeatherCAD to a pattern on paper that measures true: about fifteen minutes.

## 1. Install

Download the installer for your system from the
[latest release](https://github.com/crnlsp/leathercad/releases/latest). Which systems it is made for,
and what happens if it breaks on yours, is under [Supported systems](#supported-systems) at the end
of this section.

| System | File | Then |
|---|---|---|
| Linux | the `.AppImage` | Make it executable (`chmod +x`) and run it. It installs nothing; keep it anywhere. It needs FUSE 2 — see below. |
| Linux | or the `.flatpak` | `flatpak install --user LeatherCAD-*.flatpak`. It adds LeatherCAD to your applications menu and opens `.lcp` files by double-click. It needs the Flathub remote, which most distributions have, and no FUSE. |
| Windows | the `.exe` | Run it. It installs for your user only, with no administrator prompt. |
| macOS | the `.dmg` | Open it and drag LeatherCAD to Applications. It runs on Apple silicon and Intel. |

**An AppImage needs FUSE 2.** A fresh Arch or Ubuntu does not have it, and the AppImage stops at once
with *AppImages require FUSE to run* and a message about `libfuse.so.2`. Install it once:

| System | Command |
|---|---|
| Arch | `sudo pacman -S fuse2` |
| Ubuntu 22.04 | `sudo apt install libfuse2` |
| Ubuntu 24.04 and newer | `sudo apt install libfuse2t64` |

Or run it without FUSE: `./LeatherCAD-*.AppImage --appimage-extract-and-run` unpacks it to a
temporary folder first, so it starts a little slower.

LeatherCAD is free and open source, and its installers are not code-signed: signing certificates
cost money every year. So the first time you open it, Windows and macOS warn about an unknown
developer:

- **Windows:** choose *More info → Run anyway*.
- **macOS:** open it once, then go to *System Settings → Privacy & Security* and choose *Open
  Anyway*.

Once installed, **double-click a `.lcp` project to open it**: the Windows installer, the macOS app
and the Flatpak all register the file type. An AppImage registers nothing by itself; a tool such as
AppImageLauncher adds it to your menu, and then it opens projects too.

To check that a download is the one this repository's release workflow built, use GitHub's build
provenance, with the [GitHub CLI](https://cli.github.com/):
`gh attestation verify <the file> --repo crnlsp/leathercad`.

When a project was saved by a newer LeatherCAD than yours, the app says so and names the version:
update, and it opens.

**To see a finished pattern first,** choose *New project from template…* — in the Project menu, under
*+*, or on the start screen — and then *Bifold wallet*: the wallet this page draws, with its lining and
card pocket. It opens untitled, so saving it asks where, and nothing you change reaches the copy inside
the app.

### Supported systems

A system's **level** says how far LeatherCAD promises to work on it, and so what a bug there does to
a release.

| Level | Systems | What it promises |
|---|---|---|
| **1 · measured** | Arch Linux; Ubuntu LTS (22.04, 24.04 and 26.04 today) | Everything works, including a printed sheet that measures true. A bug found here holds back the whole release. |
| **2 · tested** | Windows 10 (22H2) and Windows 11, 64-bit | Its installer is built, and the packaged app tested, on every change. A confirmed bug here holds back the Windows files, not the release. |
| **3 · shipped** | Other Linux distributions; macOS 12 or newer, on Apple silicon and Intel | The files are built and shipped. A bug here is listed as a known issue in the release notes; only a drawing that does not print at 1:1, or lost work, holds back that platform's file. |

The versions:

- **Ubuntu:** the LTS releases still in standard support. One leaves the table with the release
  after its support ends.
- **Arch:** current at the time of the release; systems built on Arch, such as CachyOS, count with it.
- **Windows and macOS:** what Electron, which LeatherCAD is built on, supports. macOS 12 is the
  oldest since Electron 38. Intel Macs stay while their build works and Apple still patches macOS 26.
- **Not supported:** Linux on ARM, Windows 7, 8 and 8.1, and any 32-bit system. They may run;
  nothing is tested or promised there.

If something breaks on your system, [open a bug report](https://github.com/crnlsp/leathercad/issues/new?template=bug_report.yml)
and say the system. Confirmed bugs that do not hold a release are labelled `known-issue`, and the
open ones are listed in each release's notes.

## 2. Draw a part

A card pocket, 96 × 60 mm, the shape a card holder is made from.

1. Choose **Rectangle** (**R**) in the tool rail. With *Draw as: Outline*, drag out a rectangle
   anywhere. It becomes a new part, listed on the left.
2. In **Properties** on the right, type **96** for *Width* and **60** for *Height*. Every number is
   in millimetres, and every number is exact: what you type is what prints. A size can also be
   typed as a sum or in another unit, and is shown in millimetres: `95-2*3.5`, `3.75in`, `3/4"`,
   `9,5 cm`. A sum gives every number its unit, or none, so `10cm + 5mm` and not `10cm + 5`; and
   3½ inches is `3.5in` or `(3+1/2)in`, since `3-1/2"` is a sum. What a field cannot read stays
   in it after Enter, with the reason beneath; Escape puts the size back.

   Or type them on the drawing: while the outline is selected, its width, height and corner
   radius sit beside it — and, once it has a stitch line, the stitch margin just inside the edge.
   Click one, or press **Enter** on the board — **Tab** reaches the board as it does any control —
   type, and press **Enter** again; **Tab** goes on to the next, **Escape** puts it back. A corner
   the rectangle cannot draw — larger than half its height, say — is refused with the reason, and
   **Enter** takes the largest that fits; so is a width or height too small for its corners, and
   **Enter** takes the least they fit in.
3. Name the part *Pocket* in the panel's **Piece** field, beside how many to **Cut**. They are the
   piece's, so they show while its outline is selected — under the outline's own **Name** — or
   under **Part** when the piece itself is picked in **Parts**.

For a thumb scoop, draw the outline with **Polyline** (**P**) instead: click the corners, press
**A** before a segment to make it an arc, then **L** to go straight again. Click the first point to
close it.

## 3. Stitch it

1. Select the outline, and choose **Add stitch line**. It follows the edge 3.5 mm in, and keeps
   following it: change the outline and the stitch line moves with it.
2. Select the stitch line, and choose **Add holes**. Pick your pricking iron in the panel. The panel
   shows how many holes that makes and the spacing they came out at, which is slightly different
   from the iron's pitch because the holes have to fit the line exactly. The line under them says
   by how much: *Spacing matches the pitch*, or *Spacing is stretched 1.8 %*.

The bar under the selected piece says the same in one line — holes, spacing against the pitch,
the runs (each side's holes, its corner holes counted on both sides they join) and how many to cut
— and under it *Next: Stitch line › Stitch holes › Seam allowance*: the next step is a button that
makes it with your margin and default iron (*Settings → My tools*), and **Ctrl+Z** takes it back.
**F6** goes into the bar and back to the board. *Settings → Appearance* turns it off.

With nothing selected, **Properties** sums up the job: the pieces to cut, the holes to punch and the
sheets to print.

To stitch only some sides, as a pocket is, draw the stitch line yourself: *Draw as: Stitch* with
the Polyline tool, along the sides to be sewn.

**Measure** (**M**) puts a dimension on the drawing: click two corners. It prints.

The **Problems** drawer at the bottom says if anything will not make a good template — holes too
close to an edge, a stitch line that has lost its outline — and selecting a problem shows where.
The narrow half of **Print** says it too: a check when there is nothing to fix, or the warning's
△ or the error's ▲ and how many. Click it to open the drawer.

## 4. Save

**Save** (**Ctrl+S**, **⌘S** on macOS) writes a `.lcp` file. Beside the project's name the bar says
*Unsaved changes* or *Saved*; with nothing to save, Save says so. If LeatherCAD or the computer
stops unexpectedly, it offers your unsaved work back the next time it starts; if you close with
unsaved changes, it asks first.

The project's name is the file's and the PDF footer's. To change it, open the project menu — its
button is the name — and choose **Rename…**; **Enter** keeps the new name, **Esc** puts the old one
back.

## 5. Print, and check the print

1. Choose the paper in your printer with the paper button beside **Export PDF** — it reads, for
   example, *3 × A4 portrait*. Each paper in its list says how many sheets it takes, the
   tooltip of **Portrait** and **Landscape** what the other way up would take, and the line under
   them what is taped across sheets, so you can pick the one that uses the fewest sheets.
   In Design, a piece that will not print has a mark on its row in **Parts**, whose tooltip says
   why (it is hidden, or it has a problem); on the Sheets view, **Parts** says which sheet each
   piece prints on.
2. Choose **Sheets** in the middle of the top bar (**Ctrl+2**), or *See the sheets* under the paper,
   to see the pieces on the paper exactly as the PDF will put them. A part bigger than a sheet is printed across
   several, taped together on a dashed join line with crosses on it; its joins also show on the
   board, labelled *Tape join*. Anything drawn in magenta is only on screen, never on paper.
   **Design** (**Ctrl+1**) takes you back to the board, where you left it.
3. **Print** (**Ctrl+P**), the light button. Its Print Preview lists the problems first, if there
   are any — the same list as the drawer; choose one to go to it — and nothing stops you printing
   with them. It shows the PDF it will send, sheet for sheet — numbered *Sheet 1 of 3* like the Sheets view. Choose the printer, the
   sheets and how many copies; the scale is fixed at 100 %. **Print 3 sheets** sends them to the
   printer with scaling turned off. You do not set anything in a print dialog.

   On Windows, and in the Flatpak, LeatherCAD cannot send the job itself yet: the preview's last
   button is **Save PDF…**. Print that file from your PDF viewer at **Actual size** or **100 %**
   — never *Fit to page* or *Shrink*.

   A landscape sheet goes to the printer on upright paper, as printers take it, turned a quarter
   on the page: turn the sheet to read it. The PDF the preview saves has it the same way, so a
   viewer shows it sideways. *Export PDF*'s file keeps it landscape.
4. Check it with a steel rule. **Every sheet has a box at its foot that measures 100 × 5 mm.** If
   it does, everything on the sheet is true to size. If it does not, something between LeatherCAD
   and the paper scaled it — a viewer's setting, or the printer's driver — so fix that and print
   again.

**Export PDF** (**Ctrl+E**) saves the same PDF to keep or send, and opens it in your PDF viewer.

**For a laser cutter, a plotter or a vector editor**, the **▾** beside **Export PDF** saves the
drawing as an **SVG** or a **DXF**, in millimetres. It is the board as you arranged it, not the sheets, with each
layer — `cut`, `stitch`, `stitch-holes` and the rest — in a group of its own and in the colour it
has on the board. It holds what the PDF would print: a hidden feature is not in it, and neither is
one that failed to build, which LeatherCAD tells you about after saving. The first time, look at
the size your software shows: it should be the size you drew.

## Where things are

- **The top bar:** at its left, the project menu — the LeatherCAD mark and the project's name —
  holds *New project*, *Open…*, *Save as…*, *Rename…* and your recent projects, then whether it is
  saved. In the middle, **Design | Sheets**. At its right the paper, **Export PDF** (with **▾** for
  SVG and DXF) and **Print** (with the problems), then **⚙** Settings and **?** Help (**F1**).
- **Keyboard:** each tool's key is on its button; **Ctrl+Z** and **Ctrl+Shift+Z** undo and redo;
  **Ctrl+1** and **Ctrl+2** switch between Design and Sheets. *Settings → Keyboard shortcuts*
  (**Ctrl+/** or **?**) lists every key. **F11** is full screen. On macOS, **Ctrl** is **⌘**. A key
  works by where it is on the keyboard — **Shift+1** is the key with 1 on it, whatever it types
  there — and every list and tooltip shows it as your keyboard prints it; a tool's letter stays its
  letter, and zoom its **+** and **−**, wherever your layout puts them.
- **Zoom:** the control at the board's bottom-right says the zoom and sets it: **−** and **+**
  (**Ctrl+−** and **Ctrl+=**) step through round sizes — 50, 67, 75, 100, 125, 150, 200 % and on —
  while the wheel zooms smoothly about the pointer; **Fit** (**Shift+1**, or double-click empty board), and the
  percentage opens *Fit selection* (**Shift+2**), *True size, 100 %* (**Ctrl+0**) and 50, 200 and
  400 %. At 100 % the board is drawn at 96 pixels to the inch, the size a screen is nominally
  drawn at. Few screens are exactly that — a laptop often shows it a tenth or more smaller — so
  hold a ruler to it before you trust it against a buckle. The zoom never changes what prints. Until 1.5, **Ctrl+0** fitted the pattern.
- **Panels:** **[** folds Parts and **]** folds Properties to a 40 px strip, and the button at the
  end of each panel's header does the same; **\\** is focus mode, which hides both and leaves the
  rail its keys, until **\\** or **Esc** brings back what was there. Folded, Parts shows a
  thumbnail of each piece — a click selects it, a locked one too — and Properties the mark of what
  is selected. On a narrow window the app folds them itself (below 1280 px Properties, below 900 px
  both), and a panel then opens over the board, until **Esc** or a click on the board; the three
  chips at the status bar's right — *Parts*, *Focus*, *Properties* — reach them at every size. The
  folds you make are kept for next time; the ones a small window makes are not. On a keyboard
  other than a US one, the keys are where a US keyboard has `[`, `]` and `\`, shown as yours
  prints them (`ü`, `+` and `#` on a German one).
- **Parts:** each piece, with what it is made of nested the way it is built — *Outline › Stitch
  line › Stitch holes* — and its hole counts. A piece folds with its arrow; a piece you pick on the
  board opens and scrolls into view. Pointing at a row shows its lock and eye; a hidden or locked
  feature keeps its mark. With a row focused, **↑** and **↓** move (and select), **→** opens a
  piece, **←** closes it or goes up a level, **Space** hides or shows, **F2** renames, and
  **Shift+F10** opens the row's menu; Tab leaves the tree. A locked feature is reached here.
- **Settings** (**Ctrl+,**): clear the recent projects, and choose how the legend and the tool
  rail start. They stay as you left them.
- **Settings › My tools:** the pricking irons you own, by your own names, and the one a new hole
  set takes; and the stitch margin and leather thickness new stitch lines, seam allowances and
  folds start with. Each new thing keeps its own numbers, so a pattern sent to someone with other
  irons opens the same.
- **Logs:** *Help → About LeatherCAD → Show log folder*. Nothing is ever uploaded; attach the log
  to a bug report.
- **Licences:** *Help → About LeatherCAD → Third-party notices*, and `THIRD_PARTY_NOTICES.txt`
  beside the app.
- **Bugs and ideas:** [GitHub issues](https://github.com/crnlsp/leathercad/issues).
