# Roadmap

**Released:** v1.0.1 (2026-09-24) · **Next:** 1.1 · **Last updated:** 2026-09-26

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md).

---

## How to read this

- **Every item has a number** — a slice (`3.9`, `6.2`) or a finding (`Q1`). The numbers are stable:
  `/slice 3.9` always means the same thing, and slice numbers continue the ones in the 1.0 record.
- **A slice is a vertical piece of work** that ends with the app running, tests green, and
  something a person can see. How one is planned, built and landed is in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Marks:** ☐ planned · ◐ in progress · ✅ done. A done item moves to the changelog at the next
  release and is deleted here.
- **Scope rule for 1.1,** carried over from 1.0: an idea that is not needed for everyday use, the
  leathercraft workflow, pattern correctness or print correctness waits for a later release — even
  when it turns up halfway through something else. Write it under *Later* instead.

## Where 1.0 left things

| Milestone | Proves | |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, on a zoomable canvas with a mm ruler | ✅ |
| **M2** | Draw a rounded rectangle with snapping, undo and redo it | ✅ |
| **M3** | Change a rectangle's width; its stitch line and holes update live | ✅ |
| **M4** | Save, quit, reopen, and everything is exactly as it was | ✅ |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer; the readings still have to be written into [`print-verification-log.md`](print-verification-log.md) (**R1**) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see *Release engineering*).

---

## 1.1 — the next release

The theme: from a tool that works to one you can live in. The order within each group is the
suggested order of work.

### Everyday use

- ☐ **8.2 Preferences and recent files.** A preferences file; *File → Open Recent* (absorbs 5.3c);
  the canvas legend and the tool rail remember whether they were open (F.2 and F.7 could not); a
  keyboard shortcut map.
- ☐ **8.3 A worked sample project.** *Help → Open Sample*: the bifold wallet the README demo draws
  (`e2e/media/readme.spec.ts`), saved as a `.lcp` in `fixtures/projects/`. Absorbs 5.4.
- ☐ **8.5 File association and Flatpak.** Double-click a `.lcp` to open it (MIME type on Linux,
  file association on Windows and macOS), and a Flatpak beside the AppImage.
- ☐ **8.4b The rest of the native menu.** A Draw menu, zoom, and the paper, beyond the View menu's
  *Design / Sheets*.

### Drawing and editing

- ☐ **3.9 Vertex editing.** Add, remove and move a drawn path's points; corner ↔ smooth. Also
  closes ADR 0010's open item: an anchor on a drawn path does not yet survive its points being
  renumbered.
- ☐ **3.10 Guides, alignment and distribution.**
- ☐ **3.12 Convert to drawn path.** The explicit escape hatch for a circle someone wants to squash
  or an arc they want to reshape freely, saying plainly that it stops being a circle or an arc.
  Until then, 3.7 refuses those transforms.
- ☐ **3.11 Isolate a tool's overlay from the draw loop.** An overlay that throws stops the whole
  canvas painting (grid, rulers, every feature). Catch per tool, draw the rest of the frame, and
  report the failure where a developer sees it; test it with a deliberately throwing tool.
- ☐ **4.10b Dimensions drawn like drafting.** Arrowheads, with the number breaking the line — the
  one item of the visual identity test that only partly passes. It prints, so it is a measurement
  change, not a canvas treatment.
- ☐ **4.14 A row of holes along a line** that is not a stitch line (carried forward from Phase 4).

### Output

- ☐ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](printing.md) §14.
- ☐ **6.5 DXF export** (R12), for laser and CNC users.
- ☐ **6.4 The rest of the export dialog.** Presets, layers, bounds, and printing only some sheets.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
- ☐ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. Pagination still never
  rotates a part: leather stretches across the grain, and the model does not know the grain yet.
- ☐ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The square and ruler
  already show when a printer is off.
- ☐ **7.8 A slimmer verification block.** Needs a new physical measurement before and after.

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. Each is small
enough to fix in 1.1; the ones marked **bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| **Q1** | **bug** · `intersectSegments` is not symmetric: two collinear lines whose ends are 1e-9 mm apart give one intersection in one argument order and none in the other. Reproduces with `LEATHERCAD_FC_SEED=-1607984333 pnpm exec vitest run --project geometry intersect.test` | A local property-test run, 2026-09-24; the same "order-dependent `intersectSegments`" Phase 4 recorded | Add the counterexample as an example test, fix the collinear branch |
| **Q2** | **bug** · A fold drawn edge to edge is reported as off the material (DR2's sampled containment) | Phase 4 close-out; met again drawing the README demo, whose folds stop short of the edges | Fix the containment test for points on the outline |
| **Q3** | Two reads of refs during render in `CanvasHost.tsx` can show stale state: the cursor style and the canvas notice's bounds | The engineering-tooling checkpoint | Look at both; the other eight are the deliberate latest-value pattern |
| **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one |
| **Q5** | The property panel's sizing, and the Parts tree cutting feature names at about ten characters | UI audit, deferred opportunities | One layout pass |
| **Q6** | `packages/domain/src/workloads.ts` shows 0 % coverage since the performance ceilings moved to their own step | Moving `perf.test.ts` out of the coverage run | Exclude test support from coverage, or cover it |
| **Q7** | The golden-fixture layer [`testing.md`](testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | Build it for offsetting and hole distribution first, where silent drift costs leather |

**Performance, recorded as information, not targets:** building the display list for the
636-hole benchmark strap takes 87 µs (13 µs before F.7); offsetting a 500-point traced outline
takes ~74 ms, over the 50 ms budget on its own; and a huge drawing at the smallest pitch makes
millions of holes, so a hole-count budget may be wanted one day. None is to be optimised until it
is felt.

### Release engineering

| # | What | Plan |
|---|---|---|
| **R1** | The physical print check (7.7) was done, but its readings are not in [`print-verification-log.md`](print-verification-log.md), which still says *pending* on all three platforms | Record one row per platform. Until then the project does not claim verified 1:1 output in writing |
| **R2** | `develop` was deleted once, by merging the `develop` → `main` pull request | Protect `main` and `develop` with a branch ruleset (available now the repository is public): no deletion, no force push, pull requests only, CI required |
| **R3** | 1.0.1's release notes list every fix twice, because pull requests into `develop` were merged with merge commits, which release-please reads as well as the commits inside them | Squash-merge into `develop` from now on ([`CONTRIBUTING.md`](../CONTRIBUTING.md)); `CHANGELOG.md` is corrected; edit the GitHub release notes by hand |
| **R4** | Tags read `leathercad-v1.0.1`, not `v1.0.1` | Decide before 1.1 whether to keep the component in the tag; changing it later breaks the link between releases |
| **R5** | `package.yml` builds Windows and macOS only when packaging could have changed, because a private repository pays for those minutes. The repository is public now, where they are free | Run it on every pull request |
| **R6** | The renderer loads from `file://`, which keeps the `GrantFileProtocolExtraPrivileges` fuse on | Serve it from a custom `app://` protocol, then turn the fuse off (ADR 0014) |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

---

## Later

Ordered by expected value, not difficulty. The numbers are Phase 9's from the 1.0 record; the gaps
are items that moved: DXF (9.4) into 1.1 as 6.5, and Windows and macOS (9.8) into 1.0.

- **9.1 Thickness and wrap compensation** — the gusset problem. The most requested thing in every
  leathercraft forum, and the fold-line model already carries the fields for it.
- **9.2 Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
  over it.
- **9.3 Hardware library** — snaps, rivets, D-rings, zips and magnets, with real dimensions.
- **9.5 Boolean operations** — built together with 9.11, since both have to find and remove the loops
  an operation creates.
- **9.6 Seam pairing and hole-count parity** — catches a genuinely expensive mistake.
- **9.7 Templates** — a part saved to a library and inserted again (was 8.1), and parameterised ones
  ("card slot, width 95 mm").
- **9.9 Nesting on a hide** — needs boolean operations first.
- **9.10 A constraint solver** — only if real use proves the derivation graph insufficient.
- **9.11 Robust offsetting, written here** — the concave outlines analytic offsetting refuses, and
  stitching *across* a concave join such as a thumb scoop. Two bindings were tried and rejected
  (ADR 0008); it will be written, not bought.

Also later, each already decided in principle:
- **A general curve editor** (Béziers) on top of 3.9.
- **Grain direction** in the model, after which pagination may rotate a part.
- **Pieces gliding** between Design and Sheets.
- **Radial, angular, chained and baseline dimensions,** and dimensions between parts.
- **A screen-calibration step,** which would make 1:1 literal on screen too.
- **Draw tools in their role's colour** — still an open question in the UI decisions record.

## Not planned

Auto-update; material, cost or bill-of-materials metadata; a notes field separate from labels;
3D; an onboarding wizard; drag handles for values that are already typed; driving a printer
directly — LeatherCAD writes a PDF and the maker prints it from their own viewer.
