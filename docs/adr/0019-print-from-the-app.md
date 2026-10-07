# 19. Print from the app: pdf.js for the preview, the CUPS client with scaling off

**Status:** Accepted
**Date:** 2026-10-01
**Amends:** [ADR 0007](0007-pdf-lib-for-export.md)'s constraint that *the application will not drive
a printer*. pdf-lib stays the writer.

## Context

ADR 0007 made the PDF trustworthy in someone else's software, and left printing to the maker's own
viewer. A physical print of the bifold sample (A4, a Brother HL-L2442DW mono laser, CUPS 2.4.19 and
libcupsfilters 2.2) measured the 100 × 5 mm gauge as about 96 × 4.8 mm. The same came out of
Okular in its default *Fit to printable area* and again in *None; print original size*, and out of a
browser. 0.96 is (210 − 2 × 4.23) / 210: the page fitted into the printer's margins.

The PDF was right. Its MediaBox is exactly A4, it has no CropBox, Rotate, UserUnit or `cm` operator,
and poppler measures the gauge at 100.2 mm of ink (100 mm plus the 0.2 mm stroke). The scaling is
CUPS's. A job that does not carry `print-scaling=none` gets libcupsfilters' default, `auto`, and its
`pdftopdf` treats `auto` as "fit the page into the printable area". Okular sends `fit-to-page` only
in its fit mode and never `print-scaling=none`. The browser job carried no scaling option at all.
Running the installed `pdftopdf` on the PDF with an A4 PPD reproduces both: 96.2 mm without the
option, 100.2 mm with it.

No PDF-side workaround survives this. A smaller CropBox makes `auto` *enlarge* (a 7 mm inset printed
102.1 mm), and it would be exact only if the box equalled each printer's own margins, which a PDF
cannot know. `/PrintScaling /None` is a viewer preference that this path ignores.

So the setting that decides 1:1 is one a maker cannot reach from a viewer on this setup. The app
has to send the job itself.

## Decision

**Print → LeatherCAD's Print Preview → the printer.** The app writes the PDF once, from the
`SheetPlan` the Sheets view draws. The preview shows that file, and those same bytes go to the
printer. Nothing new lays out a sheet or scales one.

### The preview: pdfjs-dist 6.3.289

**pdfjs-dist** (Apache-2.0, Mozilla), pinned exactly, as a development dependency of `apps/desktop`
that Vite bundles. It is pure JavaScript with a Web Worker. It draws the bytes it is given, so the
preview is the printed file, not a second drawing of the pattern that could drift from it.

- It adds about 1.7 MB to the renderer (`pdf.min.mjs` 459 kB, the worker 1.27 MB). It loads WebAssembly
  only for JPEG 2000 and colour profiles, which LeatherCAD never writes.
- Proved before anything was built. In the built app, loaded from `file://` under the shipped
  content security policy (`script-src 'self'`, no `'unsafe-eval'`, no `'wasm-unsafe-eval'`) and the
  current fuses, a real module worker loads from the bundled file. pdf.js draws all three sheets of
  the print test at 595.28 × 841.89 pt, text outlines included.
- Its only optional dependency, `@napi-rs/canvas`, renders under Node. The app never does that, so
  `pnpm-workspace.yaml` ignores it, and no native binary is installed.
- pdf.js transfers the buffer it is given to its worker. The preview hands it a copy, so the bytes
  printed are never the detached original.

### The transport: the system's CUPS client, from the main process

`lpstat -e` and `lpstat -d` list the printers and the default. `lpoptions -p <printer> -l` reads
each printer's paper sizes, and only reads: nothing ever sets a printer option. `lp` takes the
PDF on its standard input:

```bash
lp -d <printer> -t <project> -n <copies> -P <sheets> \
   -o media=<paper> -o print-scaling=none -o fit-to-page=false
```

These run through `execFile`, never a shell, with `LC_ALL=C` because their output is parsed. The
main process checks every job from the renderer as untrusted. The printer must be one CUPS lists
at that moment, so a name like `-o…` can never become an option. Copies are 1–99, sheets are
positive integers, and paper is a bare name. The data must be a PDF.

Physically verified before the interface was built. The print test sent this way to the same
Brother printer measured true on every reading taken (log, 2026-10-01). CUPS stored the job with
`print-scaling=none`, `fit-to-page=false`, `media=A4`, `page-ranges` and `copies` exactly as sent.

**No npm dependency for printing.** The CUPS tools are the system's. Nothing wraps them.

### Where the app does not print

The preview is the same everywhere. Where the app cannot send the job, its last step is **Save
PDF…**: it writes the bytes shown and says how they must be printed (*Actual size*, never *Fit* or
*Shrink*). That covers:

- **Windows.** There is no CUPS, and no transport has been chosen yet. SumatraPDF is the candidate
  (GPL-3.0, shipped beside the app, `-print-settings noscale`), for its own ADR once it is measured
  on paper.
- **The Flatpak.** The freedesktop runtime (24.08 and 25.08) ships libcups and `lpr`, but not `lp`,
  `lpstat` or `lpoptions`, and Electron's base app adds none. `--socket=cups` alone would give a
  Print button that cannot work, so no permission is added. The app finds no `lpstat` and saves a
  PDF instead.
- **A system whose CUPS scheduler is not running.**

### Landscape is not sent

Measured through the installed `pdftopdf` and `pdftoraster`, there is no CUPS option that turns a
landscape page onto upright paper without scaling it:

- With `print-scaling=none` the page is not turned at all. `pdftoraster` lays it unturned on the
  upright sheet, and everything past 210 mm is cut off.
- Without it, the page is turned and shrunk to 0.96.
- Any `orientation-requested` or `landscape` option brings the shrink back, even with
  `print-scaling=none`.

So the preview does not send landscape sheets, and says why. Sending them needs every sheet in the
PDF to be upright, with a landscape layout turned a quarter inside it. That is a change to the
writer, and so to `printing.md` §6.1.

## Consequences

- The supported workflow is **Print → Preview → Print**. *Export PDF* stays, for a file, and its
  tooltip says how to print one.
- The app now asks for no scaling in the one place a maker cannot: the job. It can promise that it
  sent a job with scaling off. It **cannot** promise the paper is 1:1: a driver or a printer can
  still scale. The 100 × 5 mm gauge on every sheet stays the physical check, and the preview says
  to measure it.
- macOS runs the same code against Apple's own CUPS, whose `cgpdftopdf` is closed source. It counts
  as unverified until a gauge printed there is in the log.
- Printers that render PDF themselves, on a queue that passes the PDF through, receive
  `print-scaling=none` as an IPP attribute and must honour it. The gauge is again the check.
- `e2e/print-preview.spec.ts` puts its own `lpstat`, `lpoptions` and `lp` first on the app's PATH.
  It asserts the exact `lp` arguments, and measures what `lp` received like an exported PDF. Where
  CUPS's `pdftopdf` is installed, it runs that filter on those bytes with the job's options and
  measures the result.
- One more pinned dependency to follow (osv-scanner, Dependabot). pdf.js majors move often (4 → 6
  in two years); `pdfPages.ts` is the only file that imports it.

## Alternatives rejected

- **The webview's or Chromium's print path** (`webContents.print`, `window.print`, Chromium's PDF
  viewer and its Print button). ADR 0007 and `printing.md` §2 rule these out: they bring their own
  scaling.
- **Rebuilding the preview from the Sheets view's drawing.** It needs no dependency and draws the
  same `sheetInk`, but it shows the plan, not the file. The preview's promise is that it shows
  what is sent.
- **react-pdf** (MIT). Eight more runtime dependencies, and pdf.js pinned for us, to save fifty
  lines.
- **EmbedPDF** (PDFium in WebAssembly, MIT). A 7.5 MB module, seven font packages as hard
  dependencies, and `'wasm-unsafe-eval'` in the content security policy. It has no advantage for
  vector-only pages.
- **`@printers/printers`** (a Rust Node-API module). On Linux and macOS it calls `cupsPrintFile`,
  which is what `lp` does. On Windows it writes the file raw to the spooler, which prints a PDF only
  on printers that understand PDF, or else needs Ghostscript (AGPL). It would also be the first
  native module the app ships.
- **The `node-printer` forks.** Compiled add-ons rebuilt for every Electron version, last released
  2022–2025.
- **`pdf-to-printer`.** A Windows wrapper around a 2022, 32-bit SumatraPDF. SumatraPDF itself is
  the Windows candidate.
- **`ipp`, `unix-print`, `node-cups`, `cups-printer`.** Stale, or wrappers around twenty lines of
  `execFile`. Sending IPP straight to this printer fails anyway: it accepts no PDF.
- **A CropBox the size of the printable area.** `auto` enlarges it instead. It is exact only for one
  printer's margins.
