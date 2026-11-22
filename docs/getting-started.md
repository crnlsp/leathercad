# Getting started

From installing LeatherCAD to a pattern on paper that measures true: about fifteen minutes.

## 1. Install

Download the installer for your system from the
[latest release](https://github.com/crnlsp/leathercad/releases/latest). Which systems it is made for,
and what happens if it breaks on yours, is under [Supported systems](#supported-systems) at the end
of this section.

| System | File | Then |
|---|---|---|
| Ubuntu | the `.deb` | `sudo apt install ./LeatherCAD-*.deb` — the `./` makes apt install the file you downloaded, and fetch what it needs. It adds LeatherCAD to your applications menu and opens `.lcp` files by double-click, and it needs no FUSE. To remove it: `sudo apt remove leathercad`. |
| Linux | or the `.AppImage` | Make it executable (`chmod +x`) and run it. It installs nothing; keep it anywhere. It needs FUSE 2 — see below. |
| Linux | or the `.flatpak` | `flatpak install --user LeatherCAD-*.flatpak`. It adds LeatherCAD to your applications menu and opens `.lcp` files by double-click. It needs the Flathub remote, which most distributions have, and no FUSE. |
| Windows | the `.exe` | Run it. It asks for whom — *Only for me*, the default, needs no administrator; *Anyone who uses this computer* asks for one — and where. Choose a new or empty folder: uninstalling removes the program's folder and everything in it, so the installer refuses one that holds anything else. An upgrade stays where LeatherCAD already is. |
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

**The Microsoft Store.** A Store package of LeatherCAD (an MSIX) is built and tested with every
Windows build, but **the Store listing is not live yet**: on Windows, install the `.exe` for now.

Once installed, **double-click a `.lcp` project to open it**: the Windows installer, the macOS app,
the `.deb` and the Flatpak all register the file type. An AppImage registers nothing by itself; a
tool such as AppImageLauncher adds it to your menu, and then it opens projects too.

Uninstalling or upgrading never removes your settings, templates or kept unsaved work. On Windows
they are in `%APPDATA%\leathercad`; deleting that folder resets the app. Your projects stay
wherever you saved them.

To check that a download is the one this repository's release workflow built, use GitHub's build
provenance, with the [GitHub CLI](https://cli.github.com/):
`gh attestation verify <the file> --repo crnlsp/leathercad`.

When a project was saved by a newer LeatherCAD than yours, the app says so and names the version:
update, and it opens.

**To see a finished pattern first,** choose *Bifold wallet* on the start screen, or *New project from
template…* in the Project menu or under *+*: the wallet this page draws, with its lining and
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
   anywhere. It becomes a new part, listed on the left. The tool stays on for the next one;
   **Esc** goes back to Select — or, halfway through a rectangle, cancels it first.
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

   For a left and a right, tick **Cut as a mirrored pair**: half are cut with the template turned
   over. The printed sheet says so under the piece — *Pocket — cut 2, turn the template over for
   the second* — and Parts and the summary read *1 + 1 mirrored*. Ticking it on an odd count
   rounds the count up.

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

   **Holes** says what each tooth of the iron cuts: a **Slit** — its length, blade and angle, and a
   **Lean**, *Standard* or *Inverse* as irons are sold — or a **Round** prong and its diameter.
   An iron in *Settings → My tools* has **Teeth** — *French*, *Japanese* or *Round* — which fill
   these in for a new hole set; change them on the hole set. The board draws the tooth, and an
   SVG or DXF cuts it as its true outline; the PDF keeps a small mark at each hole's centre, since
   you prick through the paper with the iron itself. A hole set made before 1.7 has no tooth set,
   and keeps its centre marks everywhere until you pick its iron again.

   On an open stitch line, **Start offset** and **End offset** move the first and last holes in
   from the line's ends; every corner keeps its hole. Opening a line at a square corner sets them
   for you, to the line's edge margin, so the end holes start as far from the open edge as the
   others are from theirs.

The bar under the selected piece says the same in one line — holes, spacing against the pitch,
the runs (each side's holes, its corner holes counted on both sides they join) and how many to cut
— and under it *Next: Stitch line › Stitch holes › Seam allowance*: the next step is a button that
makes it with your margin and default iron (*Settings → My tools*), and **Ctrl+Z** takes it back.
**F6** goes into the bar and back to the board. *Settings → Appearance* turns it off.

With nothing selected, **Properties** sums up the job under **Production**: the pieces to cut, the
holes to punch, the hardware, the thread — an estimate, with its rule — and the leather, net of
cut-outs and not what to buy. **Copy** puts the same lines on the clipboard.

An open U-shaped stitch line with straight sides also shows **Width between stitch lines** and
**Stitch depth** in Properties and on the selection bar. Stitch depth starts at the line joining
the stitching's two ends: the leather opening can be higher. A shape
without two unambiguous straight sides shows no numeric pocket reading.

Say what the pocket is for under **Holds**: a payment card or another size, and an **Ease** — the
room you leave for the leather and the stitching, which starts from *Settings → My tools → Pocket
ease* when you set one there. Problems then warns *Pocket too narrow* when the stitch lines are
closer than the content and its ease, and under **Holds** the width line gives the verdict —
*Fits: 89 mm across for 85.6 mm and 3 mm ease*, or *Too narrow* with the same numbers. Depth is shown, not judged — a card holder lets its cards
stand proud — unless you tick **Holds it fully**: then the content itself must fit below the opening,
which is read from the outline above the stitch ends. **Holds** then names the piece whose edge
the depth was read to, and how far that edge rises above the stitch ends, so you can see what was
measured. A geometric check: leather thickness and the stitching's pull are not counted, so leave
ease for them. [Known limitations](#known-limitations) says what else it cannot see.

To stitch only some sides, as a pocket is, select its derived stitch line and choose under
*Stitched sides* in Properties. On a rectangle square to the board, *Open at the top* and its
three siblings name the side left open; otherwise choose *Between corners* and the outline corners
the run follows — the board numbers the corners while a corner field has focus. Changing the
outline keeps the stitching attached. Where the run ends at a square corner it meets the edge it
leaves open, so its holes' *Start offset* and *End offset* become the edge margin: the end holes
start clear of that edge, and Problems has nothing to say about them.
For endpoints that do not lie at those corners, draw the stitch line yourself with
*Draw as: Stitch* and the Polyline tool, along the sides to be sewn.

**Measure** (**M**) puts a dimension on the drawing: click two corners. It prints.

The **Problems** drawer at the bottom says if anything will not make a good template — holes too
close to an edge, a stitch line that has lost its outline — and selecting a problem shows where.
The narrow half of **Print** says it too: a check when there is nothing to fix, or the warning's
△ or the error's ▲ and how many. Click it to open the drawer.

Every listed problem explains why it matters and what to do. **F8** goes to the next problem;
**Shift+F8** goes to the previous one, wrapping at either end. The drawer also has **Previous
problem** and **Next problem** buttons. Going to a problem opens Design, selects what it is about,
frames the evidence and focuses its row. Several problems on one feature are visited separately.
These keys can be changed in *Settings → Keyboard shortcuts*; fields and dialogs keep their own
keys, and navigation does not add an Undo step.

If you already assigned F8 or Shift+F8 to something else, that shortcut is kept. The conflicting
new command reads *Not assigned* in Settings until you choose a key; the drawer's buttons still work.

When a problem has one plainly safe fix — a drifting seam's drawn stitching made shorter or longer
until its holes pair, or stitching moved in until its holes clear the edge — Properties offers it
under the problem's explanation. Pointing at it previews it; it is one Undo step, and refused with
the reason if the pattern changed since. A **warning** you have decided to live with can be
**Accept**ed in Properties: it is then listed as accepted and not counted on Print, until what it
was found from changes. **Un-accept** counts it again. An error cannot be accepted.

### Sew two pieces together

A pocket's holes have to meet the holes of the panel it is sewn to. Select the two hole sets —
click one, then Shift-click or Ctrl-click (⌘ on macOS) the other, on the board or in Parts — and
choose **Sew together…** under *Seams* in Properties. With one selected, the second side starts on
another piece's holes; for a piece folded onto itself, choose its own hole set and another stretch
of it. Say where each side runs (*All round*, between two corners or ends, or part of a run from a
corner), and the preview reads both at once: how many holes each side has, and how far the pairs
**drift** apart along the line. **Sew** keeps it, one Undo step; *Edit* and *Unsew* sit beside the
seam afterwards. The board highlights the paired holes and numbers every fifth pair, and the
selection bar adds the seam's reading.

Problems then says when the two sides have different numbers of holes (an error), when both sides
are the same holes, so the seam joins nothing (an error), or when a pair drifts more than 0.5 mm
(a warning). A seam is kept in the file, and goes with its pieces when you
copy them or save them as a template.

**Alignment marks** on a seam — *First and last pair*, or *Every few pairs…* — put a short tick
beside those paired holes on both pieces, inside the leather, on the board, the sheets, the PDF, the
SVG and the DXF, to line the pieces up while gluing.

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
the size your software shows: it should be the size you drew. When the cut lines are among the
layers and two pieces overlap or touch on the board, the dialog names them first, so a laser does
not cut through both: move them apart, or *Export anyway*.

## 6. Bring a pattern in, or reuse a piece

- **From Inkscape or Illustrator:** *Import SVG pattern…* in the project menu. The preview shows
  the pieces it found, their size, the scale and what it left out. Closed paths are cut —
  outlines, and cut-outs inside them — and open ones are markings, unless a layer named `cut`,
  `stitch` or `fold` says otherwise. A drawing that gives no unit asks whether it was drawn at 96
  pixels to the inch (Inkscape) or 72 (Illustrator). A row of small circles is reported as holes
  to punch, not imported: make them with a stitch line or a hole row. Text, images, clones,
  scripts, filters, clips and masks are listed as left out; nothing in the file is run or
  fetched. **Import into this project** or **Import as a new project**; either is one Undo step.
  Check the size against your drawing before you cut.
- **A piece you will use again:** right-click it and choose *Save piece as template…*. It joins your
  templates, tagged `piece`. *Insert pieces from template…* in the project menu lists every
  template, yours and the built-in ones: tick the pieces you want and **Insert** them, with their
  stitching and the seams between them, one Undo step.
- **From another open project:** copy and paste, below.

## Where things are

- **The top bar:** at its left, the project menu — the LeatherCAD mark and the project's name —
  holds *New project*, *Open…*, *Save as…*, *Rename…* and your recent projects, then whether it is
  saved. In the middle, **Design | Sheets**. At its right the paper, **Export PDF** (with **▾** for
  SVG and DXF) and **Print** (with the problems), then **⚙** Settings and **?** Help (**F1**).
- **Moving by keyboard:** with the board focused — click it, or reach it with **Tab** — the arrow
  keys move what is selected 1 mm, **Shift** with an arrow 10 mm, and **Alt** with an arrow (**⌥**
  on macOS) 0.1 mm. One press is one Undo step, and so is a key held down. **Ctrl+A** selects every
  piece on the board that is neither hidden nor locked. A locked piece stays where it is, and the
  board says why. In a field, the Parts list, a menu or the tabs, the same keys stay theirs, and
  with **Edit points** chosen the arrows move nothing. If you
  had already given one of these keys to another command, yours is kept and the new one reads
  *Not assigned* in Settings.
- **Copy and paste pieces:** with the board focused, **Ctrl+C** copies the pieces the selection
  is in, and **Ctrl+V** pastes them under the pointer — into this project or any other open tab,
  with their stitching, holes, quantities and the seams between them. The right-click menu has
  *Copy* and *Paste* too, and a right-click on empty board offers *Paste* alone. A mirrored piece
  copied without the piece it mirrors pastes as the shape it is now, and a dimension to a piece
  left behind is left out; the app says so when you copy. Each paste is one Undo step.
- **Copy and paste features:** pick features inside one piece — a card slot, a stitch line, a
  rivet — without its outline, and **Ctrl+C** copies just those. **Ctrl+V** pastes them under the
  pointer into the piece the selection is in, so select the piece first; with no piece selected
  the app asks you to choose one. A feature copied without what it follows — a stitch line
  without its outline — pastes as the shape it is now, and holes without their stitch line are
  left out; the app says so when you copy. **Ctrl+D** duplicates them into their own piece, on top
  of the originals: move the copy, press **Ctrl+D** again, and the next lands that far on — three
  card slots 15 mm apart down a lining.
- **Moving with the pointer:** a piece dragged by its body lines its edges and centre up with other
  pieces and guides, and snaps to equal gaps between two neighbours; a rivet, hole or fold dragged
  inside a piece lines up with that piece's centre, straight edges and other holes. A line, and
  for a centre a label, show what lined up. While it moves, a chip beside the pointer and the
  status bar say how far it went; for a feature inside a piece, how far it is from the edges, and
  for a hole whether Problems will warn. Hold **Ctrl** (Ctrl on macOS too) to move freely;
  *Settings → General → Smart guides* turns the lining up off, leaving the ordinary snaps to
  corners, midpoints and lines.
- **Duplicate and repeat:** **Ctrl+D** duplicates the selected pieces, as the right-click menu's
  *Duplicate* does. Move the copy, press **Ctrl+D** again, and the next copy lands that far on, as
  many times as you like; any other edit, Undo or Redo ends the repeat.
- **Typing where it goes:** *Properties → Arrange* shows where the selection's **Left** and
  **Bottom** edges are, as the rulers read them; type a number there and it moves to it. **Move
  by** takes a distance **Right** and **Up** — **−12** goes 12 mm left — and **Move** moves it,
  again each time you press it. Both take a sum or a unit, such as `95-2*3.5` or `2cm`, and each
  move is one Undo step.
- **Keyboard:** each tool's key is on its button, and **Esc** goes back to Select; **Ctrl+Z** and **Ctrl+Shift+Z** undo and redo;
  **Ctrl+1** and **Ctrl+2** switch between Design and Sheets; **Ctrl+N**, **Ctrl+O**, **Ctrl+S**
  and **Ctrl+Shift+S** make, open, save and save as; **Ctrl+E** exports the PDF and **Ctrl+P**
  prints; **Ctrl+C**, **Ctrl+V** and **Ctrl+D** copy, paste and duplicate on the board; **F8** and
  **Shift+F8** go through the problems; **F6** reaches the selection bar; **Delete** deletes;
  **Shift+F10** opens the menu of what is selected; **Ctrl+PageDown** and **Ctrl+PageUp** change
  tab, with **Shift** they move it, **Ctrl+W** closes one and **Ctrl+Shift+T** opens it again.
  *Settings → Keyboard shortcuts*
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

## Known limitations

What LeatherCAD does not do yet, so it does not surprise you on the bench. Bugs confirmed on one
system are listed in each release's notes instead.

**The pocket check (*Holds*) is geometric.** It measures the stitching and the outline, nothing
else:

- **It counts neither the leather's thickness nor the stitching's pull.** Both take room from a
  pocket. The **Ease** is where you allow for them; with none, a card that fits on paper may not
  fit in leather.
- **With *Holds it fully*, the depth is read to the edge of the piece the stitching is on.** When a
  pocket's front is another piece — a front sewn to a panel, or holes punched through both while
  only the panel has stitching — the real opening is lower, and the pocket shallower, than the
  reading. *Holds* names the piece it measured to: if that is not your pocket's front, a pass
  means only that the pocket is not too shallow on that piece.
- **A pocket entered through a slit cut into the piece** reads its depth past the slit, to the
  outer edge, and so says it is deeper than it is.

**Teeth that run into each other are not reported.** With a typed tooth too big for the spacing —
a 4 mm prong at a 3.9 mm spacing — neighbouring holes cut one slot, and Problems says nothing. The
built-in irons' teeth never meet.

**Pieces stacked for a laser cut** with slanted slits cross their slits unless one of them has
*Inverse* lean; LeatherCAD does not know which pieces you stack.

**Printing:** *Print* sends the job itself only on Linux and macOS; on Windows and in the Flatpak
you save the PDF and print it at 100 %. Printed sheets have been measured on paper on Linux only;
a reading from Windows or macOS is still wanted, and so are the first paper readings of the
alignment marks and the mirrored pair's caption ([print log](print-verification-log.md)).
