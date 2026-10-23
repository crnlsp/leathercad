---
paths:
  - 'packages/persist/**'
  - 'packages/export/**'
  - 'packages/render/**'
  - 'fixtures/**'
---

# Files, export and rendering

Everything here produces bytes or pixels a person relies on: a project they reopen in a year, a
pattern they print and cut. See `docs/file-format.md` and `docs/printing.md`.

- **Validate once, at the edge.** `persist` parses a file with its zod schemas and migrations and
  hands on a typed project; nothing past it re-checks the shape. A file that fails is refused whole
  with a typed error (`InvalidProjectFileError`, `NewerFormatError`), never half-loaded.
- **Old files keep opening** *(strict)*. A schema change is a new version and a new migration,
  and every version bump commits `fixtures/format/v<N>.lcp`, which must keep loading
  (`docs/file-format.md` §4.2). Shipped migrations and their fixtures are never edited.
- **Output is deterministic.** The same project gives the same bytes: no clock, no randomness, no
  dependence on map iteration order the code did not choose. Pass the creation date in.
- **One table for styles.** A colour, stroke, dash or type size comes from `render/src/theme/`. An
  exporter and a screen backend that disagree about a role is a bug in one of them.
- **Backends translate; they do not decide.** What to draw is computed once from the project — the
  `DisplayList` for the screen, the `ExportScene` for files — and the canvas, SVG, PDF and DXF
  writers only translate it. Logic in one backend is logic the others miss.
- **A changed snapshot is reviewed, not accepted.** Look at the SVG or PDF difference and say in
  the commit why it changed.
