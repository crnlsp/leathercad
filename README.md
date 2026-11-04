<div align="center">

<img src="apps/desktop/build/icon.svg" width="104" alt="">

# LeatherCAD

**Leathercraft patterns that print at exactly 1:1.**<br>
Draw in real millimetres, stitch along the edge, and print a template you can cut out.

[![Latest release](https://img.shields.io/github/v/release/crnlsp/leathercad?label=download&color=c8963e)](https://github.com/crnlsp/leathercad/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/crnlsp/leathercad/ci.yml?branch=main&label=tests)](https://github.com/crnlsp/leathercad/actions/workflows/ci.yml)
![Linux · Windows · macOS](https://img.shields.io/badge/Linux%20·%20Windows%20·%20macOS-2b2d31)
[![Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-2b2d31)](LICENSE)

**[Download](https://github.com/crnlsp/leathercad/releases/latest)** ·
**[Getting started](docs/getting-started.md)** ·
**[What's new](CHANGELOG.md)** ·
**[Roadmap](docs/roadmap.md)**

<br>

<img src="docs/images/design.png" width="900" alt="LeatherCAD with a bifold wallet drafted: the outer panel stitched all round with a fold down the middle, the lining, and a card pocket with a thumb scoop. Parts on the left as a tree, the selected stitch holes' pitch, spacing and runs on the right, and the same in a bar under the piece.">

</div>

## Why LeatherCAD

A general drawing program sees lines. LeatherCAD sees **leather**: an outline you cut, a stitch line
that follows it, holes at your pricking iron's pitch, a fold, a pocket you cut twice. Change the
outline and everything that depends on it follows. Then it prints on ordinary paper, **true to the
millimetre** — and every sheet carries a 100 mm gauge so you can check that with a steel rule.

## A bifold wallet, start to finish

<div align="center">
<img src="docs/images/demo.gif" width="900" alt="Drafting a bifold wallet in LeatherCAD: a rectangle typed to 200 × 95 mm with rounded corners, a stitch line and holes added, a fold drawn, a lining, a card pocket with a thumb scoop stitched on three sides, then the Sheets view showing it on A4.">
</div>

1. **Draw roughly, then type it exactly.** Drag out a rectangle, then give it 200 × 95 mm and 5 mm
   corners. Every number is in millimetres, and what you type is what prints.
2. **Stitch it.** *Add stitch line* follows the edge, 3.5 mm in unless you say otherwise; *Add
   holes* places them at your iron's pitch and shows how many there are and the spacing they came
   out at.
3. **Fold it.** A fold line shows which way it folds.
4. **Add the rest.** A lining, and a card pocket with a thumb scoop, stitched on three sides and
   marked *cut 2*.
5. **See the paper before you print.** The Sheets view shows every piece exactly where the PDF will
   put it.

This demo is recorded from the real app by a script
([`e2e/media/readme.spec.ts`](e2e/media/readme.spec.ts)), so it always shows what LeatherCAD
actually does.

## What it does

<table>
<tr>
<td width="50%" valign="top">

### Parts that know what they are

Rectangles, circles, arcs, lines and polylines with arc segments — a pocket with a thumb scoop is one
outline. Cut-outs, folds, marking lines, hardware holes, text and dimensions belong to the part they
are drawn on.

### Stitching that follows the edge

A stitch line is an inset of its outline, and holes are placed along it at the iron's pitch, with a
hole on every corner. Change a panel from 105 to 110 mm and its stitching updates itself. A seam
allowance can grow outward from the stitching instead.

### Problems stated, not hidden

Holes too close to the edge, spacing far from the iron's pitch, a stitch line that lost its outline:
each one is listed, and selecting it shows you where.

</td>
<td width="50%" valign="top">

### See the paper first

The paper list says what each choice prints — *3 sheets of A4, portrait*, *1 sheet of A4,
landscape* — and Parts says which sheet each part is on. A part bigger than the paper is tiled across
sheets with join lines and registration crosses, never scaled to fit.

### Print, and check the print

**Print** shows the PDF in LeatherCAD's own preview, and from the AppImage on Linux — and on macOS,
not yet measured there — sends exactly that file to the printer with scaling turned off. There is no print dialog to get wrong. A vector PDF on A5, A4, A3,
Letter or Legal, the same file *Export PDF* saves. Every sheet has a 100 × 5 mm gauge at its foot:
if it measures true, so does everything on the sheet. For a laser cutter or a vector editor, *Export
SVG* and *Export DXF* write the board in millimetres, a layer to each role.

### Your work is kept

Closing with unsaved changes asks first, and after a crash LeatherCAD offers your unsaved work back.

</td>
</tr>
</table>

<table>
<tr>
<td width="62%" align="center">
<img src="docs/images/sheets.png" alt="The Sheets view: the outer turned to fit sheet 1, and the lining and the card pocket on sheet 2, both A4, with the sheet numbers.">
<br><sub><b>The Sheets view</b> — the pieces on the paper, exactly as the PDF places them.</sub>
</td>
<td width="38%" align="center">
<img src="docs/images/print.png" alt="The first page of the exported PDF: the outer, turned to fit, with its stitch holes and fold, and the 100 × 5 mm box at the foot of the sheet.">
<br><sub><b>The printed sheet</b> — with the 100 × 5 mm box to check it by.</sub>
</td>
</tr>
</table>

## Download

The **[latest release](https://github.com/crnlsp/leathercad/releases/latest)** has an AppImage,
a Flatpak and a `.deb` for Linux, an installer for Windows, and a dmg for macOS on Apple silicon and
Intel. LeatherCAD is free and open source, and its installers are **not code-signed** — signing costs
money every year — so Windows and macOS warn the first time you open it.
[Getting started](docs/getting-started.md#1-install) says which file to take, how to open it
anyway, and how to check that a download is the one this repository built.

It is made for Arch Linux and Ubuntu LTS (measured), Windows 10 22H2 and 11 (tested), and other
Linux and macOS 12 or newer (shipped). The
[supported systems](docs/getting-started.md#supported-systems) say what each level promises.

## The 1:1 promise

A line drawn as 100 mm measures 100 mm on paper. Everything in LeatherCAD's design serves that:

- **Millimetres all the way down.** The model has no pixels; the screen is the only place that
  knows about them.
- **Never scaled to fit.** A part too big for the sheet gets more sheets, not a smaller drawing.
- **Measured on every change.** CI exports a print test and measures the PDF, rendered by an
  independent renderer, on Linux, Windows and macOS
  ([`e2e/print-verification.spec.ts`](e2e/print-verification.spec.ts)).
- **Measured on paper.** Before a release, a person prints it and measures it with a steel rule
  ([`docs/print-verification-log.md`](docs/print-verification-log.md)).

## Translations

LeatherCAD offers **English, Polish, German, Russian and French** in production builds. Choose a language
in *Settings › Language*, or follow your system language. Changes apply immediately and are kept
between launches.

**English is the source of truth.** Feature pull requests only need to update English. Missing
translations fall back to English; updating the other languages in the same pull request is optional.
Translation coverage is informational and does not block development or releases.

**Help translate or improve the wording:**

1. Edit the matching file in [`apps/desktop/src/locales/`](apps/desktop/src/locales/), or copy
   `en.json` to a new BCP 47 filename such as `es.json` or `pt-BR.json`.
2. Keep keys and `{{placeholders}}`. Translate a whole plural family with every CLDR form your
   language uses; leaving the whole family out is allowed. Follow the
   [translation style guide and terminology table](docs/localization.md).
3. Run `pnpm test locales` to check structure, then `pnpm locales:report` to see remaining work.
4. Try the file in `pnpm dev`, then open a pull request into `develop`. New unregistered languages
   appear as previews in development; registration is an explicit maintainer decision.

Polish is prepared for the maintainer’s personal review; that review has not yet taken place.
`pnpm locales:report --review pl` lists every string beside its English source.
German, Russian and French translations were prepared with AI assistance and would benefit from further
native-speaker review. Russian incorporates and updates **F1ystar’s contribution in
[PR #87](https://github.com/crnlsp/leathercad/pull/87)**.

Printed pattern captions, generated data names and default filenames remain English. Unnamed tabs
use a translated placeholder until named. UI localization does not localize PDF pattern content
or add Cyrillic outlines to printed patterns. See
[ADR 0018](docs/adr/0018-interface-language.md) and the [verification record](docs/localization-verification.md).

## Documentation

**For makers:** [Getting started](docs/getting-started.md) — install, draw, stitch, print, and check
the print. [Glossary](docs/glossary.md) — the leathercraft words the app uses.

**For contributors:** start with [CONTRIBUTING.md](CONTRIBUTING.md), then

| Document | What it covers |
|---|---|
| [product-spec.md](docs/product-spec.md) | What LeatherCAD is and is not, its principles and its direction |
| [product-roadmap.md](docs/product-roadmap.md) | Where it is going: themes, milestones and what depends on what, drawn |
| [architecture.md](docs/architecture.md) | The stack, the layers and the rules between them |
| [domain-model.md](docs/domain-model.md) | Parts, features, derivation, stitching, validation |
| [geometry.md](docs/geometry.md) | Representation, numerics, offsetting |
| [file-format.md](docs/file-format.md) | The `.lcp` format, versions and migrations |
| [printing.md](docs/printing.md) | Export, pagination, tiling, the accuracy budget |
| [testing.md](docs/testing.md) | Test layers, property tests, CI |
| [roadmap.md](docs/roadmap.md) | What is next, and what is known but not fixed |
| [performance-backlog.md](docs/performance-backlog.md) | Measured performance findings, priorities, tasks and acceptance criteria |
| [adr/](docs/adr/) | Why each decision was made |

[`CLAUDE.md`](CLAUDE.md) holds the invariants no change may break. Found a security problem?
Report it privately — see [`SECURITY.md`](SECURITY.md).

## Licence

[Apache-2.0](LICENSE). The interface and every printed word use IBM Plex Sans, under the
[SIL Open Font Licence](assets/fonts/OFL.txt). *Help → About LeatherCAD → Third-party notices*
lists everything else the app ships.
