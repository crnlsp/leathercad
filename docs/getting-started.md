# Getting started

From installing LeatherCAD to a pattern on paper that measures true: about fifteen minutes.

## 1. Install

Download the installer for your system from the
[latest release](https://github.com/crnlsp/leathercad/releases/latest).

| System | File | Then |
|---|---|---|
| Linux | the `.AppImage` | Make it executable (`chmod +x`) and run it. It installs nothing; keep it anywhere. |
| Linux | or the `.flatpak` | `flatpak install --user LeatherCAD-*.flatpak`. It adds LeatherCAD to your applications menu and opens `.lcp` files by double-click. It needs the Flathub remote, which most distributions have. |
| Windows | the `.exe` | Run it. It installs for your user only, with no administrator prompt. |
| macOS | the `.dmg` | Open it and drag LeatherCAD to Applications. It runs on Apple silicon and Intel. |

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

**To see a finished pattern first,** choose *Open sample project* from **?** (Help) at the top
right, or *open the sample wallet* in the empty **Parts** panel: the bifold wallet this page draws, with its lining and card
pocket. It opens untitled, so saving it asks where, and nothing you change reaches the copy inside
the app.

## 2. Draw a part

A card pocket, 96 × 60 mm, the shape a card holder is made from.

1. Choose **Rectangle** (**R**) in the tool rail. With *Draw as: Outline*, drag out a rectangle
   anywhere. It becomes a new part, listed on the left.
2. In **Properties** on the right, type **96** for *Width* and **60** for *Height*. Every number is
   in millimetres, and every number is exact: what you type is what prints.
3. Name the part *Pocket* at the top of the panel.

For a thumb scoop, draw the outline with **Polyline** (**P**) instead: click the corners, press
**A** before a segment to make it an arc, then **L** to go straight again. Click the first point to
close it.

## 3. Stitch it

1. Select the outline, and choose **Add stitch line**. It follows the edge 3.5 mm in, and keeps
   following it: change the outline and the stitch line moves with it.
2. Select the stitch line, and choose **Add holes**. Pick your pricking iron in the panel. The panel
   shows how many holes that makes and the spacing they came out at, which is slightly different
   from the iron's pitch because the holes have to fit the line exactly.

To stitch only some sides, as a pocket is, draw the stitch line yourself: *Draw as: Stitch* with
the Polyline tool, along the sides to be sewn.

**Measure** (**M**) puts a dimension on the drawing: click two corners. It prints.

The **Problems** drawer at the bottom says if anything will not make a good template — holes too
close to an edge, a stitch line that has lost its outline — and selecting a problem shows where.

## 4. Save

**Save** (**Ctrl+S**, **⌘S** on macOS) writes a `.lcp` file. If LeatherCAD or the computer stops
unexpectedly, it offers your unsaved work back the next time it starts; if you close with unsaved
changes, it asks first.

## 5. Print, and check the print

1. Choose the paper in your printer from the list beside **Print**. Each entry says what it
   prints, for example *3 sheets of A4, portrait (Strap taped)* or *1 sheet of A4, landscape*, so
   you can pick the one that uses the fewest sheets. **Parts** says which sheet each part prints
   on, and why a part will not print (it is hidden, or it has a problem).
2. Choose **Sheets** at the right of the bar under the project's name (**Ctrl+2**) to see the pieces
   on the paper exactly as the PDF will put them. A part bigger than a sheet is printed across
   several, taped together on a dashed join line with crosses on it; its joins also show on the
   board, labelled *Tape join*. Anything drawn in magenta is only on screen, never on paper.
   **Design** (**Ctrl+1**) takes you back to the board, where you left it.
3. **Print** (**Ctrl+P**), the green button. LeatherCAD's Print Preview shows the PDF it will send,
   sheet for sheet — numbered *Sheet 1 of 3* like the Sheets view. Choose the printer, the
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

## Where things are

- **The top bar:** the project menu at its left — the LeatherCAD mark — holds *New project*,
  *Open…*, *Save as…* and your recent projects. At its right, past the paper, **Export PDF** and **Print**,
  are **⚙** Settings and **?** Help.
- **Keyboard:** each tool's key is on its button; **Ctrl+Z** and **Ctrl+Shift+Z** undo and redo;
  **Ctrl+1** and **Ctrl+2** switch between Design and Sheets. *Settings → Keyboard shortcuts*
  (**Ctrl+/** or **?**) lists every key. **Ctrl+=** and **Ctrl+−** zoom, **Ctrl+0** fits the
  pattern in the window, **F11** is full screen.
- **Settings** (**Ctrl+,**): clear the recent projects, and choose how the legend and the tool
  rail start. They stay as you left them.
- **Logs:** *Help → About LeatherCAD → Show log folder*. Nothing is ever uploaded; attach the log
  to a bug report.
- **Licences:** *Help → About LeatherCAD → Third-party notices*, and `THIRD_PARTY_NOTICES.txt`
  beside the app.
- **Bugs and ideas:** [GitHub issues](https://github.com/crnlsp/leathercad/issues).
