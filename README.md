<div align="center">

<img src="apps/desktop/build/icon.svg" width="104" alt="">

# LeatherCAD

**Leathercraft patterns that print at exactly 1:1.**<br>
Draw in real millimetres, stitch along the edge, and print a template you can cut out.

[![Latest release](https://img.shields.io/github/v/release/crnlsp/leathercad?label=download&color=c8963e)](https://github.com/crnlsp/leathercad/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/crnlsp/leathercad/ci.yml?branch=main&label=tests)](https://github.com/crnlsp/leathercad/actions/workflows/ci.yml)
![Linux · Windows · macOS](https://img.shields.io/badge/Linux%20·%20Windows%20·%20macOS-2b2d31)
[![Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-2b2d31)](LICENSE)

**[Download](#download)** ·
**[Getting started](docs/getting-started.md)** ·
**[Features](#features)** ·
**[Languages](#languages)** ·
**[Contributing](#contributing)** ·
**[What's new](CHANGELOG.md)**

<br>

<img src="docs/images/design.png" width="900" alt="LeatherCAD with a bifold wallet drafted: the outer panel stitched all round with a fold down the middle, the lining, and a card pocket with a thumb scoop. Parts on the left as a tree, the selected stitch holes' pitch, spacing and runs on the right, and the same in a bar under the piece.">

</div>

## Why LeatherCAD

A general drawing program sees lines. LeatherCAD sees **leather**: an outline you cut, a stitch line
that follows it, holes at your pricking iron's pitch, a fold, a pocket you cut twice. Change the
outline and everything that depends on it follows. Then it prints on ordinary paper, **true to the
millimetre**, with a 100 mm gauge on every sheet so you can check it with a steel rule.

## Download

Get the file for your system from the
**[latest release](https://github.com/crnlsp/leathercad/releases/latest)**. It's free and open source.

| System | File |
|---|---|
| Ubuntu | `.deb` |
| Any Linux | `.AppImage` (needs FUSE 2) or `.flatpak` |
| Windows 10 and 11 | `.exe` |
| macOS 12 or newer, Apple silicon and Intel | `.dmg` |

The installers aren't code-signed, so Windows and macOS warn the first time you open LeatherCAD.
[Getting started](docs/getting-started.md#1-install) explains how to install each file, how to open
it past the warning, and how to check that a download is the one this repository built. It also
says [how well each system is supported](docs/getting-started.md#supported-systems).

## A bifold wallet in five steps

<div align="center">
<img src="docs/images/demo.gif" width="900" alt="Drafting a bifold wallet in LeatherCAD: a rectangle typed to 200 × 95 mm with rounded corners, a stitch line and holes added, a fold drawn, a lining, a card pocket with a thumb scoop stitched on three sides, then the Sheets view showing it on A4.">
</div>

1. **Draw roughly, then type it exactly.** Drag out a rectangle, then make it 200 × 95 mm with 5 mm
   corners.
2. **Stitch it.** *Add stitch line* follows the edge; *Add holes* places them at your iron's pitch.
3. **Fold it.** A fold line shows which way it folds.
4. **Add the rest.** A lining, and a card pocket with a thumb scoop, marked *cut 2*.
5. **Check the paper, then print.** The Sheets view shows every piece where the PDF will put it.

The demo is recorded from the real app by a script, so it always shows what LeatherCAD does.

## Features

- **Parts that know what they are.** Outlines from rectangles, circles, arcs and polylines.
  Cut-outs, folds, marking lines, hardware holes, text and dimensions belong to the part they're
  drawn on.
- **Stitching that follows the edge.** A stitch line is an inset of its outline, with a hole on
  every corner. Make a panel 110 mm instead of 105 and its stitching updates itself.
- **Problems stated, not hidden.** Holes too close to the edge, or spacing far from the iron's
  pitch, are listed. Select one to see where it is.
- **See the paper first.** It says what each paper choice prints, such as *3 sheets of A4*. A part
  bigger than a sheet is tiled across several sheets with registration crosses, never scaled to fit.
- **Print without a print dialog.** On Linux and macOS, LeatherCAD sends the PDF to the printer with
  scaling turned off. On Windows and in the Flatpak, save the PDF and print it at 100 %.
- **Export for cutters and editors.** A vector PDF on A5, A4, A3, Letter or Legal. SVG and DXF in
  millimetres, with one layer for each role.
- **Your work is kept.** Closing with unsaved changes asks first. After a crash, LeatherCAD offers
  your unsaved work back.

<table>
<tr>
<td width="62%" align="center">
<img src="docs/images/sheets.png" alt="The Sheets view: the outer turned to fit sheet 1, and the lining and the card pocket on sheet 2, both A4, with the sheet numbers.">
<br><sub><b>The Sheets view</b> shows the pieces on the paper, exactly as the PDF places them.</sub>
</td>
<td width="38%" align="center">
<img src="docs/images/print.png" alt="The first page of the exported PDF: the outer, turned to fit, with its stitch holes and fold, and the 100 × 5 mm box at the foot of the sheet.">
<br><sub><b>The printed sheet</b> has a 100 × 5 mm box to check it by.</sub>
</td>
</tr>
</table>

## The 1:1 promise

A line drawn as 100 mm measures 100 mm on paper. These four rules keep that true:

- **Millimetres throughout.** Pixels exist only on screen, never in your pattern.
- **Never scaled to fit.** A part too big for the sheet gets more sheets, not a smaller drawing.
- **Measured on every change.** CI exports a test print on Linux, Windows and macOS, and an
  independent renderer measures the PDF.
- **Measured on paper.** Before each release, someone prints it and measures it with a steel rule
  ([log](docs/print-verification-log.md)).

## Languages

Choose one in *Settings › Language*, or let LeatherCAD follow your system.

| | Language | How it was translated | Native-speaker review | Coverage |
|---|---|---|---|---:|
| 🇬🇧 | English | Source language (British spelling) | — | 100 % |
| 🇵🇱 | Polski | AI-assisted, checked with Hunspell | Pending: the maintainer's own | 96.2 % |
| 🇩🇪 | Deutsch | AI-assisted, checked with Hunspell | **Wanted** | 95.2 % |
| 🇷🇺 | Русский | Based on F1ystar's [PR #87](https://github.com/crnlsp/leathercad/pull/87), updated with AI assistance, checked with Hunspell | **Wanted** | 96.5 % |
| 🇫🇷 | Français | AI-assisted, checked with Hunspell | **Wanted** | 95.2 % |
| 🇪🇸 | Español | AI-assisted | **Wanted** | 96.8 % |

The flags show which variant each translation is written in, not who it's for. Most of what
coverage leaves out is words that are the same as English, such as *PDF*. Anything not yet
translated shows in English. Printed patterns stay in English.

> **Native speakers: corrections are very welcome.** None of these translations has had a native
> speaker's review yet. Leathercraft has its own words, and a maker who uses them every day will
> spot what a dictionary misses. A pull request fixing one string helps, and so does an issue that
> says *"this reads wrong"*. [Translating LeatherCAD](docs/localization.md) shows how, and has the
> terminology table.

## Contributing

Pull requests go into `develop`. Start with [CONTRIBUTING.md](CONTRIBUTING.md): setup, the checks a
change must pass, and how releases work. [`CLAUDE.md`](CLAUDE.md) lists the rules no change may
break. The [architecture](docs/architecture.md), the [decision records](docs/adr/) and the
[roadmap](docs/roadmap.md) explain how LeatherCAD works and what's next. Everything else is in
[`docs/`](docs/).

New to leathercraft words? The [glossary](docs/glossary.md) explains the ones the app uses.

Found a security problem? Report it privately; see [SECURITY.md](SECURITY.md).

## Licence

[Apache-2.0](LICENSE). The interface and every printed word use IBM Plex Sans, under the
[SIL Open Font Licence](assets/fonts/OFL.txt). *Help → About LeatherCAD → Third-party notices* lists
everything else the app ships.
