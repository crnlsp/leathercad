# Getting started

From installing LeatherCAD to a pattern on paper that measures true: about fifteen minutes.

## 1. Install

Download the installer for your system from the
[latest release](https://github.com/cornelisp/leathercad/releases/latest).

| System | File | Then |
|---|---|---|
| Linux | the `.AppImage` | Make it executable (`chmod +x`) and run it. It installs nothing; keep it anywhere. |
| Windows | the `.exe` | Run it. It installs for your user only, with no administrator prompt. |
| macOS | the `.dmg` | Open it and drag LeatherCAD to Applications. It runs on Apple silicon and Intel. |

Until the release's signing certificates are in place, Windows and macOS warn about an unknown
developer. On Windows choose *More info → Run anyway*; on macOS open it once from *System Settings →
Privacy & Security → Open Anyway*.

When a project was saved by a newer LeatherCAD than yours, the app says so and names the version:
update, and it opens.

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

1. Choose the paper in your printer from the list beside **Export PDF**. Each entry says what it
   prints, for example *3 sheets of A4, portrait (Strap taped)* or *1 sheet of A4, landscape*, so
   you can pick the one that uses the fewest sheets. **Parts** says which sheet each part prints
   on, and why a part will not print (it is hidden, or it has a problem).
2. Choose **Sheets** at the right of the bar under the project's name (**Ctrl+2**) to see the pieces
   on the paper exactly as the PDF will put them. A part bigger than a sheet is printed across
   several, taped together on a dashed join line with crosses on it; its joins also show on the
   board, labelled *Tape join*. Anything drawn in magenta is only on screen, never on paper.
   **Design** (**Ctrl+1**) takes you back to the board, where you left it.
3. **Export PDF** (**Ctrl+E**). The PDF is what the Sheets view showed, sheet for sheet — its pages
   are numbered *Sheet 1 of 3* like the view — and it opens in your system's PDF viewer.
4. Print from the viewer at **Actual size** or **100 %** — never *Fit to page* or *Shrink*.
5. Check it with a steel rule. **Every sheet has a 50 mm square and a 100 mm ruler.** If they
   measure 50 and 100, everything on the sheet is true to size. If they do not, the viewer or the
   printer scaled it: fix the print setting and print again.

## Where things are

- **Keyboard:** each tool's key is on its button; **Ctrl+Z** and **Ctrl+Shift+Z** undo and redo;
  **Ctrl+1** and **Ctrl+2** switch between Design and Sheets.
- **Logs:** *Help → Show Log Folder*. Nothing is ever uploaded; attach the log to a bug report.
- **Licences:** *Help → Third-Party Notices*, and `THIRD_PARTY_NOTICES.txt` beside the app.
- **Bugs and ideas:** [GitHub issues](https://github.com/cornelisp/leathercad/issues).
