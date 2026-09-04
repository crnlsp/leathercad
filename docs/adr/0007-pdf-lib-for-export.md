# 7. pdf-lib for PDF export

**Status:** Accepted
**Date:** 2026-09-04

## Context

The product promise is that a line drawn as 100 mm measures 100 mm on paper. The PDF is how that
promise is delivered.

A constraint from the user shapes this decision: **the application will not drive a printer.** They
print from an ordinary PDF viewer. Direct CUPS submission is explicitly deferred. So the file
itself has to be trustworthy in someone else's software, with no cooperation from us at print time.

## Decision

**pdf-lib** (MIT) to write PDFs directly as vector content.

PDF's default user space is 1/72 inch, so placing geometry at `mm × 72/25.4` and emitting no
scaling transform makes 1:1 the *definition* of what was written rather than something the code has
to achieve. pdf-lib gives that level of control: explicit MediaBox, explicit content stream, no
layout engine interposing.

**pdfjs-dist** (Apache-2.0) as a dev dependency, to parse exported PDFs back in tests. Asserting
that we called a draw function with 100 proves nothing about the file; parsing the artefact and
converting points back to millimetres does.

## Consequences

- Because we cannot rely on the viewer, correctness is defended three times over: `/PrintScaling
  /None` in the document's viewer preferences (Acrobat and several others honour it and default the
  dialog to Actual size), a printed instruction to print at 100%, and a 50 mm verification square
  the user can measure with a steel rule. Any one of them can fail silently; all three failing at
  once is unlikely.
- Fonts must be embedded for text to render identically everywhere, which is why they are vendored
  rather than taken from the system.

## Alternatives rejected

- **`window.print()` or Chromium's `printToPDF`.** The reason this project exists in the shape it
  does. Browser print paths default to "fit to printable area" and will silently shrink output by
  3–6%, which is invisible until leather has been cut. See `docs/printing.md` §2.
- **jsPDF.** Oriented toward document generation with a coordinate system that is easy to get
  wrong; less direct control over the content stream.
- **Generating PostScript or raw PDF by hand.** No dependency, but object numbering, the xref table
  and stream lengths are all places to introduce a corrupt file that some viewers open and others
  do not.
